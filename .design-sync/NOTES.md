# design-sync notes — watch-this

Repo-specific gotchas for future syncs. See `.design-sync/config.json` for the
machine-readable side.

## Shape

- This repo is a **Next.js app, not a published package** — there is no `dist/`
  and no Storybook. The bundle is built from a curated barrel,
  `.design-sync/entry.tsx`, passed via `--entry`. Without `--entry` the build
  dies on `node_modules/watch-this/package.json` (npm won't self-install).
- The barrel is the synced surface. Add a component there **and** to
  `componentSrcMap` — a name missing from `componentSrcMap` never becomes a card,
  because there is no `.d.ts` tree to discover exports from.

## Things that will bite you

- **`process` is not defined.** `next/image` and `next/link` read
  `process.env.__NEXT_*` at module scope. `.design-sync/process-shim.ts` is
  imported first from the barrel to define it; ESM evaluation order is what makes
  this work, so it must stay the first import. Remove it and *every* component
  fails as a missing `window.WatchThis` export.
- **Tailwind ships nothing by default.** `src/app/globals.css` is only
  `@import "tailwindcss"` plus keyframes. `.design-sync/build-css.mjs` compiles
  the real utility sheet (`cfg.buildCmd`); skip it and every card renders
  unstyled. Re-run it whenever component class usage changes.
- **Geist does not ship from source.** The app loads it via `next/font/google`,
  so there is no `@font-face` in the repo. The woff2 subsets in
  `.design-sync/fonts/` were lifted from `.next/static/media` and are wired via
  `cfg.extraFonts`. `--font-geist-sans` is defined in
  `.design-sync/tailwind-entry.css`, not by the app.
- **Dark theme is not automatic.** The app's real root is
  `<html class="dark">` + `bg-gray-950 text-gray-100` (src/app/layout.tsx).
  `.design-sync/preview-root.tsx` reproduces it as `cfg.provider`; without it
  cards render dark-on-white and `useMutation` components throw.

## Excluded, and why

- **Async Server Components cannot render client-side** — `TrendingStrip`,
  `ListItems`, `ListRecommendations` are all `export default async function`.
  Do not re-add them; they will never preview.
- Router-coupled (`next/navigation`) and live-data components are out of scope:
  ListFilters, ListHeader, ProfileClient, SearchClient, ActivityFeed, and the
  data-loading modals.

## Component findings (repo bugs, not sync bugs)

- **`Dropdown` renders a doubled placeholder.** With nothing selected,
  `<SelectValue />` (src/components/ui/Dropdown.tsx:88) emits react-aria's own
  "Select an item" while the component *also* renders its `placeholder` span,
  which defaults to `"Select..."` — so the trigger reads
  "Select an item Select...". Previews pass `placeholder=""` to work around it.
  A real fix belongs in the component (give `SelectValue` children, or drop the
  extra span).

## Known render warns

- `[GRID_OVERFLOW]` is *resolved*, not suppressed: `PageHeader`, `ProfileImage`,
  `QRCode` and `LandingSpotlightClient` carry `cardMode: "column"`, and `Modal`
  carries `cardMode: "single"` (it renders a fixed full-viewport overlay).
  A column card cannot re-flag `wide`, so these should stay quiet.
- Console noise under the render harness, expected and harmless: AuthProvider's
  session fetch fails with `Fetch API cannot load file:///.../api/auth/session`.
  It is caught inside the provider and yields `user: null`. Not a render failure.
- Final state at first sync: **26/26 previews render cleanly**, 0 bad, 0 thin,
  0 identical-variant, 0 floor cards.

## Re-sync risks — read this first

- **Mock data is inlined in `.design-sync/previews/*.tsx` and will rot.**
  `ContentCard` (TMDBContent), `ListCard` (ListListsResponse) and `ActivityEntry`
  (ActivityItem) construct literal objects. If those interfaces gain a required
  field, the previews still compile as JS but may render wrong. Re-check them
  against `src/lib/**/types.ts` whenever the schema moves.
- **Remote images can never render here.** `next/image` rejects
  `image.tmdb.org` ("hostname not configured") because the allowlist in
  `next.config.ts` is compile-time only. So `ContentCard` uses
  `posterPath: null` and `ListCard` uses `posterPaths: []` — and the ListCard
  previews are deliberately *empty* lists (`itemCount: 0`) so the card doesn't
  claim 12 items above a "Nothing here" placeholder. Don't "fix" this by adding
  poster paths; it throws and blanks the whole component.
- **The Tailwind safelist in `.design-sync/tailwind-entry.css` is load-bearing.**
  Tailwind only emits classes it finds in scanned sources, so without the
  `@source inline(...)` block the design agent's own layout classes silently
  produce no CSS. It covers seven brand palettes plus the common layout scale;
  colours outside them (emerald, teal, indigo…) are intentionally absent. Widen
  the list rather than removing it.
- **Geist is copied out of `.next/static/media`.** Those filenames are content
  hashes and change whenever Next rebuilds fonts. The copies under
  `.design-sync/fonts/` are committed, so they survive — but if the app changes
  its font, re-copy them and update `.design-sync/fonts/geist.css`.
- **`runtimeFontPrefixes: ["Geist Fallback"]`** suppresses a *correct* warning:
  that family is next/font's metric-matched alias for `local(Arial)` and has no
  file by construction. Real Geist does ship (5 woff2 subsets).
- Verified state lives in the uploaded `_ds_sync.json`, not in git. A re-sync
  fetches it and re-verifies only what changed.
- Only partially exercised: interaction states (hover, focus rings, open
  dropdown popovers) are never captured — the render check is static.
