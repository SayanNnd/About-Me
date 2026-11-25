import { getAllPosts, getPostMarkdown, getSiteContent } from './content';
import type { BlogPostMeta, SiteContent } from '../types/content';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export type CmsSession =
  | { mode: 'local-dev'; label: string }
  | { mode: 'github'; label: string; userLogin: string; config: GitHubConfig };

export interface CmsLoadedData {
  site: SiteContent;
  posts: BlogPostMeta[];
  markdownBySlug: Record<string, string>;
}

export async function checkLocalCmsAvailable(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch('/__cms/status', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: boolean };
    return Boolean(data.available);
  } catch {
    return false;
  }
}

async function ghFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `GitHub API error (${res.status})`;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) msg = parsed.message;
    } catch {
      /* keep fallback */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function ghFetchRaw(url: string, token: string): Promise<string> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.text();
}

export async function verifyGitHubOwner(
  config: GitHubConfig,
  expectedOwnerHandle: string,
): Promise<{ userLogin: string }> {
  const user = await ghFetch<{ login: string }>('https://api.github.com/user', config.token);
  const expected = expectedOwnerHandle.trim().toLowerCase();
  if (expected && user.login.toLowerCase() !== expected) {
    throw new Error(`Access denied: signed in as "${user.login}", expected "${expectedOwnerHandle}".`);
  }

  const repo = await ghFetch<{ permissions?: { push?: boolean } }>(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    config.token,
  );
  if (!repo.permissions?.push) {
    throw new Error('Token does not have write (push) permission to this repository.');
  }

  return { userLogin: user.login };
}

export async function loadCmsData(session: CmsSession): Promise<CmsLoadedData> {
  if (session.mode === 'local-dev') {
    const site = getSiteContent();
    const posts = getAllPosts(true);
    const markdownBySlug: Record<string, string> = {};
    posts.forEach((p) => {
      markdownBySlug[p.slug] = getPostMarkdown(p.slug) ?? '';
    });
    return { site, posts, markdownBySlug };
  }

  const { token, owner, repo, branch } = session.config;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
  const refQ = `?ref=${encodeURIComponent(branch)}`;

  const [siteRaw, postsRaw] = await Promise.all([
    ghFetchRaw(`${base}/src/content/site.json${refQ}`, token),
    ghFetchRaw(`${base}/src/content/posts.json${refQ}`, token),
  ]);

  const site = JSON.parse(siteRaw) as SiteContent;
  const posts = JSON.parse(postsRaw) as BlogPostMeta[];

  const entries = await Promise.all(
    posts.map(async (p) => {
      try {
        const md = await ghFetchRaw(`${base}/src/content/posts/${encodeURIComponent(p.slug)}.md${refQ}`, token);
        return [p.slug, md] as const;
      } catch {
        return [p.slug, ''] as const;
      }
    }),
  );

  return {
    site,
    posts,
    markdownBySlug: Object.fromEntries(entries),
  };
}

interface TreeChange {
  path: string;
  content: string | null; // null deletes the file
}

async function commitGitHubChanges(
  config: GitHubConfig,
  message: string,
  changes: TreeChange[],
): Promise<string> {
  const { token, owner, repo, branch } = config;
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git`;

  const ref = await ghFetch<{ object: { sha: string } }>(
    `${api}/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  const baseCommitSha = ref.object.sha;

  const baseCommit = await ghFetch<{ tree: { sha: string } }>(
    `${api}/commits/${baseCommitSha}`,
    token,
  );

  const treeItems = await Promise.all(
    changes.map(async (change) => {
      if (change.content === null) {
        return {
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: null,
        };
      }
      const blob = await ghFetch<{ sha: string }>(`${api}/blobs`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: change.content, encoding: 'utf-8' }),
      });
      return {
        path: change.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      };
    }),
  );

  const newTree = await ghFetch<{ sha: string }>(`${api}/trees`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: treeItems,
    }),
  });

  const newCommit = await ghFetch<{ sha: string }>(`${api}/commits`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [baseCommitSha],
    }),
  });

  await ghFetch(`${api}/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return newCommit.sha;
}

export async function saveSiteContent(session: CmsSession, site: SiteContent): Promise<string> {
  if (session.mode === 'local-dev') {
    const res = await fetch('/__cms/save-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(site),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'Failed to save site.json locally.');
    }
    return 'Saved src/content/site.json locally.';
  }

  const sha = await commitGitHubChanges(session.config, 'chore(cms): update site content', [
    { path: 'src/content/site.json', content: JSON.stringify(site, null, 2) + '\n' },
  ]);
  return `Committed site.json (${sha.slice(0, 7)}) to GitHub. Deploy workflow will rebuild automatically.`;
}

export async function saveBlogPost(
  session: CmsSession,
  posts: BlogPostMeta[],
  meta: BlogPostMeta,
  markdown: string,
  previousSlug?: string,
): Promise<string> {
  if (session.mode === 'local-dev') {
    const res = await fetch('/__cms/save-blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta, content: markdown, previousSlug }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'Failed to save blog post locally.');
    }
    return `Saved src/content/posts/${meta.slug}.md locally.`;
  }

  const changes: TreeChange[] = [
    { path: 'src/content/posts.json', content: JSON.stringify(posts, null, 2) + '\n' },
    { path: `src/content/posts/${meta.slug}.md`, content: markdown },
  ];
  if (previousSlug && previousSlug !== meta.slug) {
    changes.push({ path: `src/content/posts/${previousSlug}.md`, content: null });
  }

  const sha = await commitGitHubChanges(
    session.config,
    `feat(blog): ${previousSlug ? 'update' : 'add'} post "${meta.title}"`,
    changes,
  );
  return `Committed "${meta.slug}.md" (${sha.slice(0, 7)}) to GitHub. Deploy workflow will rebuild automatically.`;
}

export async function deleteBlogPost(
  session: CmsSession,
  posts: BlogPostMeta[],
  slug: string,
): Promise<string> {
  if (session.mode === 'local-dev') {
    const res = await fetch('/__cms/delete-blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'Failed to delete blog post locally.');
    }
    return `Deleted ${slug}.md locally.`;
  }

  const sha = await commitGitHubChanges(session.config, `chore(blog): remove post "${slug}"`, [
    { path: 'src/content/posts.json', content: JSON.stringify(posts, null, 2) + '\n' },
    { path: `src/content/posts/${slug}.md`, content: null },
  ]);
  return `Deleted "${slug}.md" (${sha.slice(0, 7)}) on GitHub.`;
}
