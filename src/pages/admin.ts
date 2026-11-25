import {
  checkLocalCmsAvailable,
  deleteBlogPost,
  loadCmsData,
  saveBlogPost,
  saveSiteContent,
  verifyGitHubOwner,
  type CmsSession,
} from '../lib/cms-api';
import { estimateReadTime, getSiteContent, sanitizeAccent, slugifyHeading } from '../lib/content';
import { $, $$, make } from '../lib/dom';
import { fetchGitHubRepos } from '../lib/github-projects';
import { renderSafeMarkdown } from '../lib/markdown';
import { pageHref } from '../lib/paths';
import type { AccentColor, BlogPostMeta, SiteContent } from '../types/content';

const TOKEN_STORAGE_KEY = 'sayan_cms_gh_config';
const ACCENTS: AccentColor[] = ['coral', 'amber', 'teal', 'sky', 'lavender', 'pink', 'lime'];

type SiteSectionKey =
  | 'meta'
  | 'fastfetch'
  | 'about'
  | 'skills'
  | 'projects'
  | 'contact'
  | 'roadmap'
  | 'blogsstats';

const SECTION_LABELS: Record<SiteSectionKey, string> = {
  meta: 'Meta & Terminal Chrome',
  fastfetch: 'Fastfetch Profile Card',
  about: 'About (cat about.md)',
  skills: 'Skills (ls ~/skills)',
  projects: 'Projects (GitHub & Blog Links)',
  contact: 'Contact Links (cat contact.txt)',
  roadmap: 'Roadmap (cat roadmap.md)',
  blogsstats: 'Blogs & Stats Intro Text',
};

interface AdminState {
  session: CmsSession | null;
  site: SiteContent;
  posts: BlogPostMeta[];
  markdownBySlug: Record<string, string>;
  activeSlug: string | null;
  isNewPost: boolean;
  activeSiteSection: SiteSectionKey;
}

function formatMonthDisplay(date = new Date()): { display: string; iso: string } {
  const display = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { display, iso: `${date.getFullYear()}-${month}` };
}

function createField(
  id: string,
  label: string,
  value: string,
  onChange: (val: string) => void,
  opts: { type?: 'text' | 'url' | 'number' | 'textarea' | 'select'; options?: string[]; hint?: string } = {},
): HTMLElement {
  const wrap = make('div', 'field');
  const lbl = make('label', '', label);
  lbl.setAttribute('for', id);
  wrap.append(lbl);

  if (opts.hint) {
    const hint = make('span', 'field-hint', opts.hint);
    hint.id = `${id}-hint`;
    wrap.append(hint);
  }

  let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (opts.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.value = value;
    ta.addEventListener('input', () => onChange(ta.value));
    control = ta;
  } else if (opts.type === 'select') {
    const sel = document.createElement('select');
    (opts.options || []).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.append(o);
    });
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    control = sel;
  } else {
    const inp = document.createElement('input');
    inp.type = opts.type || 'text';
    inp.value = value;
    inp.addEventListener('input', () => onChange(inp.value));
    control = inp;
  }

  control.id = id;
  if (opts.hint) control.setAttribute('aria-describedby', `${id}-hint`);
  wrap.append(control);
  return wrap;
}

