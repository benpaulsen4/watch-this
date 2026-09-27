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

## Running

```bash
npm run e2e:db:up       # starts postgres:17 in podman, localhost:5433 only
npm run e2e:migrate     # drizzle-kit migrate against the e2e database
npm run e2e:build       # next build (production)
npm run e2e:register    # passkeys for every signing-in persona via /auth (app must be up: e2e:start);
                        # `-- <username>...` registers just those
npm run e2e:seed        # the cast's history, lists, TMDB caches and the 2025 cohort snapshots
                        # (needs e2e:register first); `-- --resolve-only` just resolves the catalogue lock
npm run e2e:oracle      # artifacts/oracle.json: what each recap must show, from plain SQL
npm run e2e:test        # empties artifacts/evidence.jsonl, runs Playwright twice (starts/reuses the
                        # app via run.ts start): the read-only projects, then desktop-mutating
                        # whatever the first run's result; fails if either failed; then scans
                        # artifacts/ for secrets. `-- <playwright args>` go to both runs; args
                        # with --project run as one plain `playwright test` instead
npm run e2e:scan-secrets  # fail if any artifact holds the TMDB key or WebAuthn secret (names files only)
npm run e2e:db:reset    # a fresh, empty container (down + up)
npm run e2e:db:down     # stops and removes the throwaway container
```

Or everything in one go:

```bash
npm run e2e:all   # evidence reset, db reset, migrate, build, start the app, register, seed,
                  # oracle, the two Playwright runs as e2e:test, secret scan (gallery: Task 9). Stops the app it
                  # started; leaves the database up and seeded -- npm run e2e:db:down removes it.
```

Individual Playwright invocations work too, e.g.:

```bash
npx playwright test --project=desktop e2e/series-finale/specs/00-smoke.e2e.ts
```

A bare `npx playwright test` runs every project, `desktop-mutating` last by
config order, but nothing holds it back if a read-only project is still
failing or was not selected -- `npm run e2e:test` is the ordered way.

## Layout

- `env/db.sh` -- up/down/reset/psql for the throwaway podman Postgres
  container (`watchthis-e2e-pg`, no named volume, so `down` erases all data).
