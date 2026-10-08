# Series Finale 6 — UI Revisions from the E2E Review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every app finding from the e2e run (F1–F6). Make the story the phone default and the recap the desktop default, gating the recap on phones behind a finished story that is remembered on the account. Add friend swapping to the desktop comparison. Redesign the big-day, Venn and archetype visuals. Tidy the banner and poster sizing.

**Architecture:** One payload schema bump, to v3. It adds the generation timezone, labelled big-day timeline points, solo-tick hour counts and the shared-list completion share, and it makes the crew keep the most active collaborators. A new `story_completed_at` column mirrors `dismissed_at`. Everything else is presentation in `src/components/series-finale/`, verified by the existing e2e suite, which is updated to expect the fixes.

**Tech Stack:** Next.js 16, React 19, TanStack Query v5, Tailwind 4, Drizzle, Vitest, Playwright (e2e suite under `e2e/series-finale/`).

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`, amended by Ben's decisions of 2026-09-28 (below). Evidence: `e2e/series-finale/artifacts/report.md` (F1–F6) and `visual-review.md` (V1–V7).

## Ben's decisions (2026-09-28), binding

1. Fix every F finding (F1–F6).
2. The desktop comparison gets the ability to swap friends, as the story card already has.
3. **On phones the story is the default.** The recap is the default on desktop. On phones the recap becomes viewable once the whole story has been gone through. That completion is **remembered on the account** (a `story_completed_at` per recap, like `dismissed_at`), so it works across devices.
4. **Banner:** "Not now" is poorly placed on desktop; fix the layout. Remove "A card at a time on your year."
5. **Desktop recap:**
   - Shrink the posters in "Most watched, and least known" so the gap under the Genres card closes.
   - Redesign the Biggest day visual so it plainly shows when each episode was watched: timestamps on a time axis, labelled points.
   - Give the "You & X" card a bigger Venn with evenly placed text.
6. **Archetype visuals, as proposed:**
   - Weekday marathoner: the weekday strip.
   - Nightly ritualist: a 24-hour clock (hour counts added to the payload).
   - One genre only: the top genre's share.
   - Deep cut hunter: the film-popularity strip already in the story.
   - Completionist and serial abandoner: finished vs dropped.
   - Feast or famine: the months chart with its peaks.
   - Group watcher: the share of titles finished on shared lists.

   The weekday strip moves under "Watched by month" so everyone still sees it.

## Global Constraints

- **Voice:** plain, slightly wry, no exclamation marks. Every sentence must be backed by the payload (plan 4 S10/S16).
- **Style:** dark only, the seven brand palettes, one gradient treatment per view (P9 stands: the Share button and hero keep theirs). Reach for existing primitives.
- **Privacy:** anything new that names or describes another person (crew, compare, swap chips) stays inside the authenticated recap and story, and never reaches the share card (plan 5 P1 allowlist). New payload fields describing only the viewer are fine.
- **Build hygiene:** TypeScript strict with `noUncheckedIndexedAccess`. ESLint `--max-warnings=0`. Vitest and React Testing Library beside each file. `vi.unstubAllGlobals()` in `afterEach`.
- **Migrations:** generate with `npm run db:generate` only. **Never run `db:migrate` or `db:push` against `.env.local`'s DATABASE_URL, which is real.** Migrations are applied only to the e2e database, through `npm run e2e:migrate`.
- **Commits:** conventional commits, not pushed. The controller pushes at the end.
- **Phone:** viewport width below 768 px (Tailwind `md`). Desktop: 768 px and up.

---

### Task 1: Engine and schema v3

**Files:**
- `src/lib/series-finale/types.ts`, `aggregate.ts`, `archetype.ts` (read only), `service.ts`, and their tests.

**Changes:**
- `SERIES_FINALE_SCHEMA_VERSION` goes 2 → 3. Stored v2 rows regenerate on read (the existing path; there is no production data yet).
- `period.timezone: string`: the IANA zone the snapshot was generated in. `generateInZone` already has it.
- `bigDay.timeline: { at: string; title: string; episode: string }[] | null`. `title` is the show title from the cache. `episode` is `S02E03`, the same format as shame's `lastEpisode`. Viewer-only data.
- `rhythm.hourCounts: number[]`: 24 counts of **solo ticks** by local hour in the payload zone. `null` when solo ticks are below `SOLO_TICK_FLOOR`, the same gate as `lateShare`.
- `rhythm.sharedListShare: number | null`: the value `ArchetypeInput.collaborativeCompletedShare` already computes. Expose it; do not recompute it.
- **F3.** Crew membership is chosen by activity, not id.
  - Load the consenting collaborator ids (all of them).
  - Count each one's period episodes in ONE grouped query, in the viewer's period window (mirror `loadCollaboratorSlices`' window).
  - Keep the top `CREW_LIMIT` by episodes. Ties break by username, then id.
  - Then load full slices for those only.
  - Keep `CREW_LIMIT = 8`, and keep the cost bounded to one extra grouped query.
- Update the tests, and add:
  - the cap keeps the most active (the e2e case: 9 collaborators, highest-id is the heaviest → kept);
  - `hourCounts` sums to the solo-tick count and is null below the floor;
  - timeline points carry title and episode;
  - `period.timezone` is set.
- Plan 5's share allowlist (`src/lib/series-finale/share.ts`) must stay exact. None of the new fields are added to it, and its exact-key test stays green.

### Task 2: Remembered story completion

**Files:**
- Migration via `npm run db:generate` (0013).
- `schema.ts`.
- `service.ts` (list/payload carry `storyCompletedAt`).
- New route `src/app/api/series-finale/[period]/story-complete/route.ts` + test.
- `src/hooks/useSeriesFinale.ts` (+ `useCompleteStory`).

**Changes:**
- `series_finale.story_completed_at timestamptz null`.
- `POST /api/series-finale/{period}/story-complete` marks it. It is idempotent: the first timestamp wins. It is authenticated, returns 404 when the snapshot doesn't exist, and sends `Cache-Control: private, no-store`, mirroring `dismiss`.
- The payload response and list items carry `storyCompletedAt: string | null`. Keep this out of the stored payload: it is row metadata, returned beside `payload` as `dismissedAt` is.
- `useCompleteStory` updates both the payload query and the list query caches optimistically.

### Task 3: Phone story default and recap gate

**Files:**
- `src/app/(authenticated)/series-finale/[period]/page.tsx`
- `RecapClient.tsx`
- `StoryReel.tsx`
- `story-cards/SummaryCard.tsx`
- `SeriesFinaleBanner.tsx`
- `ProfileFinaleRows.tsx`
- their tests

**Behaviour:**
- **Entry points.** Every entry point (banner CTA, profile rows) links to `/series-finale/{label}`, the recap route.
- **Phone, story not finished.** On a phone viewport, a recap route whose `storyCompletedAt` is null does `router.replace` to `/series-finale/{label}/story`.
  - Decide with a client media query (`(max-width: 767px)`), in a hook that is SSR-safe: it assumes desktop until mounted, so the page renders nothing gated before the check.
  - Avoid a flash of the recap: render a loading state until both the viewport and the payload are known.
- **Reaching the summary card.** It calls `useCompleteStory` (once) and shows a "See the full recap" link to `/series-finale/{label}` beneath Share.
- **Closing the story.**
  - On a phone, before completion, the close button goes to `/dashboard`. Returning to the recap would bounce straight back into the story.
  - After completion, and on desktop, it goes to the recap as now.
- **Desktop.** Unchanged: the recap is default, and "Play as story" still opens the story. Desktop never gates.
- **Banner CTA.** Now goes to the recap route, which on phones sends you on to the story.
- **Tests:**
  - A phone-width without completion redirects.
  - A phone with completion shows the recap.
  - Desktop never redirects.
  - The summary card marks completion once.
  - Close targets are correct in each state.

### Task 4: Layout fixes and the banner

**Files:**
- `RecapClient.tsx`
- `PageHeader` (only if it needs a prop; prefer a local fix)
- `story-cards/SummaryCard.tsx`
- `CompareSplit.tsx`
- `ShareButton.tsx`
- `SeriesFinaleBanner.tsx`
- tests

**Changes:**
- **F1.** Give the recap's `Band` rows an explicit single column below `lg` (`grid-cols-1`, and `minmax(0,1fr)` columns at `lg`) so nothing forces the page wider than the viewport. Check every Band.
- **F2.** The header title must never wrap into the fixed bar. Give the title column `min-w-0` and truncate. On phones, the header's actions must fit beside it: use icon-only buttons with aria-labels below `sm` if needed.
- **F4.** Long unbreakable usernames wrap inside the story summary card (`break-words` / `[overflow-wrap:anywhere]`).
- **F5.** The compare disc labels ("only {name}") never clip at either size, at DPR 2. Wrap or shrink rather than truncate. Long usernames stay inside the disc, or move the label beneath the disc (Task 5's Venn redesign may subsume this; coordinate).
- **F6.** The Share failure message must not live inside the fixed-height header. Render it as a small inline alert below the header, or as a toast using the app's existing toast/notice pattern if one exists. The button itself stays put.
- **Banner:**
  - Remove "A card at a time on your year."
  - Lay out the CTA and "Not now" as one clean action group: on desktop, side by side, right-aligned and vertically centred with the text block; on phones, stacked full-width.
  - Look at artboard 1a/1h (`.superpowers/sdd/2026-08-31-series-finale-4-ui/artboards/1a-1h-banner.html`) for the intended feel.
- **Posters.** In "Most watched, and least known", reduce the poster size on desktop so the card's height roughly matches Genres. Target: the two cards in that row end within ~40 px of each other at 1440 px for ava's year.

### Task 5: Big day, Venn, desktop swap

**Files:**
- `BigDayTimeline.tsx`
- `CompareSplit.tsx`
- the recap compare panel in `RecapClient.tsx`
- `story-cards/CompareCard.tsx` (share the swap control)
- tests

**Biggest day:**
- A horizontal time axis in the snapshot's zone (`payload.period.timezone`). It spans from the hour before the first point to the hour after the last, with hour tick labels (`13:00`, `14:00`…).
- Each point is placed at its local time. Its accessible label and hover title read "`13:05 · The Bear S02E03`".
- Points closer than a few pixels stack vertically, not overlap.
- Beneath: "First at 13:05, last at 23:35 · 14 episodes ticked one at a time". Keep the existing true disclosures for a null or short timeline.
- If the timeline has ≤ 2 points, show a simple list of times and episodes instead of an axis.
- The story's big-day card uses the same component.

**Venn (`CompareSplit`):**
- Bigger discs.
- Numbers and labels evenly placed: "only you" centred in the left lune, "both" in the lens, "only {name}" in the right lune.
- Labels may sit below the numbers, inside each region, with no truncation (F5).
- Keep the size variants. Desktop recap uses the larger size, sized so the panel's empty space goes away.

**Desktop swap:**
- The recap compare panel gets the story's "Swap in" chips, extracted into one shared `ComparePeerPicker` used by both. Buttons use `aria-pressed`.
- Default peer: `compare[0]`, as now.
- Swapping changes the Venn, the overlap line, the "{name} finished, you dropped" row and the "On both lists" row.

### Task 6: Archetype visuals

**Files:**
- New `src/components/series-finale/ArchetypeVisual.tsx` (+ test).
- The recap "Your type" panel and "Watched by month" panel.
- The story rhythm card.

**Changes:**
- `ArchetypeVisual({ payload })` picks by `rhythm.archetype`:
  - **Weekday marathoner:** the existing weekday strip, with the top day highlighted.
  - **Nightly ritualist:** a 24-hour clock, either a radial or a 24-bar strip, from `rhythm.hourCounts`. Highlight 21:00–03:00.
  - **One genre only:** a single bar showing the top genre's share, from `genres[0]`, labelled "{genre}: {n}% of what you finished".
  - **Deep cut hunter:** the story's popularity strip (`PopularityStrip`, from `niche.filmPopularities`). Move it to a shared file if it's still inside a story card.
  - **Completionist / serial abandoner:** a two-segment bar, finished vs dropped (`headline.titlesCompleted` vs `titlesDropped`), with the ratio in words.
  - **Feast or famine:** a compact months sparkline with the peak months highlighted.
  - **Group watcher:** a single bar showing `rhythm.sharedListShare`, labelled "{n}% of what you finished was on a shared list".
  - **null archetype:** no visual.
  - Every visual has an `aria-label` sentence and degrades to nothing if its data is null.
- **The weekday strip moves under "Watched by month"** as a secondary "By day of the week" row for every archetype. The weekday marathoner shows it in both places, which is fine; or the implementer may show it only once, under the months chart, and give the marathoner card a larger version. Pick one and justify it.
- The archetype copy (S22) stays exactly as is.

### Task 7: E2E suite follows the changes

**Files:** `e2e/series-finale/**`

**Changes:**
- The F1, F2, F4 and F6 checks now expect the fix and must pass.
- F5 becomes a real check: every compare label's `scrollWidth <= clientWidth` on phone, plus the screenshots.
- F3 flips to "fixed": in e2e_jon's recap the crew keeps the most active.
- New checks:
  - Desktop compare swap: pick fay, and the split/facts match the oracle for fay.
  - Phone recap route redirects to the story before completion.
  - The summary card marks completion (verify via read-only `db.sh psql` that `story_completed_at` is set).
  - After completion the phone recap route shows the recap.
  - Close before completion goes to `/dashboard`.
  - The desktop banner CTA goes to the recap.
  - The banner has no "A card at a time" copy.
  - The big-day axis shows hour ticks, and each point's label matches the oracle (add `bigDayTimeline` to the oracle: local `HH:MM` + title + episode).
  - The archetype visual for each seeded archetype that exists in the cast (ava weekday-marathoner, flo completionist, others as seeded) is present with a sensible aria-label.
- Phone specs that visited the recap now go through the story, or mark completion first. Screenshots are regenerated.
- Run `npm run e2e:all` and `npm run e2e:gallery`. Target: exit 0, zero failing checks.