async function init(): Promise<void> {
  const defaultSite = getSiteContent();

  const navPortfolio = $('#nav-portfolio');
  if (navPortfolio) navPortfolio.setAttribute('href', pageHref('index.html'));
  const navBlog = $('#nav-blog');
  if (navBlog) navBlog.setAttribute('href', pageHref('blog/index.html'));

  const statusEl = $('#admin-status') as HTMLElement;
  const authGate = $('#auth-gate') as HTMLElement;
  const workspace = $('#workspace') as HTMLElement;
  const localDevBox = $('#local-dev-box') as HTMLElement;
  const enterLocalBtn = $('#enter-local-dev') as HTMLButtonElement;

  const ownerInput = $('#gh-owner') as HTMLInputElement;
  const repoInput = $('#gh-repo') as HTMLInputElement;
  const branchInput = $('#gh-branch') as HTMLInputElement;
  const tokenInput = $('#gh-token') as HTMLInputElement;
  const rememberInput = $('#remember-token') as HTMLInputElement;
  const toggleTokenBtn = $('#toggle-token') as HTMLButtonElement;
  const authForm = $('#auth-form') as HTMLFormElement;
  const authSubmitBtn = $('#auth-submit') as HTMLButtonElement;
  const sessionBadge = $('#session-badge') as HTMLElement;

  ownerInput.value = defaultSite.meta.repoOwner;
  repoInput.value = defaultSite.meta.repoName;
  branchInput.value = defaultSite.meta.branch;

  const state: AdminState = {
    session: null,
    site: defaultSite,
    posts: [],
    markdownBySlug: {},
    activeSlug: null,
    isNewPost: false,
    activeSiteSection: 'meta',
  };

  function setStatus(msg: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.className = `admin-status${kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : ''}`;
    statusEl.textContent = msg;
  }

  toggleTokenBtn.addEventListener('click', () => {
    const show = tokenInput.type === 'password';
    tokenInput.type = show ? 'text' : 'password';
    toggleTokenBtn.textContent = show ? 'Hide' : 'Show';
    toggleTokenBtn.setAttribute('aria-pressed', String(show));
  });

  const tabBlogs = $('#tab-blogs') as HTMLButtonElement;
  const tabSite = $('#tab-site') as HTMLButtonElement;
  const panelBlogs = $('#panel-blogs') as HTMLElement;
  const panelSite = $('#panel-site') as HTMLElement;

  function switchTab(which: 'blogs' | 'site'): void {
    const isBlogs = which === 'blogs';
    tabBlogs.setAttribute('aria-selected', String(isBlogs));
    tabSite.setAttribute('aria-selected', String(!isBlogs));
    panelBlogs.hidden = !isBlogs;
    panelSite.hidden = isBlogs;
  }

  tabBlogs.addEventListener('click', () => switchTab('blogs'));
  tabSite.addEventListener('click', () => switchTab('site'));

  /* ---------- Blog Studio ---------- */
  const postListEl = $('#admin-post-list') as HTMLElement;
  const newPostBtn = $('#new-post-btn') as HTMLButtonElement;
  const postForm = $('#post-form') as HTMLFormElement;
  const titleInput = $('#post-title-input') as HTMLInputElement;
  const slugInput = $('#post-slug-input') as HTMLInputElement;
  const dateInput = $('#post-date-input') as HTMLInputElement;
  const isoInput = $('#post-iso-input') as HTMLInputElement;
  const subtitleInput = $('#post-subtitle-input') as HTMLInputElement;
  const tagsInput = $('#post-tags-input') as HTMLInputElement;
  const readInput = $('#post-read-input') as HTMLInputElement;
  const autoReadBtn = $('#auto-read-btn') as HTMLButtonElement;
  const accentInput = $('#post-accent-input') as HTMLSelectElement;
  const repoPostInput = $('#post-repo-input') as HTMLInputElement;
  const reposDatalist = $('#github-repos-datalist') as HTMLDataListElement;
  const publishedInput = $('#post-published-input') as HTMLInputElement;
  const featuredInput = $('#post-featured-input') as HTMLInputElement;
  const deletePostBtn = $('#delete-post-btn') as HTMLButtonElement;
  const savePostBtn = $('#save-post-btn') as HTMLButtonElement;
  const markdownInput = $('#post-markdown-input') as HTMLTextAreaElement;
  const editorStatsEl = $('#editor-stats') as HTMLElement;
  const splitPanes = $('#split-panes') as HTMLElement;

  const previewTitle = $('#preview-title') as HTMLElement;
  const previewSubtitle = $('#preview-subtitle') as HTMLElement;
  const previewDate = $('#preview-date') as HTMLElement;
  const previewRead = $('#preview-read') as HTMLElement;
  const previewTags = $('#preview-tags') as HTMLElement;
  const previewToc = $('#preview-toc') as HTMLElement;
  const previewBody = $('#preview-body') as HTMLElement;

  const deleteDialog = $('#confirm-delete-dialog') as HTMLDialogElement;
  const deleteDialogMsg = $('#confirm-delete-msg') as HTMLElement;

  let previewTimer: number | null = null;
  let slugTouched = false;

  async function populateRepoSuggestions(): Promise<void> {
    const username = state.site.projects.githubUsername || state.site.meta.repoOwner;
    if (!username || !reposDatalist) return;
    try {
      const repos = await fetchGitHubRepos(username);
      reposDatalist.replaceChildren(
        ...repos.map((r) => {
          const opt = document.createElement('option');
          opt.value = r.name;
          return opt;
        }),
      );
    } catch {
      /* optional suggestions */
    }
  }

  function renderPostSidebar(): void {
    postListEl.replaceChildren();
    state.posts.forEach((post) => {
      const li = make('li');
      const btn = make('button', 'post-list-btn');
      btn.type = 'button';
      if (!state.isNewPost && state.activeSlug === post.slug) {
        btn.setAttribute('aria-current', 'true');
      }

      const titleSpan = make('span', 'post-list-title', post.title || post.slug);
      const sub = make('span', 'post-list-sub');
      const badge = make('span', `badge-mini${post.published ? '' : ' draft'}`, post.published ? 'LIVE' : 'DRAFT');
      sub.append(make('span', '', post.date), badge);
      btn.append(titleSpan, sub);
      btn.addEventListener('click', () => loadPostIntoEditor(post.slug));
      li.append(btn);
      postListEl.append(li);
    });
  }

  async function renderLivePreview(): Promise<void> {
    const md = markdownInput.value;
    const words = md.trim().split(/\s+/).filter(Boolean).length;
    editorStatsEl.textContent = `${words} words · ${estimateReadTime(md)}`;

    previewTitle.textContent = titleInput.value || 'Untitled post';
    previewSubtitle.textContent = subtitleInput.value;
    previewDate.textContent = dateInput.value;
    previewRead.textContent = readInput.value || estimateReadTime(md);

    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    previewTags.replaceChildren(...tags.map((t) => make('li', '', t)));

    await renderSafeMarkdown(previewBody, md);

    const headings = $$<HTMLHeadingElement>('h2[id]', previewBody);
    previewToc.replaceChildren();
    headings.forEach((h) => {
      previewToc.append(make('li', '', h.textContent || ''));
    });
  }

  function schedulePreview(): void {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      void renderLivePreview();
    }, 100);
  }

  function loadPostIntoEditor(slug: string): void {
    const meta = state.posts.find((p) => p.slug === slug);
    if (!meta) return;
    state.activeSlug = slug;
    state.isNewPost = false;
    slugTouched = true;

    titleInput.value = meta.title;
    slugInput.value = meta.slug;
    dateInput.value = meta.date;
    isoInput.value = meta.dateIso;
    subtitleInput.value = meta.subtitle;
    tagsInput.value = meta.tags.join(', ');
    readInput.value = meta.readTime;
    accentInput.value = sanitizeAccent(meta.accent, 'coral');
    repoPostInput.value = meta.projectRepo || '';
    publishedInput.checked = meta.published !== false;
    featuredInput.checked = Boolean(meta.featuredOnHome);
    markdownInput.value = state.markdownBySlug[slug] ?? '';
    deletePostBtn.disabled = false;

    renderPostSidebar();
    void renderLivePreview();
  }

  function startNewPost(): void {
    const { display, iso } = formatMonthDisplay();
    state.activeSlug = null;
    state.isNewPost = true;
    slugTouched = false;

    titleInput.value = '';
    slugInput.value = '';
    dateInput.value = display;
    isoInput.value = iso;
    subtitleInput.value = '';
    tagsInput.value = 'Systems, C++';
    readInput.value = '~5 min read';
    accentInput.value = 'teal';
    repoPostInput.value = '';
    publishedInput.checked = true;
    featuredInput.checked = false;
    markdownInput.value = `## Introduction\n\nStart writing your post here...\n\n## How it works\n\n\`\`\`cpp\n// code example\n\`\`\`\n`;
    deletePostBtn.disabled = true;

    renderPostSidebar();
    void renderLivePreview();
    titleInput.focus();
  }

  newPostBtn.addEventListener('click', startNewPost);

  titleInput.addEventListener('input', () => {
    if (state.isNewPost && !slugTouched) {
      slugInput.value = slugifyHeading(titleInput.value);
    }
    schedulePreview();
  });
  slugInput.addEventListener('input', () => {
    slugTouched = true;
    slugInput.setCustomValidity('');
  });
  slugInput.addEventListener('invalid', () => {
    slugInput.setCustomValidity('Use lowercase letters, numbers, and hyphens only (e.g. my-new-post).');
  });

  [subtitleInput, dateInput, tagsInput, readInput, markdownInput].forEach((el) => {
    el.addEventListener('input', schedulePreview);
  });

  autoReadBtn.addEventListener('click', () => {
    readInput.value = estimateReadTime(markdownInput.value);
    schedulePreview();
  });

  function insertAroundSelection(before: string, after: string, fallback: string): void {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selected = markdownInput.value.slice(start, end) || fallback;
    const replacement = `${before}${selected}${after}`;
    markdownInput.setRangeText(replacement, start, end, 'select');
    markdownInput.focus();
    schedulePreview();
  }

  const FORMAT_SNIPPETS: Record<string, [string, string, string]> = {
    h2: ['\n## ', '\n', 'Section Heading'],
    h3: ['\n### ', '\n', 'Subheading'],
    bold: ['**', '**', 'bold text'],
    italic: ['*', '*', 'italic text'],
    code: ['`', '`', 'code'],
    codeblock: ['\n```cpp\n', '\n```\n', '// your code here'],
    link: ['[', '](https://example.com)', 'link text'],
    list: ['\n- ', '\n- Second item\n', 'First item'],
    table: ['\n| Column A | Column B |\n| --- | --- |\n| ', ' | Value |\n', 'Key'],
    figure: [
      '\n<figure class="img-frame">\n  <img src="img/logo.gif" alt="',
      '">\n  <figcaption>Fig. Caption goes here.</figcaption>\n</figure>\n',
      'Image description',
    ],
    note: ['\n<p class="edit-note">[', ']</p>\n', 'Author note here'],
  };

  $$<HTMLButtonElement>('[data-fmt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.fmt || '';
      const spec = FORMAT_SNIPPETS[key];
      if (spec) insertAroundSelection(spec[0], spec[1], spec[2]);
    });
  });

  $$<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode || 'split';
      splitPanes.dataset.mode = mode;
      $$<HTMLButtonElement>('[data-mode]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  markdownInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertAroundSelection('**', '**', 'bold text');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertAroundSelection('*', '*', 'italic text');
    }
  });

  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.session) return;
    if (!postForm.reportValidity()) return;

    const slug = slugInput.value.trim();
    const duplicate = state.posts.some(
      (p) => p.slug === slug && (state.isNewPost || slug !== state.activeSlug),
    );
    if (duplicate) {
      setStatus(`A post with slug "${slug}" already exists.`, 'error');
      slugInput.focus();
      return;
    }

    const meta: BlogPostMeta = {
      slug,
      title: titleInput.value.trim(),
      subtitle: subtitleInput.value.trim(),
      date: dateInput.value.trim(),
      dateIso: isoInput.value.trim(),
      readTime: readInput.value.trim() || estimateReadTime(markdownInput.value),
      tags: tagsInput.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      accent: sanitizeAccent(accentInput.value, 'coral'),
      published: publishedInput.checked,
      featuredOnHome: featuredInput.checked,
      projectRepo: repoPostInput.value.trim(),
    };

    const nextPosts = [...state.posts];
    const previousSlug = state.isNewPost ? undefined : state.activeSlug || undefined;
    const matchSlug = previousSlug || slug;
    const existingIdx = nextPosts.findIndex((p) => p.slug === matchSlug);
    if (existingIdx >= 0) nextPosts[existingIdx] = meta;
    else nextPosts.unshift(meta);

    savePostBtn.disabled = true;
    setStatus('Saving blog post...', 'info');
    try {
      const msg = await saveBlogPost(state.session, nextPosts, meta, markdownInput.value, previousSlug);
      if (previousSlug && previousSlug !== slug) delete state.markdownBySlug[previousSlug];
      state.posts = nextPosts;
      state.markdownBySlug[slug] = markdownInput.value;
      state.activeSlug = slug;
      state.isNewPost = false;
      renderPostSidebar();
      deletePostBtn.disabled = false;
      setStatus(msg, 'ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to save blog post.', 'error');
    } finally {
      savePostBtn.disabled = false;
    }
  });

  deletePostBtn.addEventListener('click', () => {
    if (!state.activeSlug || state.isNewPost) return;
    deleteDialogMsg.textContent = `Delete "${state.activeSlug}.md" and remove it from the blog list?`;
    deleteDialog.showModal();
  });

  deleteDialog.addEventListener('close', async () => {
    const choice = deleteDialog.returnValue;
    deleteDialog.returnValue = '';
    if (choice !== 'delete' || !state.session || !state.activeSlug) return;

    const targetSlug = state.activeSlug;
    const nextPosts = state.posts.filter((p) => p.slug !== targetSlug);
    setStatus(`Deleting "${targetSlug}"...`, 'info');
    try {
      const msg = await deleteBlogPost(state.session, nextPosts, targetSlug);
      delete state.markdownBySlug[targetSlug];
      state.posts = nextPosts;
      if (state.posts.length > 0) loadPostIntoEditor(state.posts[0].slug);
      else startNewPost();
      setStatus(msg, 'ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to delete post.', 'error');
    }
  });

  /* ---------- Site Text & Content Editor ---------- */
  const siteFieldsRoot = $('#site-fields-root') as HTMLElement;
  const sitePanelTitle = $('#site-panel-title') as HTMLElement;
  const siteForm = $('#site-form') as HTMLFormElement;
  const saveSiteBtn = $('#save-site-btn') as HTMLButtonElement;

  function renderSiteSection(): void {
    const sec = state.activeSiteSection;
    const s = state.site;
    sitePanelTitle.textContent = SECTION_LABELS[sec];
    siteFieldsRoot.replaceChildren();

    $$<HTMLButtonElement>('[data-site-sec]').forEach((btn) => {
      btn.setAttribute('aria-current', String(btn.dataset.siteSec === sec));
    });

    if (sec === 'meta') {
      const grid = make('div', 'grid-2');
      grid.append(
        createField('m-title', 'Site Title', s.meta.siteTitle, (v) => { s.meta.siteTitle = v; }),
        createField('m-btitle', 'Blogs Page Title', s.meta.blogPageTitle, (v) => { s.meta.blogPageTitle = v; }),
        createField('m-bdesc', 'Blogs Meta Description', s.meta.blogDescription, (v) => { s.meta.blogDescription = v; }),
        createField('m-user', 'Terminal Prompt User', s.terminal.user, (v) => { s.terminal.user = v; }),
        createField('m-hdir', 'Home Dir Label', s.terminal.homeDir, (v) => { s.terminal.homeDir = v; }),
        createField('m-bdir', 'Blogs Dir Label', s.terminal.blogDir, (v) => { s.terminal.blogDir = v; }),
        createField('m-thint', 'Portfolio Toolbar Hint', s.terminal.toolbarHint, (v) => { s.terminal.toolbarHint = v; }),
        createField('m-bhint', 'Blogs Toolbar Hint', s.terminal.blogToolbarHint, (v) => { s.terminal.blogToolbarHint = v; }),
        createField('m-navp', 'Portfolio Nav Label', s.terminal.navPortfolioLabel, (v) => { s.terminal.navPortfolioLabel = v; }),
        createField('m-navb', 'Blogs Nav Label', s.terminal.navBlogLabel, (v) => { s.terminal.navBlogLabel = v; }),
        createField('m-who', 'whoami Output', s.terminal.whoamiName, (v) => { s.terminal.whoamiName = v; }),
        createField('m-whoh', 'whoami Hint', s.terminal.whoamiHint, (v) => { s.terminal.whoamiHint = v; }),
        createField('m-pwd', 'pwd Output', s.terminal.pwd, (v) => { s.terminal.pwd = v; }),
        createField('m-copy', 'Footer Copyright', s.terminal.footerCopyright, (v) => { s.terminal.footerCopyright = v; }),
        createField('m-keys', 'Footer Shortcut Hint', s.terminal.footerKeysHint, (v) => { s.terminal.footerKeysHint = v; }),
      );
      siteFieldsRoot.append(grid);
    } else if (sec === 'fastfetch') {
      const top = make('div', 'grid-2');
      top.append(
        createField('ff-head', 'Fastfetch Header', s.fastfetch.head, (v) => { s.fastfetch.head = v; }),
        createField('ff-logo', 'Logo Image Path', s.fastfetch.logoSrc, (v) => { s.fastfetch.logoSrc = v; }),
        createField('ff-alt', 'Logo Alt Text', s.fastfetch.logoAlt, (v) => { s.fastfetch.logoAlt = v; }),
      );
      siteFieldsRoot.append(top);

      s.fastfetch.rows.forEach((row, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.fastfetch.rows.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `Row ${i + 1}`), del);
        const grid = make('div', 'grid-2');
        grid.append(
          createField(`ff-k-${i}`, 'Key', row.key, (v) => { row.key = v; }),
          createField(`ff-v-${i}`, 'Value', row.value, (v) => { row.value = v; }),
        );
        card.append(head, grid);
        siteFieldsRoot.append(card);
      });

      const addBtn = make('button', 'btn-chip', '+ Add Fastfetch Row');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        s.fastfetch.rows.push({ key: 'Label', value: 'Value' });
        renderSiteSection();
      });
      siteFieldsRoot.append(addBtn);
    } else if (sec === 'about') {
      siteFieldsRoot.append(
        createField('ab-head', 'Heading', s.about.heading, (v) => { s.about.heading = v; }),
      );
      const cta = make('div', 'grid-2');
      cta.append(
        createField('ab-ctal', 'CTA Button Label', s.about.ctaLabel, (v) => { s.about.ctaLabel = v; }),
        createField('ab-ctac', 'CTA Command', s.about.ctaCmd, (v) => { s.about.ctaCmd = v; }),
      );
      siteFieldsRoot.append(cta);

      s.about.paragraphs.forEach((p, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.about.paragraphs.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `Paragraph ${i + 1}`), del);
        card.append(
          head,
          createField(`ab-p-${i}`, 'Text', p, (v) => { s.about.paragraphs[i] = v; }, { type: 'textarea' }),
        );
        siteFieldsRoot.append(card);
      });

      const addBtn = make('button', 'btn-chip', '+ Add Paragraph');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        s.about.paragraphs.push('');
        renderSiteSection();
      });
      siteFieldsRoot.append(addBtn);
    } else if (sec === 'skills') {
      const top = make('div', 'grid-2');
      top.append(
        createField('sk-hp', 'Skills Hint Prefix', s.skills.hintPrefix, (v) => { s.skills.hintPrefix = v; }),
        createField('sk-hc', 'Skills Hint Command', s.skills.hintCommand, (v) => { s.skills.hintCommand = v; }),
      );
      siteFieldsRoot.append(top);

      s.skills.items.forEach((sk, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.skills.items.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `Skill ${i + 1}`), del);
        const grid = make('div', 'grid-2');
        grid.append(
          createField(`sk-s-${i}`, 'Slug', sk.slug, (v) => { sk.slug = v; }),
          createField(`sk-l-${i}`, 'Label', sk.label, (v) => { sk.label = v; }),
          createField(`sk-a-${i}`, 'Aliases / Languages (comma-separated)', sk.aliases.join(', '), (v) => {
            sk.aliases = v.split(',').map((x) => x.trim()).filter(Boolean);
          }),
        );
        card.append(head, grid);
        siteFieldsRoot.append(card);
      });

      const addBtn = make('button', 'btn-chip', '+ Add Skill');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        s.skills.items.push({ slug: 'new-skill', label: 'New Skill', aliases: [] });
        renderSiteSection();
      });
      siteFieldsRoot.append(addBtn);
    } else if (sec === 'projects') {
      const top = make('div', 'grid-2');
      top.append(
        createField('pr-head', 'Projects Heading', s.projects.heading, (v) => { s.projects.heading = v; }),
        createField('pr-user', 'GitHub Username', s.projects.githubUsername, (v) => { s.projects.githubUsername = v; }),
        createField(
          'pr-lim',
          'Default Visible Count',
          String(s.projects.defaultLimit || 3),
          (v) => {
            const n = Number(v);
            s.projects.defaultLimit = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
          },
          { type: 'number' },
        ),
      );
      siteFieldsRoot.append(
        top,
        createField('pr-intro', 'Projects Intro Text', s.projects.intro, (v) => { s.projects.intro = v; }, { type: 'textarea' }),
        make('p', 'field-hint', 'Repos are fetched live from GitHub, sorted with blog-connected projects first, then by stars. Use overrides below to attach blogs or customize display fields.'),
      );

      s.projects.overrides.forEach((ov, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.projects.overrides.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `GitHub Repo Override ${i + 1}: ${ov.repo}`), del);
        const grid = make('div', 'grid-2');
        const blogOptions = ['', ...state.posts.map((p) => p.slug)];
        grid.append(
          createField(`ov-r-${i}`, 'GitHub Repo Name', ov.repo, (v) => { ov.repo = v; }),
          createField(`ov-b-${i}`, 'Connected Blog Post', ov.blogSlug, (v) => { ov.blogSlug = v; }, {
            type: 'select',
            options: blogOptions,
          }),
          createField(`ov-t-${i}`, 'Custom Title (optional)', ov.title, (v) => { ov.title = v; }),
          createField(`ov-bg-${i}`, 'Badge (optional)', ov.badge, (v) => { ov.badge = v; }),
          createField(`ov-tc-${i}`, 'Custom Tech Line (optional)', ov.tech, (v) => { ov.tech = v; }),
          createField(`ov-ac-${i}`, 'Accent', ov.accent, (v) => { ov.accent = sanitizeAccent(v); }, {
            type: 'select',
            options: ACCENTS,
          }),
        );
        card.append(
          head,
          grid,
          createField(`ov-d-${i}`, 'Custom Description (optional)', ov.description, (v) => { ov.description = v; }, { type: 'textarea' }),
        );
        siteFieldsRoot.append(card);
      });

      const addOvBtn = make('button', 'btn-chip', '+ Add Repo Override / Blog Link');
      addOvBtn.type = 'button';
      addOvBtn.addEventListener('click', () => {
        s.projects.overrides.push({
          repo: 'repo-name',
          title: '',
          badge: '',
          description: '',
          tech: '',
          accent: 'teal',
          blogSlug: '',
        });
        renderSiteSection();
      });
      siteFieldsRoot.append(addOvBtn);
    } else if (sec === 'contact') {
      s.contact.items.forEach((item, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.contact.items.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `Link ${i + 1}`), del);
        const grid = make('div', 'grid-2');
        grid.append(
          createField(`ct-k-${i}`, 'Key (e.g. Email, GitHub)', item.key, (v) => { item.key = v; }),
          createField(`ct-l-${i}`, 'Display Label', item.label, (v) => { item.label = v; }),
          createField(`ct-h-${i}`, 'URL / mailto:', item.href, (v) => { item.href = v; }),
        );
        card.append(head, grid);
        siteFieldsRoot.append(card);
      });

      const addBtn = make('button', 'btn-chip', '+ Add Contact Link');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        s.contact.items.push({ key: 'Website', label: 'example.com', href: 'https://example.com' });
        renderSiteSection();
      });
      siteFieldsRoot.append(addBtn);
    } else if (sec === 'roadmap') {
      siteFieldsRoot.append(
        createField('rm-head', 'Roadmap Heading', s.roadmap.heading, (v) => { s.roadmap.heading = v; }),
      );
      s.roadmap.sections.forEach((rm, i) => {
        const card = make('div', 'repeat-card');
        const head = make('div', 'repeat-card-head');
        const del = make('button', 'btn-chip danger', 'Remove');
        del.type = 'button';
        del.addEventListener('click', () => {
          s.roadmap.sections.splice(i, 1);
          renderSiteSection();
        });
        head.append(make('span', '', `Group ${i + 1}`), del);
        const grid = make('div', 'grid-2');
        grid.append(
          createField(`rm-t-${i}`, 'Group Title', rm.title, (v) => { rm.title = v; }),
          createField(`rm-c-${i}`, 'Color', rm.color, (v) => { rm.color = sanitizeAccent(v); }, { type: 'select', options: ACCENTS }),
        );
        card.append(
          head,
          grid,
          createField(
            `rm-i-${i}`,
            'Items (one per line)',
            rm.items.join('\n'),
            (v) => {
              rm.items = v.split('\n').map((x) => x.trim()).filter(Boolean);
            },
            { type: 'textarea' },
          ),
        );
        siteFieldsRoot.append(card);
      });

      const addBtn = make('button', 'btn-chip', '+ Add Roadmap Group');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        s.roadmap.sections.push({ title: 'Someday', color: 'sky', items: ['New goal'] });
        renderSiteSection();
      });
      siteFieldsRoot.append(addBtn);
    } else if (sec === 'blogsstats') {
      const blogGrid = make('div', 'grid-2');
      blogGrid.append(
        createField('bl-h', 'Blogs Heading', s.blog.heading, (v) => { s.blog.heading = v; }),
        createField('bl-eh', 'Blogs Empty/Bottom Hint', s.blog.emptyHint, (v) => { s.blog.emptyHint = v; }),
      );
      siteFieldsRoot.append(
        blogGrid,
        createField('bl-in', 'Blogs Intro Text', s.blog.intro, (v) => { s.blog.intro = v; }, { type: 'textarea' }),
        createField('st-h', 'Stats Heading', s.stats.heading, (v) => { s.stats.heading = v; }),
        createField('st-in', 'Stats Intro Text', s.stats.intro, (v) => { s.stats.intro = v; }, { type: 'textarea' }),
      );
    }
  }

  $$<HTMLButtonElement>('[data-site-sec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeSiteSection = (btn.dataset.siteSec as SiteSectionKey) || 'meta';
      renderSiteSection();
    });
  });

  siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.session) return;
    saveSiteBtn.disabled = true;
    setStatus('Publishing site content...', 'info');
    try {
      const msg = await saveSiteContent(state.session, state.site);
      setStatus(msg, 'ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to save site content.', 'error');
    } finally {
      saveSiteBtn.disabled = false;
    }
  });

  /* ---------- Session Lifecycle ---------- */
  async function unlockWithSession(session: CmsSession): Promise<void> {
    setStatus('Loading repository content...', 'info');
    const loaded = await loadCmsData(session);
    state.session = session;
    state.site = loaded.site;
    state.posts = loaded.posts;
    state.markdownBySlug = loaded.markdownBySlug;

    sessionBadge.textContent = session.label;
    authGate.hidden = true;
    workspace.hidden = false;
    setStatus('', 'info');

    if (state.posts.length > 0) loadPostIntoEditor(state.posts[0].slug);
    else startNewPost();
    renderSiteSection();
    void populateRepoSuggestions();
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!authForm.reportValidity()) return;

    const config = {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || 'main',
      token: tokenInput.value.trim(),
    };

    authSubmitBtn.disabled = true;
    setStatus('Verifying GitHub owner credentials...', 'info');
    try {
      const { userLogin } = await verifyGitHubOwner(config, state.site.meta.ownerHandle);
      const storage = rememberInput.checked ? localStorage : sessionStorage;
      storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(config));
      await unlockWithSession({
        mode: 'github',
        label: `GitHub: ${userLogin}`,
        userLogin,
        config,
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Authentication failed.', 'error');
    } finally {
      authSubmitBtn.disabled = false;
    }
  });

  enterLocalBtn.addEventListener('click', async () => {
    try {
      await unlockWithSession({ mode: 'local-dev', label: 'Local Dev (Disk)' });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to enter local dev mode.', 'error');
    }
  });

  $('#reload-remote')?.addEventListener('click', async () => {
    if (!state.session) return;
    try {
      await unlockWithSession(state.session);
      setStatus('Reloaded latest content.', 'ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Reload failed.', 'error');
    }
  });

  $('#sign-out')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    tokenInput.value = '';
    state.session = null;
    workspace.hidden = true;
    authGate.hidden = false;
    setStatus('Signed out and cleared session token.', 'info');
  });

  if (await checkLocalCmsAvailable()) {
    localDevBox.hidden = false;
  }

  const savedRaw = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw) as { owner: string; repo: string; branch: string; token: string };
      if (saved.token) {
        ownerInput.value = saved.owner || defaultSite.meta.repoOwner;
        repoInput.value = saved.repo || defaultSite.meta.repoName;
        branchInput.value = saved.branch || defaultSite.meta.branch;
        tokenInput.value = saved.token;
        const { userLogin } = await verifyGitHubOwner(saved, defaultSite.meta.ownerHandle);
        await unlockWithSession({
          mode: 'github',
          label: `GitHub: ${userLogin}`,
          userLogin,
          config: saved,
        });
      }
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
} else {
  void init();
}
