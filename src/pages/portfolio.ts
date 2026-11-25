import { getAllPosts, getSiteContent, sanitizeAccent } from '../lib/content';
import { $, accentVar, applyDocumentTheme, make } from '../lib/dom';
import { resolveFuzzyTarget } from '../lib/fuzzy';
import {
  extractGithubUsername,
  loadResolvedProjects,
  projectMatchesLanguageQuery,
  type ResolvedProject,
} from '../lib/github-projects';
import { pageHref, postHref, resolveAsset } from '../lib/paths';
import type { SiteContent } from '../types/content';

interface StatCacheEntry<T> {
  t: number;
  v: T;
}

interface GithubStats {
  repos: number;
  stars: number;
  followers: number;
  langs: string[];
}

interface LeetcodeStats {
  status?: string;
  totalSolved: number;
  totalQuestions?: number;
  easySolved?: number;
  totalEasy?: number;
  mediumSolved?: number;
  totalMedium?: number;
  hardSolved?: number;
  totalHard?: number;
  ranking?: number;
}

function cmdButton(label: string, cmd: string, className = 'cmdlink', quiet = false): HTMLButtonElement {
  const b = make('button', className, label);
  b.type = 'button';
  b.dataset[quiet ? 'quiet' : 'cmd'] = cmd;
  return b;
}

const textNode = (t: string): HTMLParagraphElement => make('p', '', t);
const errNode = (t: string): HTMLParagraphElement => make('p', 'err', t);
const hintNode = (t: string): HTMLParagraphElement => make('p', 'hint', t);
const noteNode = (t: string): HTMLParagraphElement => make('p', 'note', t);

function createPromptLine(
  user: string,
  dir: string,
  commandText: string,
  typing = false,
): HTMLParagraphElement {
  const p = make('p', 'prompt');
  const cmdSpan = make('span', typing ? 'type cmd' : 'cmd', commandText);
  if (typing) {
    cmdSpan.style.setProperty('--n', String(commandText.length));
    cmdSpan.style.setProperty('--d', '.3s');
  }
  p.append(
    make('span', 'u', user),
    make('span', 'dir', dir),
    make('span', 'sym', '\u276F'),
    ' ',
    cmdSpan,
  );
  return p;
}

function buildFastfetchView(site: SiteContent, animate: boolean): HTMLElement {
  const wrap = make('div', animate ? 'fetch' : 'fetch now');
  const img = document.createElement('img');
  img.className = 'logo-img';
  img.src = resolveAsset(site.fastfetch.logoSrc);
  img.alt = site.fastfetch.logoAlt;

  const info = make('div', 'info');
  info.append(make('p', 'head', site.fastfetch.head), make('div', 'sep'));
  site.fastfetch.rows.forEach((row) => {
    const p = make('p');
    p.append(make('span', 'k', row.key), row.value);
    info.append(p);
  });

  const swatches = make('div', 'swatches');
  swatches.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 8; i++) {
    swatches.append(make('span', `s${i}`));
  }
  info.append(swatches);
  wrap.append(img, info);
  return wrap;
}

function buildAboutView(site: SiteContent): HTMLElement {
  const wrap = make('div', 'out md');
  const h1 = make('h1');
  h1.append(make('span', 'hash', '# '), site.about.heading);
  wrap.append(h1);

  site.about.paragraphs.forEach((paragraph) => {
    wrap.append(make('p', '', paragraph));
  });

  if (site.about.ctaLabel && site.about.ctaCmd) {
    wrap.append(cmdButton(site.about.ctaLabel, site.about.ctaCmd, 'button'));
  }
  return wrap;
}

function buildSkillsView(site: SiteContent): DocumentFragment {
  const frag = document.createDocumentFragment();
  const ul = make('ul', 'out ls');

  site.skills.items.forEach((skill) => {
    const li = make('li');
    li.dataset.skill = skill.slug;
    li.dataset.aliases = skill.aliases.join(',');
    li.append(cmdButton(skill.label, `ls skills/${skill.slug}`, ''));
    ul.append(li);
  });

  const hintEl = make('p', 'hint');
  hintEl.append(
    `${site.skills.hintPrefix} `,
    make('code', '', site.skills.hintCommand),
    '.',
  );
  frag.append(ul, hintEl);
  return frag;
}

