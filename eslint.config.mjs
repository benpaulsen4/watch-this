import eslintConfigNext from "eslint-config-next";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

const config = [
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
    files: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "@next/next/no-img-element": "off",
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
