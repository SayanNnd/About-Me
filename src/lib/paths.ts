export function getSiteRoot(): string {
  const meta = document.querySelector('meta[name="site-root"]');
  const raw = meta?.getAttribute('content')?.trim() || '.';
  return raw.replace(/\/+$/, '') || '.';
}

export function isExternalUrl(value: string): boolean {
  return /^(https?:|mailto:|tel:|data:|blob:)/i.test(value.trim());
}

export function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript|data:text\/html):/i.test(trimmed)) return false;
  return true;
}

export function resolveAsset(path: string): string {
  const clean = path.trim();
  if (!clean) return '';
  if (isExternalUrl(clean)) return clean;
  const stripped = clean.replace(/^(\.\.\/|\.\/|\/)+/, '');
  return `${getSiteRoot()}/${stripped}`;
}

export function pageHref(relativePath: string): string {
  const stripped = relativePath.replace(/^\/+/, '');
  return `${getSiteRoot()}/${stripped}`;
}

export function postHref(slug: string): string {
  return `${getSiteRoot()}/blog/post.html?slug=${encodeURIComponent(slug)}`;
}
