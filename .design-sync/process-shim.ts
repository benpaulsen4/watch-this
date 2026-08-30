// The synced components pull in next/image and next/link, whose client runtime
// reads process.env.__NEXT_* at module scope. Design previews run in a bare
// browser with no `process` global, so the bundle threw on load and never
// assigned window.WatchThis — every component read as a missing export.
//
// Defining it before any component module is evaluated leaves those reads
// returning undefined, which is exactly how Next treats an unset flag.
// Imported first from entry.tsx: ESM evaluation follows import order.
// next/image's loader also reaches for CommonJS globals when given a real src.
const g = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
  __dirname?: string;
  __filename?: string;
};
g.process ??= { env: {} };
g.__dirname ??= "/";
g.__filename ??= "/index.js";

export {};