- `env/test-env.ts` -- the safety guard (`assertE2eDatabaseUrl`) and
  `buildE2eEnv()`, the single explicit environment every child process
  (migrate, seed, build, start, Playwright's own `webServer`) is given.
  `.env.local`'s real `DATABASE_URL` is never inherited.
- `env/run.ts` -- `npm run e2e:*` scripts all funnel through this so every
  subcommand asserts the database URL before doing anything. Every
  subcommand but `gallery` (Task 9) is implemented.
- `env/scan-secrets.ts` -- `findSecretLeaks`: a byte scan of `artifacts/`
  for the run's secrets. `playwright.config.ts` holds no secrets and never
  calls `buildE2eEnv()` (its reporters serialise the config); the web server
  is started through `run.ts start`, which builds the env itself.
- `env/register.ts` -- registers accounts through the real `/auth` UI and
  saves `.auth/<username>.credential.json` (the passkey) and
  `.auth/<username>.json` (signed-in storage state). Re-run safe.
- `support/auth.ts` -- Chromium's CDP virtual authenticator:
  `registerViaUi`, `signInAs` (swaps the saved passkey into the
  authenticator and refreshes its sign counter afterwards), `signOut`
  (through the profile page's Logout), `storageStatePath`.
- `support/shots.ts` -- `shot` / `shotElement` write
  `artifacts/screenshots/<project>/<name>.png`.
- `support/evidence.ts` -- `check()`: a soft assertion that also appends a
  line to `artifacts/evidence.jsonl`; `note()`: an informational line
  (timings) that never fails the test.
- `support/oracle.ts` -- `oracleYear(username, year)` and
  `oracleAvailableYears(username)`, read from `artifacts/oracle.json`.
- `support/pages.ts` -- shared page helpers: `listResponse` (the page's
  `GET /api/series-finale`), `openDashboard` (waits for that list and
  network idle), `banner` / `BANNER_READY` (the dashboard banner),
  `becomesVisible` (a soft visibility wait whose result goes through
  `check()`), and the app's wording rules: `pluralise` (counts),
  `words` / `wordValue` (small numbers in words, both ways) and
  `capitalise`.
- `support/recap.ts` -- the recap page's sections, found by role, heading
  or text (src/ has no test ids): `recapSection(page, section)` for each of
  `RECAP_SECTIONS`, `openRecap` (waits for the hero or the thin card),
  `loadAllImages` (scrolls so lazy posters load before a screenshot),
  `tileValue` (a stat tile's figure) and `textOf`.
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
  date, per-year shows/films/rhythm, planning list and owned lists.
- `seed/generate.ts` + `seed/prng.ts` -- `generate(persona, catalogue)` turns
  a persona into episode and status rows, deterministically (seeded by
  username and year). `seed/generate.test.ts` checks the generator and pins
  the cast's designed statistics with the engine's own pure functions.
- `seed/seed.ts` -- the seeder: users (signing-in ones looked up, the rest
  inserted; `e2e_jon` gets the all-f id so the id-ordered crew cap always
  drops him), history, the shared list, then TMDB metadata via the app's
  `addToCache`, runtimes via `ensureSeasonsCached` and the backfill's film
  loop, three nulled runtimes, and the 2025 snapshots of everyone but ava
  (pops first, pop12 last of them). Re-runnable: it clears the cast's rows
  first.
- `seed/oracle.ts` -- independent of the app's engine: plain SQL plus the
  spec's rules, each open rule cited to the line of `aggregate.ts` /
  `service.ts` it matches. Writes `artifacts/oracle.json`
  (`Record<username, Record<year, OracleYear>>`). The percentile is `null`
  by design; specs test its presence.
- `specs/` -- Playwright spec files, numbered so alphabetical order is also
  run order within a project: `00`-`79` are read-only, `80`-`99` (or any
  `*.mutating.e2e.ts`) mutate shared state and run last, in the
  `desktop-mutating` project only, after every read-only project.
  - `10-gating` -- who gets a recap: no completed year, a year not over, a
    malformed period (404 page), thin years, signed out.
  - `20-api-and-card` (desktop only) -- the list and payload routes, the
    card's status matrix, card PNGs saved to `artifacts/cards/`, the
    first-generation time (`note`), and a card privacy byte check.
  - `30-banner` -- the dashboard banner: who sees it, its text, its link.
  - `31-banner.mutating` -- "Not now": optimistic hide, persistence, and a
    forced failure that leaves bo undismissed.
  - `40-recap` -- ava's 2025 recap, section by section, against the oracle
    (hero, tiles, top show, niche, shame, big day, crew, compare, header,
    footer); the crew-cap rule is recorded as an informational app finding.
  - `41-recap-visual` (desktop, phone; webkit-phone skips where WebKit does
    not launch) -- full-page and per-section screenshots,
    `recap/<user>-<year>/<section>`, for ava 2025/2024/2023, bo, bat and flo
    2025 and flo 2024; which sections render is checked against the oracle,
    plus no sideways scroll and a header title that fits.
  - `42-recap-states` -- loading, load failure then Retry, and unavailable,
    each forced with `page.route` on the period's GET.
  - `50-story` (desktop, phone, small-phone) -- ava's 2025 story: the walk
    by ArrowRight (one h1, progress bars, each card's h2 recorded, no
    sideways scroll), ArrowLeft and both ends, taps on the right and left
    thirds (touch on phones), Close and Escape, the crew card's top five
    with ranks and "And N more.", the summary card's Share (with
    `navigator.share` stubbed) leaving the reel where it is, the small
    phone's tall cards scrolled to their bottom (TMDB attribution, swap
    controls) with the scroll reset on the next card, and wording that
    matches the recap.
  - `51-story-visual` (desktop, phone, small-phone; webkit-phone skips
    where WebKit does not launch) -- one full-page shot per card,
    `story/<user>-2025/<nn>-<heading-slug>` (the card id where a card has
    no h2), for ava, bat and flo, and tia's thin story; which cards appear
    is checked against the oracle.
- `.auth/` (gitignored) -- the per-run `WEBAUTHN_SECRET`, saved passkeys
  (private keys included) and storage state.
- `artifacts/` (gitignored) -- screenshots, `evidence.jsonl`, `oracle.json`,
  and per Playwright invocation its JSON results, HTML report and test
  output (traces): `results-readonly.json`, `playwright-report-readonly/`,
  `test-output-readonly/`, and the same with `-mutating` (a direct
  `npx playwright test` writes the unsuffixed `results.json`,
  `playwright-report/`, `test-output/`).

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
