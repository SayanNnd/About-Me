export type AccentColor =
  | 'coral'
  | 'amber'
  | 'teal'
  | 'sky'
  | 'lavender'
  | 'pink'
  | 'lime';

export interface FastfetchRow {
  key: string;
  value: string;
}

export interface SkillItem {
  slug: string;
  label: string;
  aliases: string[];
}

export interface ProjectItem {
  id: string;
  title: string;
  badge: string;
  description: string;
  tech: string;
  skills: string[];
  accent: AccentColor;
  sourceUrl: string;
  blogSlug: string;
}

export interface ProjectOverride {
  repo: string;
  title: string;
  badge: string;
  description: string;
  tech: string;
  accent: AccentColor;
  blogSlug: string;
}

export interface ContactItem {
  key: string;
  label: string;
  href: string;
}

export interface RoadmapSection {
  title: string;
  color: AccentColor;
  items: string[];
}

export interface SiteContent {
  meta: {
    siteTitle: string;
    blogPageTitle: string;
    blogDescription: string;
    themeColor: string;
    ownerHandle: string;
    repoOwner: string;
    repoName: string;
    branch: string;
  };
  terminal: {
    user: string;
    homeDir: string;
    blogDir: string;
    toolbarHint: string;
    blogToolbarHint: string;
    navPortfolioLabel: string;
    navBlogLabel: string;
    whoamiName: string;
    whoamiHint: string;
    pwd: string;
    footerCopyright: string;
    footerKeysHint: string;
  };
  fastfetch: {
    logoSrc: string;
    logoAlt: string;
    head: string;
    rows: FastfetchRow[];
  };
  about: {
    heading: string;
    paragraphs: string[];
    ctaLabel: string;
    ctaCmd: string;
  };
  skills: {
    hintPrefix: string;
    hintCommand: string;
    items: SkillItem[];
  };
  projects: {
    heading: string;
    intro: string;
    defaultLimit: number;
    githubUsername: string;
    overrides: ProjectOverride[];
    fallbackItems: ProjectItem[];
  };
  contact: {
    items: ContactItem[];
  };
  roadmap: {
    heading: string;
    sections: RoadmapSection[];
  };
  blog: {
    heading: string;
    intro: string;
    emptyHint: string;
  };
  stats: {
    heading: string;
    intro: string;
  };
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  dateIso: string;
  readTime: string;
  tags: string[];
  accent: AccentColor;
  published: boolean;
  featuredOnHome: boolean;
  projectRepo?: string;
}

export interface BlogPost extends BlogPostMeta {
  content: string;
}
