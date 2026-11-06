#!/usr/bin/env node
// Gzipped JavaScript each page loads up front, read from a finished `next build`.
// Next 16 no longer prints First Load JS, so this rebuilds it: the shared root
// chunks plus every synchronous client chunk the page's manifest lists.
//
// Usage: node tools/page-bundle-sizes.mjs [--json] [--compare baseline.json]
//   --json             print { page: bytes } for saving as a baseline
//   --compare <file>   print each page's change against a saved baseline
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const NEXT = ".next";
const args = process.argv.slice(2);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const gzipCache = new Map();
function gzipped(chunk) {
  const file = join(NEXT, chunk.replace(/^\/_next\//, ""));
  if (!gzipCache.has(file)) {
    gzipCache.set(file, gzipSync(readFileSync(file)).length);
  }
  return gzipCache.get(file);
}

const buildManifest = JSON.parse(
  readFileSync(join(NEXT, "build-manifest.json"), "utf8"),
);
const rootChunks = buildManifest.rootMainFiles.map((file) => `/_next/${file}`);

const sizes = {};
for (const file of walk(join(NEXT, "server", "app"))) {
  if (!file.endsWith("page_client-reference-manifest.js")) continue;
  const page =
    "/" + relative(join(NEXT, "server", "app"), file).replace(/\/?page_client-reference-manifest\.js$/, "");
  const source = readFileSync(file, "utf8");
  const manifest = JSON.parse(source.slice(source.indexOf("= {") + 2).replace(/;\s*$/, ""));
  const chunks = new Set(rootChunks);
  for (const module of Object.values(manifest.clientModules)) {
    if (module.async) continue;
    for (const chunk of module.chunks) chunks.add(chunk);
  }
  sizes[page] = [...chunks].reduce((total, chunk) => total + gzipped(chunk), 0);
}

const pages = Object.keys(sizes).sort();

if (args.includes("--json")) {
  console.log(JSON.stringify(sizes, null, 2));
} else if (args.includes("--compare")) {
  const baseline = JSON.parse(readFileSync(args[args.indexOf("--compare") + 1], "utf8"));
  let largest = { page: "", delta: -Infinity };
  for (const page of pages) {
    const delta = sizes[page] - (baseline[page] ?? 0);
    if (delta > largest.delta) largest = { page, delta };
    console.log(`${String(delta).padStart(7)}  ${String(sizes[page]).padStart(8)}  ${page}`);
  }
  console.log(`\nLargest growth: ${largest.delta} bytes on ${largest.page}`);
} else {
  for (const page of pages) console.log(`${String(sizes[page]).padStart(8)}  ${page}`);
}
