import react from "@vitejs/plugin-react";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Agent worktrees under .claude/ are full checkouts of this repo. Their
    // test files would otherwise be collected here and resolve "@/" against
    // the alias below - i.e. this repo's src, not their own - so they fail
    // against a source tree they were never written for.
    exclude: [...configDefaults.exclude, ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      include: ["src/**", "tools/**"],
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
      // SUPPLY-12: floors, not targets. Set just below the measured numbers at
      // the time of writing (60.15 / 77.09 / 68.71 / 60.15) so ordinary churn
      // does not fail CI, and a real drop still does. Raise them when coverage
      // genuinely improves; do not lower them to make a red build green.
      thresholds: {
        statements: 58,
        branches: 75,
        functions: 66,
        lines: 58,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
