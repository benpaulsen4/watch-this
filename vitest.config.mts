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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
