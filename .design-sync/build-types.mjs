#!/usr/bin/env node
/* Emits a .d.ts tree for design-sync's prop extraction. The repo is an app, so
   it ships no declarations, and without them every <Name>.d.ts the converter
   emits is an empty `[key: string]: unknown` bag: the design agent gets no
   typed props at all. The converter only looks for a types tree in a few
   fixed places (dist/types among them), hence the output dir.
   Builds the whole project, not just entry.tsx: the app's tsconfig is what
   pulls in Next's global types (fetch's `next` option), and a narrower include
   loses them. Re-run on every sync (cfg.buildCmd). */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "dist/types");

// tsc refuses to overwrite its own inputs, and the parent tsconfig's
// **/*.ts include would otherwise pick up a previous run's output.
fs.rmSync(outDir, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [path.join(root, "node_modules/typescript/bin/tsc"), "-p", path.join(root, ".design-sync/tsconfig.types.json")],
  { stdio: "inherit" },
);
// The converter's .d.ts glob skips dot-directories, so .design-sync/'s own
// declarations (BrandLogoProps) would never be read. Same depth, so the
// relative imports inside still resolve.
fs.renameSync(path.join(outDir, ".design-sync"), path.join(outDir, "design-sync"));
console.log(`wrote ${path.relative(root, outDir)}/`);
