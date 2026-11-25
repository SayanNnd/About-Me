import { sanitizeAccent } from './content';
import type { AccentColor, BlogPostMeta, ProjectItem, SiteContent } from '../types/content';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
}

export interface ResolvedProject extends ProjectItem {
  stars: number;
  forks: number;
  language: string;
  topics: string[];
  blogTitle: string;
  fromGitHub: boolean;
}

const ACCENT_CYCLE: AccentColor[] = ['coral', 'teal', 'lavender', 'amber', 'sky', 'pink', 'lime'];
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchGitHubRepos(username: string): Promise<GitHubRepo[]> {
  const cleanUser = username.trim();
  if (!cleanUser) return [];

  const cacheKey = `gh_repos:${cleanUser.toLowerCase()}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const hit = JSON.parse(raw) as { t: number; v: GitHubRepo[] };
      if (Date.now() - hit.t < CACHE_TTL_MS && Array.isArray(hit.v)) {
        return hit.v;
      }
    }
  } catch {
    /* ignore storage issues */
  }

  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(cleanUser)}/repos?per_page=100&type=owner&sort=updated`,
    {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github+json' },
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub API HTTP ${res.status}`);
  }

  const repos = (await res.json()) as GitHubRepo[];
  const own = repos.filter((r) => !r.fork);

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: own }));
  } catch {
    /* ignore storage quota */
  }

  return own;
}

function inferSkillSlugs(language: string, topics: string[], site: SiteContent): string[] {
  const tokens = [language, ...topics].map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return [];

  const matched: string[] = [];
  for (const skill of site.skills.items) {
    const names = [skill.slug, skill.label, ...skill.aliases].map((s) => s.trim().toLowerCase());
    const hit = tokens.some((tok) => names.includes(tok));
    if (hit) matched.push(skill.slug);
  }
  return matched;
}

function buildBlogRepoMap(
  site: SiteContent,
  posts: BlogPostMeta[],
): Map<string, { slug: string; title: string }> {
  const postBySlug = new Map(posts.map((p) => [p.slug, p]));
  const map = new Map<string, { slug: string; title: string }>();

  // 1. Direct connections declared on blog posts (projectRepo)
  for (const post of posts) {
    const repo = post.projectRepo?.trim().toLowerCase();
    if (repo) {
      map.set(repo, { slug: post.slug, title: post.title });
    }
  }

  // 2. Overrides declared in site.json (projects.overrides)
  for (const ov of site.projects.overrides || []) {
    const repo = ov.repo?.trim().toLowerCase();
    const slug = ov.blogSlug?.trim();
    if (repo && slug && postBySlug.has(slug)) {
      map.set(repo, { slug, title: postBySlug.get(slug)!.title });
    }
  }

  return map;
}

export async function loadResolvedProjects(
  site: SiteContent,
  posts: BlogPostMeta[],
): Promise<{ projects: ResolvedProject[]; source: 'github' | 'fallback' }> {
  const username =
    site.projects.githubUsername?.trim() ||
    extractGithubUsername(site) ||
    site.meta.repoOwner;

  const blogByRepo = buildBlogRepoMap(site, posts);
  const postTitleBySlug = new Map(posts.map((p) => [p.slug, p.title]));
  const overrideMap = new Map(
    (site.projects.overrides || []).map((ov) => [ov.repo.trim().toLowerCase(), ov]),
  );

  try {
    const repos = await fetchGitHubRepos(username);
    if (repos.length > 0) {
      const mapped: ResolvedProject[] = repos.map((repo, idx) => {
        const keyName = repo.name.toLowerCase();
        const keyFull = repo.full_name.toLowerCase();
        const ov = overrideMap.get(keyName) || overrideMap.get(keyFull);
        const blogRef = blogByRepo.get(keyName) || blogByRepo.get(keyFull);
        const lang = repo.language || 'Markdown / Config';
        const topics = Array.isArray(repo.topics) ? repo.topics : [];

        const defaultTech = [
          `Language: ${lang}`,
          repo.stargazers_count > 0 ? `\u2605 ${repo.stargazers_count}` : '',
        ]
          .filter(Boolean)
          .join(' \u00B7 ');

        return {
          id: repo.name.toLowerCase(),
          title: ov?.title?.trim() || `${repo.name.toLowerCase()}/`,
          badge: ov?.badge?.trim() || (repo.archived ? 'ARCHIVED' : ''),
          description:
            ov?.description?.trim() ||
            repo.description?.trim() ||
            `A ${lang} project on GitHub.`,
          tech: ov?.tech?.trim() || defaultTech,
          skills: inferSkillSlugs(lang, topics, site),
          accent: sanitizeAccent(ov?.accent, ACCENT_CYCLE[idx % ACCENT_CYCLE.length]),
          sourceUrl: repo.html_url,
          blogSlug: blogRef?.slug || '',
          blogTitle: blogRef?.title || '',
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: lang,
          topics,
          fromGitHub: true,
        };
      });

      mapped.sort((a, b) => {
        const aHasBlog = a.blogSlug ? 1 : 0;
        const bHasBlog = b.blogSlug ? 1 : 0;
        if (aHasBlog !== bHasBlog) return bHasBlog - aHasBlog;
        if (a.stars !== b.stars) return b.stars - a.stars;
        if (a.forks !== b.forks) return b.forks - a.forks;
        return a.title.localeCompare(b.title);
      });

      return { projects: mapped, source: 'github' };
    }
  } catch {
    /* fallback below */
  }

  const fallback: ResolvedProject[] = (site.projects.fallbackItems || []).map((item) => ({
    ...item,
    stars: 0,
    forks: 0,
    language: item.tech,
    topics: [],
    blogTitle: item.blogSlug ? postTitleBySlug.get(item.blogSlug) || '' : '',
    fromGitHub: false,
  }));

  fallback.sort((a, b) => (b.blogSlug ? 1 : 0) - (a.blogSlug ? 1 : 0));
  return { projects: fallback, source: 'fallback' };
}

export function extractGithubUsername(site: SiteContent): string {
  const gh = site.contact.items.find((c) => c.key.trim().toLowerCase() === 'github');
  if (!gh) return '';
  try {
    return new URL(gh.href).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
}

export function projectMatchesLanguageQuery(
  project: ResolvedProject,
  query: string,
  site: SiteContent,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  // Match against configured skills (slug, label, aliases)
  const matchedSkill = site.skills.items.find((s) =>
    [s.slug, s.label, ...s.aliases].some((name) => name.trim().toLowerCase() === q),
  );

  if (matchedSkill) {
    if (project.skills.includes(matchedSkill.slug)) return true;
    const names = [matchedSkill.slug, matchedSkill.label, ...matchedSkill.aliases].map((n) =>
      n.trim().toLowerCase(),
    );
    const haystack = [project.language, project.tech, ...project.topics]
      .join(' ')
      .toLowerCase();
    return names.some((n) => haystack.includes(n));
  }

  // Otherwise try matching language / topics / tech directly
  const lang = project.language.toLowerCase();
  if (lang === q || lang.includes(q)) return true;
  if (project.topics.some((t) => t.toLowerCase().includes(q))) return true;
  if (project.tech.toLowerCase().includes(q)) return true;
  return false;
}
