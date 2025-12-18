import eslintConfigNext from "eslint-config-next";

const config = [
  ...eslintConfigNext,
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