function buildProjectCard(project: ResolvedProject): HTMLElement {
  const card = make('article', 'project');
  card.dataset.skills = project.skills.join(' ');
  card.style.setProperty('--accent', accentVar(sanitizeAccent(project.accent)));

  const h2 = make('h2');
  h2.append(project.title);
  if (project.badge) {
    h2.append(' ', make('span', 'badge', project.badge));
  } else if (project.blogSlug) {
    h2.append(' ', make('span', 'badge', 'BLOG'));
  }

  card.append(h2, make('p', '', project.description), make('p', 'tech', project.tech));

  const hasBlog = Boolean(project.blogSlug);
  const hasSource = Boolean(project.sourceUrl);

  if (hasBlog && hasSource) {
    const actions = make('div', 'project-actions');
    const blogLink = make('a', 'src', 'Read blog post \u2192');
    blogLink.href = postHref(project.blogSlug);
    if (project.blogTitle) blogLink.title = project.blogTitle;
    const srcLink = make('a', 'src', 'View source');
    srcLink.href = project.sourceUrl;
    srcLink.target = '_blank';
    srcLink.rel = 'noopener noreferrer';
    actions.append(blogLink, srcLink);
    card.append(actions);
  } else if (hasBlog) {
    const blogLink = make('a', 'src', 'Read blog post \u2192');
    blogLink.href = postHref(project.blogSlug);
    card.append(blogLink);
  } else if (hasSource) {
    const srcLink = make('a', 'src', 'View source');
    srcLink.href = project.sourceUrl;
    srcLink.target = '_blank';
    srcLink.rel = 'noopener noreferrer';
    card.append(srcLink);
  }

  return card;
}

function renderProjectsInto(
  container: HTMLElement,
  site: SiteContent,
  projects: ResolvedProject[],
  options: { showHeading?: boolean; limit?: number } = {},
): void {
  const limit = Math.max(1, options.limit ?? site.projects.defaultLimit ?? 3);
  let expanded = false;

  container.replaceChildren();

  if (options.showHeading !== false) {
    const header = make('div', 'md projects-intro');
    const h1 = make('h1');
    h1.append(make('span', 'hash', '# '), site.projects.heading);
    header.append(h1);
    if (site.projects.intro) {
      header.append(make('p', '', site.projects.intro));
    }
    container.append(header);
  }

  const grid = make('div', 'projects');
  container.append(grid);

  const toggleWrap = make('div', 'projects-toggle-wrap');
  const toggleBtn = make('button', 'button projects-toggle-btn');
  toggleBtn.type = 'button';

  function syncCards(): void {
    const visible = expanded ? projects : projects.slice(0, limit);
    grid.replaceChildren(...visible.map((p) => buildProjectCard(p)));

    if (projects.length > limit) {
      toggleBtn.textContent = expanded
        ? `Show top ${limit} only`
        : `Show all projects (${projects.length})`;
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      if (!toggleWrap.isConnected) container.append(toggleWrap);
      if (!toggleBtn.isConnected) toggleWrap.append(toggleBtn);
    } else {
      toggleWrap.remove();
    }
  }

  toggleBtn.addEventListener('click', () => {
    expanded = !expanded;
    syncCards();
  });

  syncCards();
}

