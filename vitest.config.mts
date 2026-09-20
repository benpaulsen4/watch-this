import react from "@vitejs/plugin-react";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // vitest 4 narrowed `vi.restoreAllMocks()` to spies created with
    // `vi.spyOn`: it no longer touches `vi.fn()` mocks, so the per-file
    // `beforeEach(() => vi.restoreAllMocks())` hooks stopped clearing the call
    // history and one-off implementations of module mocks, and state leaked
    // between tests. Resetting every mock before each test restores the
    // behaviour those hooks were written against, for every file at once.
    mockReset: true,
    // Agent worktrees under .claude/ are full checkouts of this repo. Their
    // test files would otherwise be collected here and resolve "@/" against
    // the alias below - i.e. this repo's src, not their own - so they fail
    // against a source tree they were never written for.
    exclude: [...configDefaults.exclude, ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      // Scoped to source extensions: vitest 4 hands every matched file to the
      // coverage remapper, so a bare "src/**" makes it try to parse README.md,
      // globals.css and the PNGs as JavaScript.
      include: ["src/**/*.{ts,tsx}", "tools/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "src/test/**",
        // Type-only modules compile to nothing, so they report as 0% covered
        // and drag the totals down without describing any real gap.
        "**/types.ts",
        "**/*.d.ts",
        // Generated or declarative surfaces with no branching logic of their
        // own: the Drizzle schema, and Next's file-convention exports.
        "src/lib/db/schema.ts",
        "src/app/**/layout.tsx",
        "src/app/**/{sitemap,robots,opengraph-image,twitter-image}.ts?(x)",
      ],
      // SUPPLY-12: floors, not targets. Set just below the numbers actually
      // measured on this branch -- statements 56.93, branches 51.95,
      // functions 66.91, lines 57.31 -- so ordinary churn does not fail CI and a
      // real drop still does. Raise them when coverage genuinely improves; do
      // not lower them to make a red build green.
      //
      // Re-baselined for vitest 4, which made coverage-v8's AST-aware
      // remapping the default: the numbers are no longer counted in the same
      // unit, so the old floors could not be carried over. v4 has no option to
      // restore the old unit -- experimentalAstAwareRemapping is gone from the
      // provider entirely -- so the only choice was to re-derive them. The
      // headroom here (1.9 - 2.3 points on each metric) is the same as the old
      // floors carried, so this is a re-baseline and not a relaxation.
      //
      // For anyone re-deriving it: running THIS tree under both majors gives
      // v3 63.83% statements (10418/16320) and 77.71% branches (1723/2217)
      // against v4's 56.93% (2627/4614) and 51.95% (1784/3434). Both
      // percentages fall, but the statement denominator shrank 3.5x while the
      // branch denominator grew 1.5x: the denominators are source constructs
      // now rather than raw v8 ranges, so the two pairs are not the same
      // measurement and neither ratio is comparable to the other. The
      // 60.35/76.9 figures this comment used to quote predate later tests and
      // no longer reproduce under either version.
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 65,
        lines: 55,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
