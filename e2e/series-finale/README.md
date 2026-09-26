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
npm run e2e:test        # npx playwright test (starts/reuses next start -p 3100)
npm run e2e:db:down     # stops and removes the throwaway container
```

Individual Playwright invocations work too, e.g.:

```bash
npx playwright test --project=desktop e2e/series-finale/specs/00-smoke.e2e.ts
```

## Layout

- `env/db.sh` -- up/down/reset/psql for the throwaway podman Postgres
  container (`watchthis-e2e-pg`, no named volume, so `down` erases all data).
- `env/test-env.ts` -- the safety guard (`assertE2eDatabaseUrl`) and
  `buildE2eEnv()`, the single explicit environment every child process
  (migrate, seed, build, start, Playwright's own `webServer`) is given.
  `.env.local`'s real `DATABASE_URL` is never inherited.
- `env/run.ts` -- `npm run e2e:*` scripts all funnel through this so every
  subcommand asserts the database URL before doing anything. `migrate`,
  `build`, `start`, `dbcheck`, `register` and `test` are implemented here;
  `seed`, `oracle`, `gallery` and `all` are wired up in later tasks.
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
  line to `artifacts/evidence.jsonl`.
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
- `specs/` -- Playwright spec files, numbered so alphabetical order is also
  run order within a project: `00`-`79` are read-only, `80`-`99` (or any
  `*.mutating.e2e.ts`) mutate shared state and run last, in the
  `desktop-mutating` project only, after every read-only project.
- `.auth/` (gitignored) -- the per-run `WEBAUTHN_SECRET`, saved passkeys
  (private keys included) and storage state.
- `artifacts/` (gitignored) -- screenshots, traces, the HTML report and
  `results.json`.

## Projects

`playwright.config.ts` runs projects in this order: `desktop`, `phone`,
`small-phone` (story specs only), `webkit-phone` (best-effort; recap/story
visual specs only), then `desktop-mutating` last, which depends on `desktop`,
`phone` and `small-phone` finishing first. This keeps mutating specs from
running before a read-only project gets to see the state they'd disturb.

`webkit-phone` is **not** in `desktop-mutating`'s dependencies: this dev
host is missing the system libraries WebKit needs
(`browserType.launch` fails outright -- `sudo npx playwright install-deps`
would fix it, but that's out of scope here). If WebKit starts working in a
given environment, add it back to the dependency list.
