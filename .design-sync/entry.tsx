// Design-sync bundle entry.
//
// This repo is a Next.js app, not a published package, so there is no dist/
// entry to bundle. This barrel is the curated public surface synced to Claude
// Design: the ui/ primitives plus the domain components that render standalone.
//
// Deliberately excluded: async Server Components (TrendingStrip, ListItems,
// ListRecommendations) and anything requiring the Next router or live data.
// ReactQueryProvider is exported for cfg.provider, not as a card.

import "./process-shim";

export * from "../src/components/ui/Badge";
export * from "../src/components/ui/Button";
export * from "../src/components/ui/Card";
export * from "../src/components/ui/Dropdown";
export * from "../src/components/ui/Input";
export * from "../src/components/ui/LoadingSpinner";
export * from "../src/components/ui/Modal";
export * from "../src/components/ui/PageHeader";
export * from "../src/components/ui/ProfileImage";
export { default as QRCode } from "../src/components/ui/QRCode";
export * from "../src/components/ui/Switch";

export * from "../src/components/activity/ActivityEntry";
export * from "../src/components/content/ContentCard";
export * from "../src/components/content/ContentCardSkeleton";
export * from "../src/components/content/StatusBadge";
export * from "../src/components/content/StatusSegmentedSelector";
export * from "../src/components/help/Markdown";
export * from "../src/components/landing/LandingSpotlightClient";
export * from "../src/components/lists/ListCard";
export * from "../src/components/search/SearchInput";

export * from "../src/components/providers/AuthProvider";
export * from "../src/components/providers/ReactQueryProvider";
export * from "./preview-root";
