import eslintConfigNext from "eslint-config-next";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

const config = [
  {
    // Agent worktrees under .claude/ are full checkouts of this repo, so
    // linting them re-reports every file against whatever branch they hold.
    ignores: [".claude/**", ".next/**"],
  },
  ...eslintConfigNext,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "import/no-duplicates": "error",
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Scoped to TypeScript files because that is where eslint-config-next
    // registers the @typescript-eslint plugin; referencing the rule for .mjs
    // config files, where the plugin is absent, is a configuration error.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "@next/next/no-img-element": "off",
      // The DB and fetch doubles lean on `(db as any)` and friends throughout;
      // there are ~800 occurrences across the suites. `lint:ci` runs with
      // --max-warnings=0, so this has to be off rather than a warning. The rule
      // is enabled for production code above, which is where it buys something.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/components/ui/QRCode.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: [
      "src/components/profile/StreamingPreferences.tsx",
      "src/components/search/SearchClient.tsx",
      "src/hooks/useFragmentNavigation.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
