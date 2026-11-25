import { marked } from 'marked';
import { slugifyHeading } from './content';
import { isExternalUrl, isSafeUrl, resolveAsset } from './paths';

const ALLOWED_ELEMENTS = [
  'h2',
  'h3',
  'h4',
  'p',
  'br',
  'hr',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'figure',
  'figcaption',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
];

const ALLOWED_ATTRIBUTES = [
  'id',
  'class',
  'href',
  'src',
  'alt',
  'target',
  'rel',
  'scope',
  'loading',
  'width',
  'height',
];

type DOMPurifyModule = typeof import('dompurify')['default'];
let domPurifyPromise: Promise<DOMPurifyModule> | null = null;

function loadDOMPurify(): Promise<DOMPurifyModule> {
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default ?? mod);
  return domPurifyPromise;
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

export async function renderSafeMarkdown(container: HTMLElement, markdown: string): Promise<void> {
  const html = await marked.parse(markdown || '');

  if ('setHTML' in Element.prototype) {
    (container as unknown as { setHTML: (input: string, opts?: unknown) => void }).setHTML(html, {
      sanitizer: {
        elements: ALLOWED_ELEMENTS,
        attributes: ALLOWED_ATTRIBUTES,
      },
    });
  } else {
    const DOMPurify = await loadDOMPurify();
    container.innerHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_ELEMENTS, '#text'],
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false,
    });
  }

  enhanceRenderedPost(container);
}

function enhanceRenderedPost(container: HTMLElement): void {
  const usedIds = new Set<string>();

  container.querySelectorAll('h2').forEach((heading) => {
    const base = heading.id || slugifyHeading(heading.textContent || '');
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    usedIds.add(candidate);
    heading.id = candidate;
  });

  container.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('thead th').forEach((th) => {
      if (!th.getAttribute('scope')) th.setAttribute('scope', 'col');
    });
    if (!table.parentElement?.classList.contains('table-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.replaceWith(wrap);
      wrap.append(table);
    }
  });

  container.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!isSafeUrl(href)) {
      link.removeAttribute('href');
      return;
    }
    if (isExternalUrl(href) && !href.startsWith('mailto:')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!isSafeUrl(src)) {
      img.remove();
      return;
    }
    img.setAttribute('src', resolveAsset(src));
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
  });
}
