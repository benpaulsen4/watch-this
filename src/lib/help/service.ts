import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import type {
  HelpDoc,
  HelpDocMeta,
  HelpDocSummary,
  HelpFrontmatter,
  HelpNavGroup,
  HelpNavPage,
} from "./types";

const HELP_CONTENT_ROOT = path.join(process.cwd(), "content", "help");

function hrefForSlug(slug: string[]): string {
  if (slug.length === 0) return "/help";
  return `/help/${slug.map(encodeURIComponent).join("/")}`;
}

function titleizeSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeOrderValue(order: unknown): number | undefined {
  if (typeof order === "number" && Number.isFinite(order)) return order;
  if (typeof order === "string" && order.trim() !== "") {
    const parsed = Number(order);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeTagsValue(tags: unknown): string[] | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) {
    const normalized = tags.filter((t): t is string => typeof t === "string");
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof tags === "string") {
    const normalized = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }
  return undefined;
}

function normalizeDateValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

function normalizeFrontmatter(
  data: unknown,
  fallbackTitle: string,
): HelpDocMeta {
  const fm = (data ?? {}) as HelpFrontmatter;
  const title =
    typeof fm.title === "string" && fm.title.trim() !== ""
      ? fm.title.trim()
      : fallbackTitle;

  const description =
    typeof fm.description === "string" && fm.description.trim() !== ""
      ? fm.description.trim()
      : undefined;

  const updated = normalizeDateValue(fm.updated);
  const lastUpdated = normalizeDateValue(fm.lastUpdated) ?? updated;

  const draft = fm.draft === true ? true : undefined;

  return {
    title,
    description,
    order: normalizeOrderValue(fm.order),
    tags: normalizeTagsValue(fm.tags),
    lastUpdated,
    updated,
    draft,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function ensureSafeSlug(slug: string[]): void {
  for (const segment of slug) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid help slug.");
    }
    if (segment.includes("\\") || segment.includes("/")) {
      throw new Error("Invalid help slug segment.");
    }
  }
}

async function resolveMarkdownFilePath(slug: string[]): Promise<string> {
  ensureSafeSlug(slug);

  if (slug.length === 0) {
    return path.join(HELP_CONTENT_ROOT, "index.md");
  }

  const asIndex = path.join(HELP_CONTENT_ROOT, ...slug, "index.md");
  if (await pathExists(asIndex)) return asIndex;

  const asNestedFile = path.join(HELP_CONTENT_ROOT, ...slug) + ".md";
  if (await pathExists(asNestedFile)) return asNestedFile;

  return asNestedFile;
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function filePathToSlug(filePath: string): string[] {
  const relativePath = path.relative(HELP_CONTENT_ROOT, filePath);
  const segments = relativePath.split(path.sep);

  const last = segments[segments.length - 1] ?? "";
  const base = last.replace(/\.md$/i, "");

  if (base.toLowerCase() === "index") {
    return segments.slice(0, -1);
  }

  return [...segments.slice(0, -1), base];
}

function orderForMeta(meta: HelpDocMeta): number {
  return typeof meta.order === "number" ? meta.order : 9999;
}

function compareNavItems(
  a: { order: number; title: string },
  b: { order: number; title: string },
): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title);
}

export async function getHelpDocBySlug(slug: string[]): Promise<HelpDoc> {
  const filePath = await resolveMarkdownFilePath(slug);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);

  const fallbackTitle =
    slug.length === 0 ? "Help Center" : titleizeSegment(slug[slug.length - 1]);

  return {
    slug,
    meta: normalizeFrontmatter(parsed.data, fallbackTitle),
    markdown: parsed.content,
  };
}

export async function getAllHelpDocs(): Promise<HelpDocSummary[]> {
  if (!(await pathExists(HELP_CONTENT_ROOT))) return [];

  const filePaths = await walkMarkdownFiles(HELP_CONTENT_ROOT);
  const docs: HelpDocSummary[] = [];

  for (const filePath of filePaths) {
    const slug = filePathToSlug(filePath);
    const isIndex = path.basename(filePath).toLowerCase() === "index.md";
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);

    const fallbackTitle =
      slug.length === 0
        ? "Help Center"
        : titleizeSegment(slug[slug.length - 1]);

    const meta = normalizeFrontmatter(parsed.data, fallbackTitle);
    if (process.env.NODE_ENV === "production" && meta.draft) continue;

    docs.push({ slug, meta, isIndex });
  }

  return docs;
}

type TreeNode = {
  segment: string | null;
  slug: string[];
  indexDoc?: HelpDocSummary;
  pages: HelpDocSummary[];
  children: Map<string, TreeNode>;
};

function createTreeNode(segment: string | null, slug: string[]): TreeNode {
  return {
    segment,
    slug,
    pages: [],
    children: new Map<string, TreeNode>(),
  };
}

function ensureNodePath(root: TreeNode, slug: string[]): TreeNode {
  let current = root;
  for (let i = 0; i < slug.length; i++) {
    const segment = slug[i]!;
    const existing = current.children.get(segment);
    if (existing) {
      current = existing;
      continue;
    }
    const next = createTreeNode(segment, slug.slice(0, i + 1));
    current.children.set(segment, next);
    current = next;
  }
  return current;
}

function nodeToNavGroup(node: TreeNode): HelpNavGroup {
  const title =
    node.indexDoc?.meta.title ??
    (node.segment ? titleizeSegment(node.segment) : "Help Center");

  const order = node.indexDoc ? orderForMeta(node.indexDoc.meta) : 9999;

  const childGroups: HelpNavGroup[] = [];
  for (const child of node.children.values()) {
    childGroups.push(nodeToNavGroup(child));
  }
  childGroups.sort((a, b) => {
    return compareNavItems(
      { order: a.order, title: a.title },
      { order: b.order, title: b.title },
    );
  });

  const pages: HelpNavPage[] = node.pages
    .map((doc): HelpNavPage => {
      return {
        kind: "page",
        title: doc.meta.title,
        href: hrefForSlug(doc.slug),
        slug: doc.slug,
        order: orderForMeta(doc.meta),
      };
    })
    .sort((a, b) => compareNavItems(a, b));

  const items: Array<HelpNavGroup | HelpNavPage> = [];
  if (node.indexDoc && node.slug.length > 0) {
    items.push({
      kind: "page",
      title: node.indexDoc.meta.title,
      href: hrefForSlug(node.slug),
      slug: node.slug,
      order: orderForMeta(node.indexDoc.meta),
    } satisfies HelpNavPage);
  }

  items.push(...childGroups, ...pages);

  return {
    kind: "group",
    title,
    order,
    href:
      node.slug.length > 0 && node.indexDoc
        ? hrefForSlug(node.slug)
        : undefined,
    slug: node.slug.length > 0 ? node.slug : undefined,
    items,
  };
}

export async function getHelpNavTree(): Promise<HelpNavGroup> {
  const docs = await getAllHelpDocs();

  const root = createTreeNode(null, []);
  for (const doc of docs) {
    if (doc.isIndex) {
      const node = ensureNodePath(root, doc.slug);
      node.indexDoc = doc;
    } else {
      const parent = ensureNodePath(root, doc.slug.slice(0, -1));
      parent.pages.push(doc);
    }
  }

  return nodeToNavGroup(root);
}

export async function getHelpStaticSlugs(): Promise<string[][]> {
  const docs = await getAllHelpDocs();
  return docs.map((d) => d.slug).filter((slug) => slug.length > 0);
}
