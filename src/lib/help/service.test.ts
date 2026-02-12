import { describe, expect, it } from "vitest";

import { getHelpDocBySlug, getHelpNavTree, getHelpStaticSlugs } from "./service";

describe("help content service", () => {
  it("returns static slugs for index pages", async () => {
    const slugs = await getHelpStaticSlugs();
    const keys = new Set(slugs.map((s) => s.join("/")));

    expect(keys.has("getting-started")).toBe(true);
    expect(keys.has("discover")).toBe(true);
    expect(keys.has("lists")).toBe(true);
    expect(keys.has("collaboration")).toBe(true);
    expect(keys.has("tracking")).toBe(true);
    expect(keys.has("profile")).toBe(true);
    expect(keys.has("faq")).toBe(true);
  });

  it("resolves folder slugs to index.md", async () => {
    const doc = await getHelpDocBySlug(["lists"]);
    expect(doc.meta.title).toBe("Lists");
  });

  it("builds a navigation tree with expected top-level sections", async () => {
    const nav = await getHelpNavTree();
    const topTitles = nav.items
      .filter((i) => i.kind === "group")
      .map((i) => i.title);

    expect(topTitles).toContain("Getting Started");
    expect(topTitles).toContain("Discover & Details");
    expect(topTitles).toContain("Lists");
    expect(topTitles).toContain("Collaboration");
    expect(topTitles).toContain("Watch Status & Tracking");
    expect(topTitles).toContain("Profile & Data");
    expect(topTitles).toContain("FAQs & Troubleshooting");
  });
});

