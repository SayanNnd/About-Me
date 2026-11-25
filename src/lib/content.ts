import rawSite from '../content/site.json';
import rawPosts from '../content/posts.json';
import type { AccentColor, BlogPost, BlogPostMeta, SiteContent } from '../types/content';

const markdownModules = import.meta.glob('../content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const VALID_ACCENTS = new Set<AccentColor>([
  'coral',
  'amber',
  'teal',
  'sky',
  'lavender',
  'pink',
  'lime',
]);

export function sanitizeAccent(value: string | undefined, fallback: AccentColor = 'lime'): AccentColor {
  return value && VALID_ACCENTS.has(value as AccentColor) ? (value as AccentColor) : fallback;
}

export function getSiteContent(): SiteContent {
  return structuredClone(rawSite as SiteContent);
}

export function getAllPosts(includeDrafts = false): BlogPostMeta[] {
  const list = structuredClone(rawPosts as BlogPostMeta[]);
  return includeDrafts ? list : list.filter((post) => post.published !== false);
}

export function getPostMarkdown(slug: string): string | null {
  const key = `../content/posts/${slug}.md`;
  if (Object.hasOwn(markdownModules, key)) {
    return markdownModules[key];
  }
  return null;
}

export function getPostBySlug(slug: string, includeDrafts = false): BlogPost | null {
  const meta = getAllPosts(includeDrafts).find((post) => post.slug === slug);
  if (!meta) return null;
  const content = getPostMarkdown(slug);
  if (content === null) return null;
  return { ...meta, content };
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`'".,!?()[\]{}:;]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

export function estimateReadTime(markdown: string): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|[\]()-]/g, ' ');
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 210));
  return `~${minutes} min read`;
}
