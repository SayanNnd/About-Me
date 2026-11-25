import { getPostBySlug, getSiteContent } from '../lib/content';
import { $, $$, applyDocumentTheme, make } from '../lib/dom';
import { renderSafeMarkdown } from '../lib/markdown';
import { pageHref } from '../lib/paths';

export function buildTocAndProgress(screen: HTMLElement, articleRoot: ParentNode, tocList: HTMLElement | null): void {
  const headings = $$<HTMLHeadingElement>('h2[id]', articleRoot);

  if (tocList) {
    tocList.replaceChildren();
    headings.forEach((h) => {
      const li = make('li');
      const a = make('a', '', h.textContent || '');
      a.href = `#${h.id}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const headingTop = h.getBoundingClientRect().top;
        const screenTop = screen.getBoundingClientRect().top;
        const offset = headingTop - screenTop + screen.scrollTop - 16;
        screen.scrollTo({ top: offset, behavior: 'smooth' });
        try {
          history.replaceState(null, '', `#${h.id}`);
        } catch {
          /* ignore */
        }
      });
      li.append(a);
      tocList.append(li);
    });
  }

  const tocLinks = tocList ? $$<HTMLAnchorElement>('a', tocList) : [];

  function updateToc(): void {
    if (!headings.length) return;
    const screenTop = screen.getBoundingClientRect().top;
    const atBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 60;

    let current = headings[0];
    if (atBottom) {
      current = headings[headings.length - 1];
    } else {
      const threshold = screenTop + screen.clientHeight * 0.33;
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top < threshold) current = h;
      });
    }

    tocLinks.forEach((a) => {
      if (a.getAttribute('href') === `#${current.id}`) {
        a.setAttribute('aria-current', 'true');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  const fill = $('#progress-fill') as HTMLElement | null;
  const label = $('#progress-label') as HTMLElement | null;

  function updateProgress(): void {
    if (!fill) return;
    const max = screen.scrollHeight - screen.clientHeight;
    const pct = max > 0 ? Math.round((screen.scrollTop / max) * 100) : 100;
    fill.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
  }

  const onScroll = (): void => {
    updateProgress();
    updateToc();
  };

  screen.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
}

async function init(): Promise<void> {
  const site = getSiteContent();

  const toolbarHint = $('.toolbar-hint');
  if (toolbarHint) toolbarHint.textContent = site.terminal.blogToolbarHint;

  const navPortfolio = $('#nav-portfolio');
  if (navPortfolio) {
    navPortfolio.textContent = site.terminal.navPortfolioLabel;
    navPortfolio.setAttribute('href', pageHref('index.html'));
  }

  const navBlog = $('#nav-blog');
  if (navBlog) {
    navBlog.textContent = site.terminal.navBlogLabel;
    navBlog.setAttribute('href', pageHref('blog/index.html'));
  }

  const backLink = $('#back-to-posts');
  if (backLink) backLink.setAttribute('href', pageHref('blog/index.html'));

  const promptUser = $('#prompt-user');
  if (promptUser) promptUser.textContent = site.terminal.user;
  const promptDir = $('#prompt-dir');
  if (promptDir) promptDir.textContent = site.terminal.blogDir;

  const footerCopy = $('#footer-copy');
  if (footerCopy) footerCopy.textContent = site.terminal.footerCopyright;

  const params = new URLSearchParams(window.location.search);
  const defaultSlug = document.querySelector('meta[name="default-post-slug"]')?.getAttribute('content') || '';
  const slug = params.get('slug') || defaultSlug || 'atheon';

  const promptFile = $('#prompt-file');
  if (promptFile) promptFile.textContent = `cat ${slug}.md`;

  const post = getPostBySlug(slug, false);
  const articleBody = $('#post-body') as HTMLElement | null;
  const screen = $('#screen') as HTMLElement | null;
  const tocList = $('#toc-list') as HTMLElement | null;

  if (!post || !articleBody) {
    applyDocumentTheme(`Post not found | ${site.meta.blogPageTitle}`, site.meta.themeColor);
    const titleEl = $('#post-title');
    if (titleEl) titleEl.textContent = 'Post not found';
    const subEl = $('#post-subtitle');
    if (subEl) subEl.textContent = `No published post exists for "${slug}".`;
    if (articleBody) {
      articleBody.replaceChildren(make('p', 'err', `404: ${slug}.md not found.`));
    }
    return;
  }

  applyDocumentTheme(`${post.title} | Sayan Nandi`, site.meta.themeColor, post.subtitle);

  const titleEl = $('#post-title');
  if (titleEl) titleEl.textContent = post.title;

  const subEl = $('#post-subtitle');
  if (subEl) subEl.textContent = post.subtitle;

  const dateEl = $('#post-date');
  if (dateEl) {
    dateEl.textContent = post.date;
    if (post.dateIso) dateEl.setAttribute('datetime', post.dateIso);
  }

  const readEl = $('#post-read-time');
  if (readEl) readEl.textContent = post.readTime;

  const tagsEl = $('#post-tags');
  if (tagsEl) {
    tagsEl.replaceChildren(...post.tags.map((t) => make('li', '', t)));
  }

  await renderSafeMarkdown(articleBody, post.content);

  if (screen) {
    buildTocAndProgress(screen, articleBody, tocList);
    const topBtn = $('#to-top');
    if (topBtn) {
      topBtn.addEventListener('click', () => {
        screen.scrollTo({ top: 0, behavior: 'smooth' });
      });
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
