#!/usr/bin/env node
/* Compiles the app's Tailwind v4 stylesheet into a static utility sheet for
   design-sync. `src/app/globals.css` is only `@import "tailwindcss"` + keyframes,
   so without this step the synced bundle would ship no utilities at all and
   every component would render unstyled.
   Output is consumed via cfg.cssEntry. Re-run on every sync (cfg.buildCmd). */
import fs from "node:fs";
import path from "node:path";

import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, ".design-sync/tailwind-entry.css");
const outDir = path.join(root, ".design-sync/.cache");
const out = path.join(outDir, "tailwind.css");

const css = fs.readFileSync(from, "utf8");
const result = await postcss([tailwind()]).process(css, { from, to: out });

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, result.css);

const kb = (Buffer.byteLength(result.css) / 1024).toFixed(1);
const rules = (result.css.match(/\{/g) || []).length;
console.log(`wrote ${path.relative(root, out)} — ${kb} KB, ~${rules} rules`);
if (Buffer.byteLength(result.css) < 5000) {
  console.error("! compiled CSS is suspiciously small — check @source globs");
  process.exit(1);
}
