import { getAllPosts, getSiteContent, sanitizeAccent } from '../lib/content';
import { $, $$, accentVar, applyDocumentTheme, make } from '../lib/dom';
import { pageHref, postHref } from '../lib/paths';

function init(): void {
  const site = getSiteContent();
  const posts = getAllPosts(false);

  applyDocumentTheme(site.meta.blogPageTitle, site.meta.themeColor, site.meta.blogDescription);

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

  $$('.prompt-user').forEach((el) => {
    el.textContent = site.terminal.user;
  });
  $$('.prompt-blog-dir').forEach((el) => {
    el.textContent = site.terminal.blogDir;
  });

  const heading = $('#blog-heading');
  if (heading) {
    heading.replaceChildren(make('span', 'hash', '# '), site.blog.heading);
  }

  const intro = $('#blog-intro');
  if (intro) intro.textContent = site.blog.intro;

  const emptyHint = $('#blog-empty-hint');
  if (emptyHint) emptyHint.textContent = site.blog.emptyHint;

  const footerCopy = $('#footer-copy');
  if (footerCopy) footerCopy.textContent = site.terminal.footerCopyright;

  const postsContainer = $('#posts-list');
  if (!postsContainer) return;

  postsContainer.replaceChildren();
  if (posts.length === 0) {
    postsContainer.append(make('p', 'hint', 'No published posts yet.'));
    return;
  }

  posts.forEach((post) => {
    const card = make('a', 'project post-card');
    card.href = postHref(post.slug);
    card.style.setProperty('--accent', accentVar(sanitizeAccent(post.accent, 'coral')));

    const h2 = make('h2', '', post.title);
    const summary = make('p', '', post.subtitle);

    const meta = make('div', 'post-meta');
    const time = make('time', '', post.date);
    if (post.dateIso) time.setAttribute('datetime', post.dateIso);
    meta.append(time, make('span', '', post.readTime));

    const tagsUl = make('ul', 'tags');
    post.tags.forEach((tag) => tagsUl.append(make('li', '', tag)));

    card.append(h2, summary, meta, tagsUl);
    postsContainer.append(card);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