function buildContactView(site: SiteContent): HTMLElement {
  const wrap = make('div', 'out contact');
  site.contact.items.forEach((item) => {
    const p = make('p');
    const link = make('a', '', item.label);
    link.href = item.href;
    if (!item.href.startsWith('mailto:')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    p.append(make('span', 'k', item.key), make('span', 'arrow', '->'), link);
    wrap.append(p);
  });
  return wrap;
}

function buildRoadmapView(site: SiteContent): HTMLElement {
  const wrap = make('div', 'out md roadmap');
  const h1 = make('h1');
  h1.append(make('span', 'hash', '# '), site.roadmap.heading);
  wrap.append(h1);

  site.roadmap.sections.forEach((sec) => {
    const h2 = make('h2', '', sec.title);
    h2.style.setProperty('--c', accentVar(sanitizeAccent(sec.color)));
    const ul = make('ul');
    sec.items.forEach((entry) => ul.append(make('li', '', entry)));
    wrap.append(h2, ul);
  });

  return wrap;
}

function buildBlogsView(site: SiteContent): HTMLElement {
  const posts = getAllPosts(false);
  const featured = posts.filter((p) => p.featuredOnHome);
  const visible = featured.length > 0 ? featured : posts.slice(0, 3);

  const wrap = make('div', 'out md');
  const h1 = make('h1');
  h1.append(make('span', 'hash', '# '), site.blog.heading);
  wrap.append(h1, make('p', '', site.blog.intro));

  if (visible.length === 0) {
    wrap.append(hintNode(site.blog.emptyHint));
  } else {
    const grid = make('div', 'projects blog-preview-grid');
    visible.forEach((post) => {
      const card = make('article', 'project');
      card.style.setProperty('--accent', accentVar(sanitizeAccent(post.accent, 'coral')));
      card.append(
        make('h2', '', post.title),
        make('p', '', post.subtitle),
        make(
          'div',
          'tech',
          `${post.date} \u00B7 ${post.readTime}${post.tags.length ? ` \u00B7 ${post.tags.join(', ')}` : ''}`,
        ),
      );
      const actions = make('div', 'project-actions');
      const readLink = make('a', 'src', 'Read post \u2192');
      readLink.href = postHref(post.slug);
      const allLink = make('a', 'src', 'Visit ~/blogs \u2192');
      allLink.href = pageHref('blog/index.html');
      actions.append(readLink, allLink);
      card.append(actions);
      grid.append(card);
    });
    wrap.append(grid);
  }

  const hint = make('p', 'hint blog-preview-hint');
  const blogAnchor = make('a', '', '~/blogs');
  blogAnchor.href = pageHref('blog/index.html');
  hint.append('Run ', make('code', '', 'open blogs'), ' or visit ', blogAnchor, ' for the full reading experience.');
  wrap.append(hint);
  return wrap;
}

function init(): void {
  const site = getSiteContent();
  const posts = getAllPosts(false);

  applyDocumentTheme(site.meta.siteTitle, site.meta.themeColor);

  const toolbarHint = $('.toolbar-hint');
  if (toolbarHint) toolbarHint.textContent = site.terminal.toolbarHint;

  const navPortfolio = $('#nav-portfolio');
  if (navPortfolio) navPortfolio.textContent = site.terminal.navPortfolioLabel;

  const navBlog = $('#nav-blog');
  if (navBlog) {
    navBlog.textContent = site.terminal.navBlogLabel;
    navBlog.setAttribute('href', pageHref('blog/index.html'));
  }

  const footerCopy = $('#footer-copy');
  if (footerCopy) footerCopy.textContent = site.terminal.footerCopyright;

  const footerKeys = $('#footer-keys');
  if (footerKeys) footerKeys.textContent = site.terminal.footerKeysHint;

  const inputUser = $('#input-user');
  if (inputUser) inputUser.textContent = site.terminal.user;
  const inputDir = $('#input-dir');
  if (inputDir) inputDir.textContent = site.terminal.homeDir;

  const screen = $('#screen') as HTMLElement | null;
  const log = $('#history') as HTMLElement | null;
  const inputLine = $('.input-line') as HTMLElement | null;
  const input = $('#cmd') as HTMLInputElement | null;
  const menuBtn = $('#menu-btn') as HTMLButtonElement | null;
  const menu = $('#menu') as HTMLElement | null;

  if (!screen || !log || !inputLine || !input || !menuBtn || !menu) return;

  const canHover = matchMedia('(hover: hover)').matches;
  const scrollBehavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

  let projectsPromise: Promise<{ projects: ResolvedProject[]; source: 'github' | 'fallback' }> | null = null;
  function getProjects(): Promise<{ projects: ResolvedProject[]; source: 'github' | 'fallback' }> {
    projectsPromise ??= loadResolvedProjects(site, posts);
    return projectsPromise;
  }

  function buildProjectsAsyncView(showHeading = true): HTMLElement {
    const wrap = make('div', 'out');
    const loading = make('p', 'hint', 'Fetching projects from GitHub...');
    wrap.append(loading);

    void getProjects().then(({ projects }) => {
      renderProjectsInto(wrap, site, projects, { showHeading });
    });

    return wrap;
  }

  function renderInitialHistory(): void {
    const blocks: Array<{ id: string; cmd: string; dir: string; node: Node; typing?: boolean }> = [
      { id: 'fetch', cmd: 'fastfetch', dir: site.terminal.homeDir, node: buildFastfetchView(site, true), typing: true },
      { id: 'about', cmd: 'cat about.md', dir: site.terminal.homeDir, node: buildAboutView(site) },
      { id: 'skills', cmd: 'ls ~/skills', dir: site.terminal.homeDir, node: buildSkillsView(site) },
      { id: 'projects', cmd: 'ls ~/projects', dir: site.terminal.homeDir, node: buildProjectsAsyncView(true) },
      { id: 'contact', cmd: 'cat contact.txt', dir: site.terminal.homeDir, node: buildContactView(site) },
    ];

    log!.replaceChildren();
    blocks.forEach((b) => {
      const section = make('section', 'block');
      section.id = b.id;
      section.append(createPromptLine(site.terminal.user, b.dir, b.cmd, b.typing), b.node);
      log!.append(section);
    });
  }

  renderInitialHistory();

  const skillList = site.skills.items.map((s) => ({
    slug: s.slug,
    label: s.label,
    names: [s.slug, s.label, ...s.aliases].map((x) => x.trim().toLowerCase()).filter(Boolean),
  }));

  const findSkill = (query: string) => {
    const q = query.trim().toLowerCase();
    const exact = skillList.find((s) => s.names.includes(q));
    if (exact) return exact;
    const allNames = skillList.flatMap((s) => s.names);
    const fuzzy = resolveFuzzyTarget(q, allNames);
    return fuzzy ? skillList.find((s) => s.names.includes(fuzzy)) : undefined;
  };

  const links: Record<string, string> = Object.fromEntries(
    site.contact.items.map((c) => [c.key.trim().toLowerCase(), c.href]),
  );
  links.blogs = pageHref('blog/index.html');

  const lastSegment = (href: string): string => {
    try {
      return new URL(href).pathname.split('/').filter(Boolean).pop() || '';
    } catch {
      return '';
    }
  };
  const githubUser = site.projects.githubUsername?.trim() || extractGithubUsername(site);
  const leetcodeUser = links.leetcode ? lastSegment(links.leetcode) : '';

  const quick = [
    { cmd: 'home', desc: 'Show the whole page again' },
    { cmd: 'fastfetch', desc: 'Info card' },
    { cmd: 'cat about.md', desc: 'Who I am' },
    { cmd: 'cat roadmap.md', desc: 'Where I am headed' },
    { cmd: 'ls skills', desc: 'My skills, click one for matching GitHub projects' },
    { cmd: 'ls projects', desc: 'Top GitHub projects & connected blogs' },
    { cmd: 'ls blogs', desc: 'Technical write-ups and blog posts' },
    { cmd: 'ls stats', desc: 'Live GitHub and LeetCode stats' },
    { cmd: 'cat contact.txt', desc: 'Email, GitHub, LinkedIn, LeetCode' },
    { cmd: 'help', desc: 'List every command' },
    { cmd: 'clear', desc: 'Clear the screen' },
  ];

  const homeSteps: Array<[string, () => Node]> = [
    ['fastfetch', () => buildFastfetchView(site, false)],
    ['cat about.md', () => buildAboutView(site)],
    ['ls ~/skills', () => buildSkillsView(site)],
    ['ls ~/projects', () => buildProjectsAsyncView(true)],
    ['cat contact.txt', () => buildContactView(site)],
  ];

  function print(commandText: string, ...nodes: Node[]): HTMLElement {
    const entry = make('section', 'block entry');
    entry.append(createPromptLine(site.terminal.user, site.terminal.homeDir, commandText), ...nodes);
    log!.append(entry);
    return entry;
  }

  function reveal(entry: HTMLElement): void {
    const fits = entry.offsetHeight + inputLine!.offsetHeight < screen!.clientHeight;
    if (fits) {
      screen!.scrollTo({ top: screen!.scrollHeight, behavior: scrollBehavior });
    } else {
      const top =
        entry.getBoundingClientRect().top -
        screen!.getBoundingClientRect().top +
        screen!.scrollTop -
        8;
      screen!.scrollTo({ top, behavior: scrollBehavior });
    }
  }

  function clearScreen(): void {
    log!.replaceChildren();
    screen!.scrollTop = 0;
  }

  function helpView(): HTMLElement {
    const wrap = make('div', 'out help');
    const rows = [
      ...quick.map((q) => ({ ...q, runnable: true })),
      { cmd: 'whoami', desc: 'Who is logged in', runnable: true },
      { cmd: 'pwd', desc: 'Where you are', runnable: true },
      { cmd: 'ls skills/<lang>', desc: 'GitHub projects matching a language/skill, e.g. ls skills/c-cpp', runnable: false },
      { cmd: 'ls stats/<name>', desc: 'Only one service: github or leetcode (or stats <name>)', runnable: false },
      { cmd: 'open <name>', desc: `Open ${Object.keys(links).join(', ')}`, runnable: false },
    ];
    rows.forEach((row) => {
      const p = make('p');
      const k = make('span', 'k');
      if (row.runnable) k.append(cmdButton(row.cmd, row.cmd));
      else k.textContent = row.cmd;
      p.append(k, row.desc);
      wrap.append(p);
    });
    wrap.append(
      hintNode(
        'Tip: Tab completes, arrows recall history, and commands tolerate typos (e.g. projec, blog, stat, skils).',
      ),
    );
    return wrap;
  }

  const files = ['about.md', 'roadmap.md', 'contact.txt'];

  function dirListing(): HTMLElement {
    const wrap = make('div', 'out files');
    (
      [
        ['about.md', 'cat about.md', 'file'],
        ['roadmap.md', 'cat roadmap.md', 'file'],
        ['skills/', 'ls skills', 'dir'],
        ['projects/', 'ls projects', 'dir'],
        ['blogs/', 'ls blogs', 'dir'],
        ['stats/', 'ls stats', 'dir'],
        ['contact.txt', 'cat contact.txt', 'file'],
      ] as const
    ).forEach(([label, cmd, kind]) => wrap.append(cmdButton(label, cmd, `cmdlink ${kind}`)));
    return wrap;
  }

  function skillProjects(query: string): Node[] {
    const skill = findSkill(query);
    const label = skill ? skill.label : query.trim();

    const wrap = make('div', 'out');
    const loading = make('p', 'hint', `Searching GitHub projects for ${label}...`);
    wrap.append(loading);

    void getProjects().then(({ projects }) => {
      const matched = projects.filter((p) =>
        projectMatchesLanguageQuery(p, skill ? skill.slug : query, site),
      );
      if (!matched.length) {
        wrap.replaceChildren(
          noteNode(`No GitHub projects found matching "${label}".`),
          hintNode(`Configured skills: ${skillList.map((s) => s.slug).join(', ')} — or run ls projects.`),
        );
        return;
      }
      const noteEl = noteNode(`${matched.length} project${matched.length === 1 ? '' : 's'} matching ${label}`);
      const resultsWrap = make('div', 'out');
      renderProjectsInto(resultsWrap, site, matched, { showHeading: false, limit: matched.length });
      wrap.replaceChildren(noteEl, resultsWrap);
    });

    return [wrap];
  }

  async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const hit = JSON.parse(raw) as StatCacheEntry<T>;
        if (Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
      }
    } catch {
      /* storage unavailable */
    }
    const v = await loader();
    try {
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
    } catch {
      /* ignore */
    }
    return v;
  }

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (res.status === 403 || res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.json() as Promise<T>;
  }

  async function loadGithub(): Promise<GithubStats> {
    const [user, repos] = await Promise.all([
      getJson<{ public_repos: number; followers: number }>(`https://api.github.com/users/${githubUser}`),
      getJson<Array<{ fork: boolean; language: string | null; stargazers_count: number }>>(
        `https://api.github.com/users/${githubUser}/repos?per_page=100&type=owner`,
      ),
    ]);
    const own = repos.filter((r) => !r.fork);
    const langs: Record<string, number> = {};
    own.forEach((r) => {
      if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
    });
    return {
      repos: user.public_repos,
      stars: own.reduce((sum, r) => sum + r.stargazers_count, 0),
      followers: user.followers,
      langs: Object.entries(langs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, n]) => `${name} (${n})`),
    };
  }

  const leetcodeSources = [
    (u: string) => `https://leetcode-stats.tashif.codes/${u}`,
    (u: string) => `https://leetcode-stats-api.herokuapp.com/${u}`,
  ];

  async function loadLeetcode(): Promise<LeetcodeStats> {
    for (const source of leetcodeSources) {
      try {
        const d = await getJson<LeetcodeStats>(source(leetcodeUser));
        if (typeof d.totalSolved === 'number' && d.status !== 'error') return d;
      } catch {
        /* try next mirror */
      }
    }
    throw new Error('unreachable');
  }

  const fmt = (n: number | undefined): string => Number(n || 0).toLocaleString('en-US');

  function statRow(label: string, value: string | Node): HTMLParagraphElement {
    const p = make('p');
    p.append(make('span', 'k', label), value instanceof Node ? value : String(value));
    return p;
  }

  function difficultyRow(label: string, solved: number, total: number | undefined, color: string): HTMLParagraphElement {
    const frag = document.createDocumentFragment();
    frag.append(total ? `${fmt(solved)} / ${fmt(total)}` : fmt(solved));
    if (total) {
      const bar = make('span', 'bar');
      const fill = make('i');
      fill.style.width = `${Math.min(100, (solved / total) * 100)}%`;
      fill.style.background = `var(--${color})`;
      bar.append(fill);
      frag.append(bar);
    }
    return statRow(label, frag);
  }

  function githubRows(d: GithubStats): HTMLParagraphElement[] {
    const rows = [
      statRow('Repos', fmt(d.repos)),
      statRow('Stars', fmt(d.stars)),
      statRow('Followers', fmt(d.followers)),
    ];
    if (d.langs.length) rows.push(statRow('Top langs', d.langs.join(', ')));
    return rows;
  }

  function leetcodeRows(d: LeetcodeStats): HTMLParagraphElement[] {
    const rows = [
      statRow(
        'Solved',
        d.totalQuestions ? `${fmt(d.totalSolved)} / ${fmt(d.totalQuestions)}` : fmt(d.totalSolved),
      ),
    ];
    if (typeof d.easySolved === 'number') rows.push(difficultyRow('Easy', d.easySolved, d.totalEasy, 'teal'));
    if (typeof d.mediumSolved === 'number') rows.push(difficultyRow('Medium', d.mediumSolved, d.totalMedium, 'amber'));
    if (typeof d.hardSolved === 'number') rows.push(difficultyRow('Hard', d.hardSolved, d.totalHard, 'coral'));
    if (d.ranking) rows.push(statRow('Ranking', fmt(d.ranking)));
    return rows;
  }

  function statBlock<T>(service: string, loader: () => Promise<T>, toRows: (data: T) => HTMLParagraphElement[]): HTMLElement {
    const href = links[service] || `https://github.com/${githubUser}`;
    const block = make('div', 'stat-block');
    const loading = make('p', 'hint', 'Fetching...');
    const url = new URL(href);
    block.append(
      make('p', 'head', `${url.host}${url.pathname}`.replace(/\/$/, '')),
      make('div', 'sep'),
      loading,
    );

    cached(`stats:${service}`, loader)
      .then((data) => loading.replaceWith(...toRows(data)))
      .catch((e: unknown) => {
        const why =
          e instanceof Error && e.message === 'rate-limited'
            ? 'Rate limit reached. Try again in a bit.'
            : 'Could not load live stats right now.';
        loading.replaceWith(errNode(why), hintNode(`Run open ${service} to see the profile directly.`));
      })
      .finally(() => {
        const last = log?.lastElementChild as HTMLElement | null;
        if (last && last.contains(block)) reveal(last);
      });

    return block;
  }

  function buildStatsView(which = ''): Node[] {
    const raw = which.trim().toLowerCase();
    const resolved = raw ? resolveFuzzyTarget(raw, ['github', 'leetcode'], { gh: 'github', lc: 'leetcode' }) : '';
    if (raw && !resolved) return [errNode('Usage: ls stats [github|leetcode] or stats [github|leetcode]')];

    const container = make('div', 'out md');
    const h1 = make('h1');
    h1.append(make('span', 'hash', '# '), site.stats.heading);
    container.append(h1);
    if (site.stats.intro) container.append(make('p', '', site.stats.intro));

    const wrap = make('div', 'stats stats-grid');
    if ((!resolved || resolved === 'github') && githubUser) {
      wrap.append(statBlock('github', loadGithub, githubRows));
    }
    if ((!resolved || resolved === 'leetcode') && leetcodeUser) {
      wrap.append(statBlock('leetcode', loadLeetcode, leetcodeRows));
    }

    if (!wrap.children.length) return [errNode('No profile links found in the contact section.')];
    container.append(wrap);
    return [container];
  }

  function splitPath(arg: string): { dir: string; rest: string } {
    const p = arg.replace(/^(~|\.)?\/?/, '').replace(/\/+$/, '');
    const m = p.match(/^([^/\s]+)[/\s]*(.*)$/);
    return m ? { dir: m[1].toLowerCase(), rest: m[2] } : { dir: '', rest: '' };
  }

  const LS_DIR_ALIASES: Record<string, string> = {
    skill: 'skills',
    project: 'projects',
    blog: 'blogs',
    stat: 'stats',
    about: 'about.md',
    roadmap: 'roadmap.md',
    contact: 'contact.txt',
  };

  const LS_TARGETS = ['skills', 'projects', 'blogs', 'stats', 'about.md', 'roadmap.md', 'contact.txt'];

  const CAT_ALIASES: Record<string, string> = {
    about: 'about.md',
    roadmap: 'roadmap.md',
    contact: 'contact.txt',
    blog: 'blogs',
    stat: 'stats',
    project: 'projects',
  };

  const CAT_TARGETS = ['about.md', 'roadmap.md', 'contact.txt', 'blogs', 'projects', 'stats'];

  const handlers: Record<string, (args: string[]) => Node[] | null> = {
    help: () => [helpView()],

    home: () => {
      clearScreen();
      homeSteps.forEach(([cmd, builder]) => print(cmd, builder()));
      return null;
    },

    clear: () => {
      clearScreen();
      return null;
    },

    fastfetch: () => [buildFastfetchView(site, false)],
    whoami: () => [textNode(site.terminal.whoamiName), hintNode(site.terminal.whoamiHint)],
    pwd: () => [textNode(site.terminal.pwd)],

    about: () => [buildAboutView(site)],
    roadmap: () => [buildRoadmapView(site)],
    blogs: () => [buildBlogsView(site)],
    contact: () => [buildContactView(site)],
    skills: ([query]) => (query ? skillProjects(query) : [buildSkillsView(site)]),
    projects: (args) => (args.length ? skillProjects(args.join(' ')) : [buildProjectsAsyncView(true)]),
    stats: ([which = '']) => buildStatsView(which),

    cat: ([file = '']) => {
      const clean = file.replace(/^(~\/|\.\/)/, '').toLowerCase();
      if (!clean) return [errNode('cat: missing file. Try cat about.md, cat roadmap.md or cat contact.txt')];

      if (clean.startsWith('blog/') || clean.startsWith('blogs/')) {
        return [buildBlogsView(site)];
      }

      const resolved = resolveFuzzyTarget(clean, CAT_TARGETS, CAT_ALIASES);
      if (resolved === 'about.md') return [buildAboutView(site)];
      if (resolved === 'roadmap.md') return [buildRoadmapView(site)];
      if (resolved === 'contact.txt') return [buildContactView(site)];
      if (resolved === 'blogs') return [buildBlogsView(site)];
      if (resolved === 'projects') return [buildProjectsAsyncView(true)];
      if (resolved === 'stats') return buildStatsView();

      const bare = clean.replace(/\/$/, '');
      if (['skills'].includes(bare)) {
        return [errNode(`cat: ${file}: Is a directory`), hintNode(`Try ls ${bare}`)];
      }
      return [errNode(`cat: ${file}: No such file or directory`)];
    },

    ls: (args) => {
      const target = args.filter((a) => !a.startsWith('-')).join(' ');
      const { dir, rest } = splitPath(target);
      if (!dir) return [dirListing()];

      const resolvedDir = resolveFuzzyTarget(dir, LS_TARGETS, LS_DIR_ALIASES);
      if (resolvedDir === 'skills') return rest ? skillProjects(rest) : [buildSkillsView(site)];
      if (resolvedDir === 'projects') return rest ? skillProjects(rest) : [buildProjectsAsyncView(true)];
      if (resolvedDir === 'blogs') return [buildBlogsView(site)];
      if (resolvedDir === 'stats') return buildStatsView(rest);
      if (resolvedDir === 'about.md') return [buildAboutView(site)];
      if (resolvedDir === 'roadmap.md') return [buildRoadmapView(site)];
      if (resolvedDir === 'contact.txt') return [buildContactView(site)];
      if (files.includes(dir)) return [textNode(dir)];

      return [errNode(`ls: cannot access '${target}': No such file or directory`)];
    },

    cd: ([target = '']) => {
      const clean = target.replace(/^(~\/|\.\/)/, '').replace(/\/$/, '').toLowerCase();
      if (clean === 'blog' || clean === 'blogs') {
        location.href = pageHref('blog/index.html');
        return [textNode('Entering ~/blogs...')];
      }
      return [textNode('This is a terminal portfolio. Try ls, ls blogs, ls projects, or cd blogs.')];
    },

    open: ([name = '']) => {
      const raw = name.trim().toLowerCase();
      const key = resolveFuzzyTarget(raw, Object.keys(links), { blog: 'blogs', gh: 'github', lc: 'leetcode' });
      if (!key || !Object.hasOwn(links, key)) {
        return [errNode(`Usage: open <${Object.keys(links).join('|')}>`)];
      }
      if (key === 'email' || key === 'blogs') location.href = links[key];
      else window.open(links[key], '_blank', 'noopener');
      return [textNode(`Opening ${key}...`)];
    },

    sudo: () => [errNode('sudo: permission denied. This portfolio is read-only.')],
  };

  const COMMAND_ALIASES: Record<string, string> = {
    blog: 'blogs',
    project: 'projects',
    stat: 'stats',
    skill: 'skills',
    neofetch: 'fastfetch',
    fetch: 'fastfetch',
    cls: 'clear',
    dir: 'ls',
    contacts: 'contact',
    roadmaps: 'roadmap',
  };

  const COMMAND_NAMES = Object.keys(handlers);

  const past: string[] = [];
  let pastIndex = 0;
  let draft = '';

  function run(raw: string): void {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) return;

    if (past[past.length - 1] !== line) past.push(line);
    pastIndex = past.length;
    draft = '';

    const [name, ...args] = line.split(' ');
    const resolvedCmd = resolveFuzzyTarget(name, COMMAND_NAMES, COMMAND_ALIASES);
    const nodes = resolvedCmd
      ? handlers[resolvedCmd](args)
      : [errNode(`zsh: command not found: ${name}`), hintNode('Type help to see what you can run.')];

    if (nodes) reveal(print(line, ...nodes));
  }

  function runQuiet(raw: string): void {
    const [name, ...args] = raw.trim().split(/\s+/);
    const resolvedCmd = resolveFuzzyTarget(name, COMMAND_NAMES, COMMAND_ALIASES);
    if (resolvedCmd) handlers[resolvedCmd](args);
  }

  const argChoices: Record<string, string[]> = {
    ls: [
      'about.md',
      'roadmap.md',
      'skills/',
      'projects/',
      'blogs/',
      'stats/',
      'contact.txt',
      ...skillList.map((s) => `skills/${s.slug}`),
      'stats/github',
      'stats/leetcode',
    ],
    cat: ['about.md', 'roadmap.md', 'contact.txt', 'blogs', 'projects', 'stats'],
    open: Object.keys(links),
    stats: ['github', 'leetcode'],
    skills: skillList.map((s) => s.slug),
    projects: skillList.map((s) => s.slug),
  };

  const commonPrefix = (list: string[]): string =>
    list.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });

  function complete(): void {
    const parts = input!.value.trimStart().split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    const pool = parts.length === 1 ? COMMAND_NAMES : argChoices[parts[0].toLowerCase()] || [];
    const hits = pool.filter((c) => c.startsWith(last));
    if (!hits.length) return;

    const prefix = commonPrefix(hits);
    parts[parts.length - 1] = prefix;
    const finished = hits.length === 1 && !prefix.endsWith('/');
    input!.value = parts.join(' ') + (finished ? ' ' : '');
  }

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      run(input.value);
      input.value = '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (pastIndex === past.length) draft = input.value;
      if (pastIndex > 0) input.value = past[--pastIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (pastIndex < past.length) {
        pastIndex++;
        input.value = pastIndex === past.length ? draft : past[pastIndex];
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearScreen();
    }
  });

  quick.forEach(({ cmd, desc }) => {
    const item = cmdButton('', cmd, 'menu-item');
    item.append(make('span', 'mc', cmd), make('span', 'md', desc));
    menu.append(item);
  });

  function setMenu(open: boolean): void {
    menu!.hidden = !open;
    menuBtn!.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', () => setMenu(Boolean(menu.hidden)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (!menu.hidden && !target.closest('.dropdown')) setMenu(false);

    const quiet = target.closest<HTMLElement>('[data-quiet]');
    if (quiet?.dataset.quiet) {
      runQuiet(quiet.dataset.quiet);
      return;
    }

    const trigger = target.closest<HTMLElement>('[data-cmd]');
    if (trigger?.dataset.cmd) {
      setMenu(false);
      run(trigger.dataset.cmd);
      if (canHover) input.focus({ preventScroll: true });
    }
  });

  screen.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!canHover || !target) return;
    if (getSelection()?.toString()) return;
    if (target.closest('a, button, input')) return;
    input.focus({ preventScroll: true });
  });

  if (canHover) input.focus({ preventScroll: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
