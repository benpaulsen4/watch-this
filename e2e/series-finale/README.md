# Series Finale end-to-end tests

Playwright specs that exercise the Series Finale feature against a real,
production build of the app and a throwaway Postgres database. Nothing here
touches the real database: every script that connects builds its environment
through `buildE2eEnv()` and refuses to run unless `DATABASE_URL` points at
`postgresql://(localhost|127.0.0.1):5433/watchthis_e2e`
(`env/test-env.ts#assertE2eDatabaseUrl`).

## One-time setup

The matching Playwright browsers must already be cached locally
(`~/.cache/ms-playwright`) -- this suite never runs `playwright install`. If
`npx playwright --version` or the browser revisions don't match what's
cached, stop and ask before downloading anything.

The seeder fetches the cast's TMDB metadata through the app's own cache
code, so a run needs network access to TMDB and `TMDB_API_KEY` (from the
environment, else the one line in the repo's `.env.local`; never printed).

## Running

```bash
npm run e2e:db:up       # starts postgres:17 in podman, localhost:5433 only
npm run e2e:migrate     # drizzle-kit migrate against the e2e database
npm run e2e:build       # next build (production)
npm run e2e:start       # the app on :3100, built env; keep it running in another terminal for:
npm run e2e:register    # passkeys for every signing-in persona via /auth; refuses unless the server
                        # on :3100 is the e2e one (see "Safety"); `-- <username>...` registers just those
npm run e2e:seed        # the cast's history, lists, TMDB caches and the 2025 cohort snapshots
                        # (needs e2e:register first); `-- --resolve-only` just resolves the catalogue lock
npm run e2e:oracle      # artifacts/oracle.json: what each recap must show, from plain SQL
npm run e2e:test        # empties artifacts/evidence.jsonl, runs Playwright twice (starts/reuses the
                        # app via run.ts start): the read-only projects, then desktop-mutating
                        # whatever the first run's result; fails if either failed; then scans
                        # artifacts/ for secrets. `-- <playwright args>` go to both runs; args
                        # with --project run as one plain `playwright test` instead
npm run e2e:scan-secrets  # fail if any artifact holds the TMDB key or WebAuthn secret (names files only)
npm run e2e:gallery     # artifacts/index.html + artifacts/report.md from whatever artifacts/ holds
                        # (no db, no app), then the secret scan
npm run e2e:db:reset    # a fresh, empty container (down + up)
npm run e2e:db:down     # stops and removes the throwaway container
```

Or everything in one go:

```bash
npm run e2e:all   # about 5-10 minutes; nothing may be listening on :3100 when it starts.
                  # evidence, screenshots, cards and the old gallery/report cleared; db reset,
                  # migrate, build, start the app, register, seed, oracle, the two Playwright
                  # runs as e2e:test, the gallery and report (built even when tests fail), secret
                  # scan. Stops the app it started; leaves the database up -- after the mutating
                  # specs it holds bo renamed, cy opted out and her 2025 story gone through, so
                  # `npm run e2e:seed` alone cannot restore it (reset first, or rename bo back);
                  # npm run e2e:db:down removes it.
```

Individual Playwright invocations work too, e.g.:

```bash
npx playwright test --project=desktop e2e/series-finale/specs/00-smoke.e2e.ts
```

A bare `npx playwright test` runs every project, `desktop-mutating` last by
config order, but nothing holds it back if a read-only project is still
failing or was not selected -- `npm run e2e:test` is the ordered way.

## Safety: the server on port 3100

Playwright reuses whatever answers on `http://localhost:3100`, and the specs
register accounts, rename users and withdraw consent through it. A server
started any other way -- a plain `npx next start -p 3100` loads
`.env.local`, whose `DATABASE_URL` is the real database -- would take all of
that. So before anything signs in, the process listening on 3100 must have
been started with `DATABASE_URL` equal to the e2e URL (read from
`/proc/<pid>/environ`; the value is never printed), else the run stops with
"Refusing to run":

- `env/global-setup.ts` (Playwright's `globalSetup`, after the `webServer`
  step): every `e2e:test`, `e2e:all` and direct `npx playwright test`;
- `e2e:test` before it starts Playwright (a foreign listener; nothing
  listening is fine, Playwright then starts `run.ts start`);
- `e2e:register` (the e2e server must be up), which also fails unless each
  new account's row is in the e2e database (read through podman);
- `e2e:all` refuses anything already listening before it starts its own.

Stop the other server and run again. A listener this user cannot inspect
counts as foreign.

## Dated for 2026

The cast is written for runs during 2026: 2025 is the newest completed year
and 2026 is "not over"; e2e_neo joins in 2026; ava has 2026-01-01 zone-edge
episodes and a 2026 planning film. Once 2026 ends (in Australia/Brisbane,
the cast's earliest zone) the app completes 2026, and a wave of checks would
fail as if the app had regressed. So `run.ts` (every subcommand but
`gallery` and `scan-secrets`) and the Playwright global setup refuse to run
from 2027-01-01 Brisbane time. To run again, move the cast forward a year:
`LAST_COMPLETED_YEAR` and `YEARS` in `seed/oracle.ts`, the years the specs
hard-code (grep `specs/` for 2023-2026), neo's `createdAt` and ava's 2026
dates in `seed/personas.ts`, then `SUITE_LAST_DAY` in `env/test-env.ts`.

## Layout

- `env/db.sh` -- up/down/reset/psql for the throwaway podman Postgres
  container (`watchthis-e2e-pg`, no named volume, so `down` erases all data).
- `env/test-env.ts` -- the safety guard (`assertE2eDatabaseUrl`) and
  `buildE2eEnv()`, the single explicit environment every child process
  (migrate, seed, build, start, Playwright's own `webServer`) is given.
  `.env.local`'s real `DATABASE_URL` is never inherited.
- `env/run.ts` -- `npm run e2e:*` scripts all funnel through this so every
  subcommand asserts the database URL before doing anything.
- `env/server-guard.ts` -- who listens on 3100 (`/proc/net/tcp{,6}` and
  `/proc/<pid>/fd`) and whether it was started with the e2e `DATABASE_URL`:
  `assertE2eServer`, `assertNoForeignServer` (see "Safety").
- `env/global-setup.ts` -- Playwright's `globalSetup`: the date guard and
  `assertE2eServer` before any spec.
- `env/scan-secrets.ts` -- `findSecretLeaks`: a byte scan of `artifacts/`
  for the run's secrets. `playwright.config.ts` holds no secrets and never
  calls `buildE2eEnv()` (its reporters serialise the config); the web server
  is started through `run.ts start`, which builds the env itself.
- `env/register.ts` -- registers accounts through the real `/auth` UI and
  saves `.auth/<username>.credential.json` (the passkey) and
  `.auth/<username>.json` (signed-in storage state). Re-run safe. Refuses
  unless the e2e server is the one on 3100, and fails if a registered row is
  not in the e2e database.
- `support/auth.ts` -- Chromium's CDP virtual authenticator:
  `registerViaUi`, `signInAs` (swaps the saved passkey into the
  authenticator and refreshes its sign counter afterwards; with
  `{ navigate: false }` it signs in on the /auth page already showing, with
  no page load, so an account switch stays in one document), `signOut`
  (through the profile page's Logout), `storageStatePath`.
- `support/shots.ts` -- `shot` / `shotElement` write
  `artifacts/screenshots/<project>/<name>.png`. `shotElement` crops the
  element out of a full-page capture by its document box: on a phone page
  wider than the viewport (F1) mobile emulation zooms out and Playwright's
  own element shots drift down the page.
- `support/evidence.ts` -- `check()`: a soft assertion that also appends a
  line to `artifacts/evidence.jsonl`; `note()`: an informational line
  (timings) that never fails the test. Each line records its spec file.
- `report/` -- `npm run e2e:gallery` (and the end of `e2e:all`).
  `load.ts` reads evidence.jsonl, both invocations' results JSON (a
  truncated file is named, not stack-traced), oracle.json, the screenshots
  and cards (and `artifacts/mutation-i1/` if present) and links each
  screenshot to its checks (`RULES`); `findings.ts` holds the findings, the
  notes, the "not automated" list and the counts; `html.ts` and
  `markdown.ts` render; `gallery.ts` writes
  - `artifacts/index.html`: a dark, script-free page with relative image
    paths -- findings F1-F6 with their status (FIXED while every check a
    finding covers passes, REPRODUCED when one fails), checks and screenshots,
    counts per invocation and project, failed checks (expected vs actual),
    the I1 mutation check, notes, then every screenshot by surface (share
    cards, banner, recap, story, profile, states, consent and rename before
    and after, account switch) with its projects side by side and each
    caption linking the checks it illustrates (`RULES`, by shot name), and
    every check at the end;
  - `artifacts/report.md`: the same as text, plus the environment, the
    seeded cast, ava's 2025 oracle block, timings, skips, what is not
    automated, and every screenshot no check links to.

  The findings' diagnoses and plan 6's fixes are written in `FINDINGS`;
  whether each one holds, and its evidence, comes from the run. All six
  were fixed in plan 6, so a failing check of one is a regression. A failing
  check no finding explains is listed as unclassified.
- `support/oracle.ts` -- `oracleYear(username, year)` and
  `oracleAvailableYears(username)`, read from `artifacts/oracle.json`.
- `support/pages.ts` -- shared page helpers: `listResponse` (the page's
  `GET /api/series-finale`), `openDashboard` (waits for that list and
  network idle), `banner` / `BANNER_READY` (the dashboard banner),
  `becomesVisible` (a soft visibility wait whose result goes through
  `check()`), and the app's wording rules: `pluralise` (counts),
  `words` / `wordValue` (small numbers in words, both ways),
  `capitalise`, `dayMonth` (a date key as "28 December"),
  `monthName` / `weekdayName` (Monday first) / `percent` and
  `alsoTopForLine` ("Also number one for a and b.").
- `support/recap.ts` -- the recap page's sections, found by role, heading
  or text (src/ has no test ids): `recapSection(page, section)` for each of
  `RECAP_SECTIONS`, `openRecap` (waits for the hero or the thin card),
  `loadAllImages` (scrolls so lazy posters load before a screenshot),
  `tileValue` (a stat tile's figure), `crewRows` (CrewRanking's rows, in the
  recap's crew panel or the story's crew card), `readCompare` (CompareSplit's
  discs and CompareFacts' facts, in the recap panel or the story card) and
  `textOf`.
- `support/big-day.ts` -- the biggest day's clock (BigDayTimeline, in the
  recap panel or the story card): `readBigDay` (the hour labels on screen,
  each dot's hover title and how many dots a screen reader would still meet
  -- none, the list says the same -- the summary line, the listed rows and
  "And N more.") and `expectedBigDay(oracle, surface)` (the same from the
  oracle's `bigDayTimeline`, with the labels each surface shows: the wide
  steps on the recap from lg, the narrow steps below lg and on the story's
  card).
- `support/archetype.ts` -- the type's picture (`[data-archetype-visual]`
  and its `role="img"`): `readArchetypeVisual`, `expectedArchetypeLabel`
  (its aria-label from the oracle's numbers, in the app's wording) and
  `SEEDED_ARCHETYPES` (each persona's 2025 type in this cast: ava a weekday
  marathoner, bo and bat one genre only, flo a completionist).
- `support/profile.ts` -- the profile page: `openProfileTab` (by URL
  fragment) and `clickProfileTab` (no page load), the Data Management tab's
  Series Finale card (`finaleCard`, `finaleRows`, `readFinaleRows`), the
  crew-comparison switch (`crewSwitch`, `crewSwitchLine`,
  `toggleCrewSwitch`) with its expected copy, `sessionPut` and
  `logoutButton`.
- `support/cards.ts` -- `CARDS_DIR`, `CARD_SIZE` and `pngSize` (a PNG's
  dimensions from its IHDR chunk).
- `support/story.ts` -- the story reel (`/series-finale/<period>/story`),
  found by its own roles and names: the current card is the
  `role="group"` "Card i of N" with its Shell's `data-card`; `openStory`,
  `cardState` (id, label, h2), `progressState`, `pressTo` / `goToCard`
  (arrow keys, soft), `expectedCards` (StoryReel's `hasContent` applied to
  the oracle; genres and rhythm are not predicted), `pageScroll`,
  `onScreenAndReachable` (in the viewport and hit at its centre) and
  `slug` for screenshot names.
- `support/db.ts` -- `psql` through `db.sh` (podman exec, no
  `DATABASE_URL`), `userExists`, `deleteUser`.
- `seed/catalogue.ts` + `seed/catalogue.lock.json` -- the real TMDB titles
  the cast watches, pinned by id with TV season shapes (aired episodes only).
  `resolveCatalogue()` fills in unresolved entries and rewrites the lock; it
  needs `TMDB_API_KEY`, so run it under `buildE2eEnv()`.
- `seed/personas.ts` -- the cast (`PERSONAS`): each account's zone, creation
  date, per-year shows/films/rhythm, planning list and owned lists. ava's
  zone-edge episodes are lopsided (one at 2025's start, two at its end), so
  her 2025 holds 230 episodes in Brisbane and 231 in UTC.
- `seed/generate.ts` + `seed/prng.ts` -- `generate(persona, catalogue)` turns
  a persona into episode and status rows, deterministically (seeded by
  username and year). `seed/generate.test.ts` checks the generator and pins
  the cast's designed statistics with the engine's own pure functions.
- `seed/seed.ts` -- the seeder: users (signing-in ones looked up, the rest
  inserted; `e2e_jon` gets the all-f id and `e2e_dee` the next id down, so
  the old id-ordered crew cap would drop dee from jon's crew every run -- the
  activity rule keeps her, finding F3 fixed), history, the shared list, then
  TMDB metadata via the app's `addToCache`, runtimes via
  `ensureSeasonsCached` and the backfill's film loop, three nulled runtimes,
  the 2025 snapshots of everyone but ava (pops first, pop12 last of them),
  and the story completions phones need (see "Story first on phones").
  Re-runnable: it clears the cast's rows first.
- `seed/oracle.ts` -- independent of the app's engine: plain SQL plus the
  spec's rules, each open rule cited to the line of `aggregate.ts` /
  `service.ts` it matches. Writes `artifacts/oracle.json`
  (`Record<username, Record<year, OracleYear>>`): counts, minutes, local
  months, weekdays and the after-21:00 share (`AT TIME ZONE`), the crew
  (the 8 most active consenting collaborators) and compare,
  `episodesIfUtcWindow` (the zone-edge precondition), `crewTopByActivity`
  (what F3 compares), and payload v4's figures: `bigDayTimeline` (the big
  day's solo ticks as local `HH:MM`, title and `S2E03` code), `hourCounts`
  and `busiestWindow`, `topGenre` (by title share, names from a static TMDB
  genre table) and `sharedListShare`. The percentile is `null` by design;
  specs test its presence.
- `specs/` -- Playwright spec files, numbered so alphabetical order is also
  run order within a project: `00`-`79` are read-only, `80`-`99` (or any
  `*.mutating.e2e.ts`) mutate shared state and run last, in the
  `desktop-mutating` project only, after every read-only project.
  - `10-gating` -- who gets a recap: no completed year, a year not over, a
    malformed period (404 page), thin years, signed out.
  - `20-api-and-card` (desktop only) -- the list and payload routes, the
    card's status matrix, card PNGs saved to `artifacts/cards/`, the
    first-generation time (`note`), the payload's local buckets (months,
    weekdays, late share) and v4 fields (zone, big-day timeline, hour counts,
    top genre, shared-list share) against the oracle, ava's story completion
    kept through her first generation (and listed per period), and ava's card
    saved for the privacy check in 80.
  - `30-banner` -- the dashboard banner: who sees it, its text (no "A card
    at a time on your year."), its actions' layout (side by side from md,
    stacked full width on a phone), and its CTA, which opens the recap.
  - `31-banner.mutating` -- "Not now": optimistic hide, persistence, and a
    forced failure that leaves bo undismissed.
  - `40-recap` -- ava's 2025 recap, section by section, against the oracle
    (hero, tiles and the zone-edge precondition, months, type and its
    picture, top show, niche, shame, the big day's date and clock -- hour
    ticks, titled points, listed episodes -- crew, compare for every peer
    swapped in, header, footer); the crew-cap rule (F3, fixed) checks that
    jon's stored crew is his 8 most active.
  - `41-recap-visual` (desktop, phone; webkit-phone skips where WebKit does
    not launch) -- full-page and per-section screenshots,
    `recap/<user>-<year>/<section>`, for ava 2025/2024/2023, bo, bat and flo
    2025 and flo 2024; which sections render is checked against the oracle,
    plus no sideways scroll (F1), a header title that fits whole (F2), each
    type panel's after-21:00 share (ava's shown, bat's absent), the
    archetype's picture and the weekday strip under the months against the
    oracle, and (desktop) the top-titles card's natural height within 40 px
    of the Genres card's, and, for ava 2025/2024, bo, bat and flo 2025, the
    content of "Watched by month" and "Your type" ending within 60 px of
    each other (no empty block in the top band).
  - `42-recap-states` -- loading, load failure then Retry, and unavailable,
    each forced with `page.route` on the period's GET.
  - `50-story` (desktop, phone, small-phone) -- ava's 2025 story: the walk
    by ArrowRight (one h1, progress bars, each card's h2 recorded, no
    sideways scroll), ArrowLeft and both ends, taps on the right and left
    thirds (touch on phones), Close and Escape, the crew card's top five
    with ranks and "And N more.", the compare card's discs and facts for
    every peer (the closest, then each swapped in, the shown chip pressed),
    the big-day card's clock against the oracle, F5 (every compare label
    whole, for every peer, on the story card and the recap panel, with a
    screenshot of each), the summary card's Share (with `navigator.share`
    stubbed) leaving the reel where it is, the small phone's tall cards
    (months, big day, shame, crew, compare) scrolled to their bottom with the
    scroll reset on the next card, and wording that matches the recap.
  - `51-story-visual` (desktop, phone, small-phone; webkit-phone skips
    where WebKit does not launch) -- one full-page shot per card,
    `story/<user>-2025/<nn>-<heading-slug>` (the card id where a card has
    no h2), for ava, bat and flo, and tia's thin story; which cards appear
    is checked against the oracle, as are the rhythm card's archetype
    picture and the months card's weekday strip; on the small phone every
    card's last line must be reachable by scrolling.
  - `52-story-gate` (desktop, phone, small-phone) -- the story-first gate on
    cy's 2025, the one story the seeder leaves not gone through: on a phone
    the recap route hands on to the story without showing the recap, Close
    and Escape go to the dashboard, and the banner's CTA lands on the story;
    on desktop the recap shows and Close goes to it. Read-only: it never
    reaches the summary card, and checks cy's row is still unmarked.
  - `60-profile` (desktop, phone) -- ava's Data Management tab: the archive
    rows against the oracle (newest first and highlighted, each opening its
    recap, the thin 2023 listed), a forced list failure, the crew switch on
    with its consent text, and a forced failed save that reverts.
  - `70-share-button` (desktop, phone) -- the recap header's Share: the
    mount-time prefetch; on desktop the download (saved as
    `cards/ava-2025-downloaded.png`); on the phone `navigator.share`
    (stubbed with `addInitScript`) handed exactly one PNG file, a cancel
    that is not a failure, and the story summary's Share; on both a forced
    card failure and its line, set below the header bar with the button
    still in it (F6).
  - `80-consent-and-rename` (desktop-mutating) -- cy opts out of crew
    comparisons; ava's recap withholds her on read while the stored
    snapshot still names her; bo renames himself `e2e_bo_renamed`, and
    ava's recap and story, and bo's own card, show the new name; ava's own
    card stays byte-identical throughout (privacy). Leaves bo renamed and cy
    opted out: re-seeding afterwards needs a database reset.
  - `85-story-completion` (desktop-mutating, emulating the phone project's
    Pixel 7) -- cy's story gone through on a phone: reaching the summary
    card posts one completion (and `story_completed_at` is then set, read
    through `db.sh psql`), "See the full recap" opens the recap, and
    afterwards the phone's recap route shows the recap, Close goes to it and
    nothing is posted again. Leaves cy's 2025 marked.
  - `90-account-switch` (desktop-mutating) -- the same-tab account switch
    (ava out, bat in, one document): bat's recap and card are his own, and a
    MutationObserver sees none of ava's crew after her Logout; plus the
    logout transition screenshots (P19) from the Security and Streaming
    tabs.
