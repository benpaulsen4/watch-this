export interface HelpFrontmatter {
  title?: string;
  description?: string;
  order?: number;
  tags?: string[];
  lastUpdated?: string;
  updated?: string;
  draft?: boolean;
}

export interface HelpDocMeta {
  title: string;
  description?: string;
  order?: number;
  tags?: string[];
  lastUpdated?: string;
  updated?: string;
  draft?: boolean;
}

export interface HelpDoc {
  slug: string[];
  meta: HelpDocMeta;
  markdown: string;
}

export interface HelpDocSummary {
  slug: string[];
  meta: HelpDocMeta;
  isIndex: boolean;
}

export interface HelpNavPage {
  kind: "page";
  title: string;
  href: string;
  slug: string[];
  order: number;
}

export interface HelpNavGroup {
  kind: "group";
  title: string;
  order: number;
  href?: string;
  slug?: string[];
  items: Array<HelpNavGroup | HelpNavPage>;
}
