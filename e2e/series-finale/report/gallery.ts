// The run's gallery and report, built from what the run left in artifacts/:
//
// - artifacts/index.html: a dark, self-contained page for reviewing the run by
//   eye. Findings first, then counts and failed checks, then every screenshot
//   grouped by surface with its projects side by side. Images are referenced
//   by relative path and the page has no scripts.
// - artifacts/report.md: the same results as text, plus the environment, the
//   seeded cast, ava's oracle block, timings, skips and every check.
//
// Inputs (ruling E8): evidence.jsonl, results-readonly.json and
// results-mutating.json (one per Playwright invocation), oracle.json,
// screenshots/<project>/**, cards/*.png, and mutation-i1/ when the one-off I1
// mutation check (ruling E9) has left its evidence there.
//
// Nothing here touches the database or the app: `npm run e2e:gallery` can
// rebuild both files from the artifacts at any time.
//
// The parts: load.ts reads the artifacts and links screenshots to checks,
// findings.ts classifies and counts, html.ts and markdown.ts render.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderHtml } from "./html";
import { loadArtifacts } from "./load";
import { renderMarkdown } from "./markdown";

/** Writes artifacts/index.html and artifacts/report.md; returns their paths. */
export function writeGallery(artifactsDir: string): { html: string; markdown: string } {
  const artifacts = loadArtifacts(artifactsDir);
  const html = join(artifactsDir, "index.html");
  const markdown = join(artifactsDir, "report.md");
  writeFileSync(html, renderHtml(artifacts));
  writeFileSync(markdown, renderMarkdown(artifacts));
  return { html, markdown };
}