- `.auth/` (gitignored) -- the app's `WEBAUTHN_SECRET` (`run-secret`:
  random, made on first use and kept across runs so saved storage state
  stays valid between `e2e:test` invocations; delete it for a new one, then
  run `e2e:all`, since saved storage state signed with the old one stops
  working), saved passkeys (private keys included) and storage state.
- `artifacts/` (gitignored) -- `index.html` and `report.md` (the gallery and
  report), screenshots, share cards, `evidence.jsonl`, `oracle.json`,
  and per Playwright invocation its JSON results, HTML report and test
  output (traces): `results-readonly.json`, `playwright-report-readonly/`,
  `test-output-readonly/`, and the same with `-mutating` (a direct
  `npx playwright test` writes the unsuffixed `results.json`,
  `playwright-report/`, `test-output/`). `mutation-i1/` holds the one-off
  I1 mutation check (ruling E9: 90-account-switch against a build with
  AuthProvider's cache clear reverted, in a scratch worktree); `e2e:all`
  keeps it and the gallery reports it.

## Story first on phones

On a phone (below 768 px) `/series-finale/<year>` hands a story not yet gone
through on to the story, and the recap opens once the story's summary card
has been reached -- which marks `series_finale.story_completed_at` on the
account, on any device. So:

- The seeder marks the story gone through for every non-thin recap a
  read-only phone spec opens as a recap: ava 2025 and 2024, bo, bat and flo
  2025 (`STORY_COMPLETED` in `seed/seed.ts`; thin years are never gated).
  Walking those stories to their summary card then posts nothing, which
  keeps the read-only projects read-only. ava's snapshots are generated in
  the browser (her first generation is timed), so hers are stored on
  placeholder rows (schema version 0, an empty payload) that the app
  regenerates on first read -- keeping the completion, which
  `api-payload-story-completion-kept` checks.
- `e2e_cy`'s 2025 is left unmarked: non-thin, signing in, and screenshotted
  nowhere else. `52-story-gate` sees it gated (read-only), and
  `85-story-completion` marks it, last, in `desktop-mutating` with a phone
  emulated -- rather than a phone-mutating project, so `run.ts`'s two
  invocations and the report's project list are unchanged.

## Projects

`playwright.config.ts` runs projects in this order: `desktop`, `phone`,
`small-phone` (story specs only), `webkit-phone` (best-effort; recap/story
visual specs only), then `desktop-mutating` last. The mutating specs must not
run before a read-only project gets to see the state they'd disturb, and
`run.ts test` (so `e2e:test` and `e2e:all`) enforces that with two Playwright
invocations: the four read-only projects to completion, then
`desktop-mutating` on its own.

`desktop-mutating` has **no** Playwright `dependencies` (ruling E8):
Playwright skips a project whose dependency failed, so a genuine app finding
failing in `phone` would have silently stopped every mutating spec. The
second invocation runs whatever the first one's result, and `run.ts` exits
non-zero if either failed.

`webkit-phone` cannot launch on this dev host (missing system libraries;
`sudo npx playwright install-deps` would fix it, but that's out of scope), so
the visual specs skip it with that reason.
