# Series Finale End-to-End Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Series Finale works end to end against a real database, real TMDB data and a real browser, across a cast of seeded accounts that exercise every friend-based statistic, and produce a screenshot gallery (desktop and phone) plus a results report for Ben to review.

**Architecture:** A throwaway Postgres 17 container (podman, localhost only) holds a migrated test database. A production build of the app runs on `localhost:3100` against it. Playwright (Chromium with a CDP virtual authenticator for passkeys, plus a best-effort WebKit phone pass) registers the accounts that need to sign in; a seeder then writes a deterministic, persona-driven watch history for every account, warms the TMDB caches through the app's own code, and pre-generates the percentile cohort. An independent SQL oracle computes the numbers the UI must show. Specs assert UI against oracle, capture screenshots, and write an evidence log; a gallery script turns screenshots and evidence into one HTML page.

**Tech Stack:** Playwright `@playwright/test@1.62.1` (pinned: its browser revisions — Chromium 1234, WebKit 2336 — are already in `~/.cache/ms-playwright`, so no browser download), podman, Postgres 17, `tsx`, Drizzle, the app's own TMDB client.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md` (feature behaviour) and Ben's request of 2026-09-26: an extensive e2e plan with multi-account seeded data for the friend-based stats, screenshots of the recap and every associated component at desktop and mobile sizes, agent-driven or one-shot acceptable.

## Global Constraints

- **Never touch a non-test database.** Every script that connects (migrate, seed, oracle, the app server, Playwright config) calls `assertE2eDatabaseUrl()`: host `localhost` or `127.0.0.1`, port `5433`, database `watchthis_e2e`, else throw. `DATABASE_URL` is always set explicitly in the child process env — never inherited from `.env.local` (drizzle.config.ts falls back to `.env.local` when `DATABASE_URL` is unset; Next loads `.env.local` for anything not already in the env).
- `TMDB_API_KEY` is read from the process env, else from the repo's `.env.local` (that one key only). Never print it, never write it into any committed file, never put it in a URL that is logged.
- Postgres runs only via `podman`, image `docker.io/library/postgres:17`, published on `127.0.0.1:5433` only, container name `watchthis-e2e-pg`, no named volume (ephemeral). `e2e:db:down` removes it.
- The app under test is a **production** build (`next build` + `next start -p 3100`) with `NODE_ENV=production`, `WEBAUTHN_RP_ID=localhost`, `WEBAUTHN_ORIGIN=http://localhost:3100`, `SITE_URL`/`NEXT_PUBLIC_SITE_URL=http://localhost:3100`, and a random per-run `WEBAUTHN_SECRET`.
- Only these new dependencies: `@playwright/test@1.62.1` (devDependency, exact version). `tsx` is already used by `tools/`. No `playwright install` — if the cached browsers do not match, STOP and report (a browser download needs Ben's say-so).
- All e2e code lives under `e2e/series-finale/`. Generated output goes to `e2e/series-finale/artifacts/` and `e2e/series-finale/.auth/` — both gitignored. Nothing generated is committed except `catalogue.lock.json` (Task 3).
- Vitest must not pick up Playwright specs: add `e2e/**` to `vitest.config.mts`'s test `exclude`. Playwright specs are `*.e2e.ts`.
- `npm run lint:ci` and `npm run typecheck` stay clean with the e2e code included; `npm test` (Vitest) stays green.
- Today is 2026-09-26: completed years are ≤ 2025. 2025 is the main year under test.
- The e2e run is **serial** (`workers: 1`, `fullyParallel: false`) and **ordered**: read-only specs first, mutating specs (dismiss, opt-out, rename, account switch) last, because they change shared state.
- Commits: conventional-commit subjects, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do NOT `git push`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `e2e/series-finale/README.md` | How to run, what each script does, safety rules |
| `e2e/series-finale/env/db.sh` | podman Postgres up / down / reset |
| `e2e/series-finale/env/test-env.ts` | Builds the child-process env; `assertE2eDatabaseUrl()`; reads the TMDB key |
| `e2e/series-finale/env/run.ts` | One-shot orchestrator: db up → migrate → build → start → register → seed → specs → gallery |
| `playwright.config.ts` (repo root) | Projects (desktop, phone, small phone, WebKit phone), serial order, webServer |
| `e2e/series-finale/support/auth.ts` | Virtual authenticator; register / sign in / sign out; credential persistence |
| `e2e/series-finale/support/evidence.ts` | `check(id, description, expected, actual)` → evidence.jsonl + soft assertion |
| `e2e/series-finale/support/shots.ts` | Named screenshots into the artifacts tree, full-page and per-element |
| `e2e/series-finale/seed/catalogue.ts` + `catalogue.lock.json` | Real titles (name + year) → resolved TMDB ids and season shapes |
| `e2e/series-finale/seed/personas.ts` | The cast: every account, its years, titles, rhythm and relationships |
| `e2e/series-finale/seed/generate.ts` (+ `generate.test.ts`) | Pure, deterministic: persona + catalogue → rows |
| `e2e/series-finale/seed/seed.ts` | Writes rows, warms TMDB caches, degrades chosen runtimes, pre-generates cohort snapshots |
| `e2e/series-finale/seed/oracle.ts` | Independent SQL: the numbers each recap must show → `artifacts/oracle.json` |
| `e2e/series-finale/specs/*.e2e.ts` | The checks (see Tasks 5–8) |
| `e2e/series-finale/report/gallery.ts` | Screenshots + evidence + Playwright JSON → `artifacts/index.html` and `artifacts/report.md` |

---

### Task 1: Test environment and Playwright scaffolding

**Files:**
- Create: `e2e/series-finale/env/db.sh`, `e2e/series-finale/env/test-env.ts`, `e2e/series-finale/env/test-env.test.ts`, `playwright.config.ts`, `e2e/series-finale/specs/00-smoke.e2e.ts`, `e2e/series-finale/README.md`
- Modify: `package.json` (devDependency + scripts), `.gitignore`, `vitest.config.mts` (exclude `e2e/**` from test discovery; include `e2e/**/*.test.ts` for the harness's own unit tests)

**Interfaces:**
- Produces: `assertE2eDatabaseUrl(url: string): void`, `E2E_DATABASE_URL`, `E2E_BASE_URL = "http://localhost:3100"`, `buildE2eEnv(): NodeJS.ProcessEnv` (everything the app, migrate and seed need, including a per-run `WEBAUTHN_SECRET` read from `e2e/series-finale/.auth/run-secret`), `readTmdbKey(): string`.
- npm scripts: `e2e:db:up`, `e2e:db:down`, `e2e:migrate`, `e2e:build`, `e2e:start`, `e2e:register`, `e2e:seed`, `e2e:oracle`, `e2e:test`, `e2e:gallery`, `e2e:all`.

- [ ] **Step 1: Install Playwright, pinned, and confirm the cached browsers match**

```bash
npm install --save-dev --save-exact @playwright/test@1.62.1
npx playwright --version   # expect: Version 1.62.1
node -e "const b=require('playwright-core/browsers.json').browsers;console.log(b.filter(x=>['chromium','webkit','chromium-headless-shell'].includes(x.name)).map(x=>x.name+'-'+x.revision).join(' '))"
ls ~/.cache/ms-playwright   # expect chromium-1234, chromium_headless_shell-1234, webkit-2336
```
If any revision differs, STOP (do not run `playwright install`) and report.

- [ ] **Step 2: Write the failing safety-guard test**

`e2e/series-finale/env/test-env.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { assertE2eDatabaseUrl } from "./test-env";

describe("assertE2eDatabaseUrl", () => {
  it("accepts the local e2e database", () => {
    expect(() =>
      assertE2eDatabaseUrl("postgresql://e2e:e2e@localhost:5433/watchthis_e2e"),
    ).not.toThrow();
    expect(() =>
      assertE2eDatabaseUrl("postgresql://e2e:e2e@127.0.0.1:5433/watchthis_e2e"),
    ).not.toThrow();
  });

  it.each([
    "postgresql://u:p@db.example.com:5432/watchthis",
    "postgresql://u:p@localhost:5432/watchthis_e2e",
    "postgresql://u:p@localhost:5433/watchthis",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(() => assertE2eDatabaseUrl(url)).toThrow(/e2e database/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails** — `npx vitest run e2e/series-finale/env/test-env.test.ts` → FAIL, cannot resolve `./test-env`.

- [ ] **Step 4: Implement `test-env.ts`**

```ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const E2E_DATABASE_URL =
  "postgresql://e2e:e2e@localhost:5433/watchthis_e2e";
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DIR = join(process.cwd(), "e2e", "series-finale");
export const AUTH_DIR = join(E2E_DIR, ".auth");
export const ARTIFACTS_DIR = join(E2E_DIR, "artifacts");

/** Throws unless `url` is the throwaway local e2e database. */
export function assertE2eDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to run: not the e2e database (${url || "empty"})`);
  }
  const ok =
    ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
    parsed.port === "5433" &&
    parsed.pathname === "/watchthis_e2e";
  if (!ok) {
    throw new Error(`Refusing to run: not the e2e database (${parsed.host}${parsed.pathname})`);
  }
}

/** The TMDB key from the env, else the one line in .env.local. Never logged. */
export function readTmdbKey(): string {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  const path = join(process.cwd(), ".env.local");
  if (existsSync(path)) {
    const line = readFileSync(path, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("TMDB_API_KEY="));
    const value = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  throw new Error("TMDB_API_KEY is not set (env or .env.local)");
}

function runSecret(): string {
  mkdirSync(AUTH_DIR, { recursive: true });
  const path = join(AUTH_DIR, "run-secret");
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"));
  return readFileSync(path, "utf8").trim();
}

/** Everything the app server, migrations and the seeder need. Explicit, so .env.local cannot leak in. */
export function buildE2eEnv(): NodeJS.ProcessEnv {
  assertE2eDatabaseUrl(E2E_DATABASE_URL);
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: E2E_DATABASE_URL,
    TMDB_API_KEY: readTmdbKey(),
    SITE_URL: E2E_BASE_URL,
    NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
    WEBAUTHN_RP_NAME: "WatchThis E2E",
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGIN: E2E_BASE_URL,
    WEBAUTHN_SECRET: runSecret(),
    ADMIN_API_SECRET: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
```

- [ ] **Step 5: Run the test to verify it passes.**

- [ ] **Step 6: `db.sh`**

```bash
#!/usr/bin/env bash
# Throwaway Postgres for the Series Finale e2e suite. Localhost only, no volume.
set -euo pipefail
NAME=watchthis-e2e-pg
IMAGE=docker.io/library/postgres:17
case "${1:-}" in
  up)
    podman container exists "$NAME" && { echo "$NAME already running"; exit 0; }
    podman run -d --name "$NAME" -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e \
      -e POSTGRES_DB=watchthis_e2e -p 127.0.0.1:5433:5432 "$IMAGE" >/dev/null
    for _ in $(seq 1 60); do
      podman exec "$NAME" pg_isready -U e2e -d watchthis_e2e >/dev/null 2>&1 && { echo "ready"; exit 0; }
      sleep 1
    done
    echo "postgres did not become ready" >&2; exit 1 ;;
  down) podman rm -f "$NAME" >/dev/null 2>&1 || true; echo "removed" ;;
  reset) "$0" down; "$0" up ;;
  psql) shift; podman exec -i "$NAME" psql -U e2e -d watchthis_e2e "$@" ;;
  *) echo "usage: db.sh up|down|reset|psql" >&2; exit 2 ;;
esac
```
(`chmod +x`.) Foreground `sleep` inside a script is fine.

- [ ] **Step 7: npm scripts** (in `package.json`; each TS entry runs through `tsx`):

```json
"e2e:db:up": "bash e2e/series-finale/env/db.sh up",
"e2e:db:down": "bash e2e/series-finale/env/db.sh down",
"e2e:migrate": "tsx e2e/series-finale/env/run.ts migrate",
"e2e:build": "tsx e2e/series-finale/env/run.ts build",
"e2e:start": "tsx e2e/series-finale/env/run.ts start",
"e2e:register": "tsx e2e/series-finale/env/run.ts register",
"e2e:seed": "tsx e2e/series-finale/env/run.ts seed",
"e2e:oracle": "tsx e2e/series-finale/env/run.ts oracle",
"e2e:test": "tsx e2e/series-finale/env/run.ts test",
"e2e:gallery": "tsx e2e/series-finale/env/run.ts gallery",
"e2e:all": "tsx e2e/series-finale/env/run.ts all"
```
`run.ts` in this task implements `migrate` (spawn `npx drizzle-kit migrate` with `buildE2eEnv()`), `build` (`npx next build`), `start` (`npx next start -p 3100`, foreground), `test` (`npx playwright test`); the other subcommands are wired in later tasks and throw "not implemented yet" until then. Every subcommand calls `assertE2eDatabaseUrl(buildE2eEnv().DATABASE_URL!)` first.

- [ ] **Step 8: `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

import { buildE2eEnv, E2E_BASE_URL, E2E_PORT } from "./e2e/series-finale/env/test-env";

export default defineConfig({
  testDir: "./e2e/series-finale/specs",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "./e2e/series-finale/artifacts/test-output",
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e/series-finale/artifacts/results.json" }],
    ["html", { outputFolder: "e2e/series-finale/artifacts/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Australia/Brisbane",
    locale: "en-AU",
    colorScheme: "dark",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: "small-phone", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 }, testMatch: /story.*\.e2e\.ts$/ },
    { name: "webkit-phone", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }, testMatch: /(recap|story)-visual\.e2e\.ts$/ },
  ],
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/auth`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: buildE2eEnv() as Record<string, string>,
  },
});
```
Project order in the file is the run order. Spec files are numbered (`00-`…`90-`) so alphabetical order is the ordering rule within a project.

- [ ] **Step 9: Smoke spec** `specs/00-smoke.e2e.ts`: visits `/auth`, expects the username field and the register button; `GET /api/series-finale` without a session → 401 and `cache-control` contains `no-store`. Screenshot `auth/sign-in` via plain `page.screenshot` for now (Task 2 adds the helper).

- [ ] **Step 10: `.gitignore`** — add `/e2e/series-finale/artifacts/`, `/e2e/series-finale/.auth/`, `/playwright-report/`, `/test-results/`.

- [ ] **Step 11: Run it**

```bash
npm run e2e:db:up && npm run e2e:migrate && npm run e2e:build
npx playwright test --project=desktop e2e/series-finale/specs/00-smoke.e2e.ts
npm test && npm run typecheck && npm run lint:ci
```
Expected: migrate applies through `0012_parallel_the_santerians`; smoke passes; unit suite still 1089+ (plus the new guard tests).

- [ ] **Step 12: Commit** — `test: e2e environment for Series Finale (podman Postgres, Playwright)`.

---

### Task 2: Passkey accounts through the real UI

**Files:**
- Create: `e2e/series-finale/support/auth.ts`, `e2e/series-finale/support/shots.ts`, `e2e/series-finale/support/evidence.ts`, `e2e/series-finale/env/register.ts`, `e2e/series-finale/specs/01-auth.e2e.ts`

**Interfaces:**
- Consumes: `E2E_BASE_URL`, `AUTH_DIR`, `ARTIFACTS_DIR` (Task 1).
- Produces:
  - `enableVirtualAuthenticator(page: Page): Promise<{ client: CDPSession; authenticatorId: string }>`
  - `registerViaUi(page: Page, username: string): Promise<void>` — fills `/auth`'s username, submits register, waits for `/dashboard`.
  - `exportCredential(auth, username): Promise<void>` → `.auth/<username>.credential.json` (from `WebAuthn.getCredentials`).
  - `signInAs(page: Page, username: string): Promise<void>` — clears the authenticator's credentials, adds the saved one (`WebAuthn.addCredential`), clicks sign-in on `/auth`, waits for `/dashboard`.
  - `signOut(page: Page): Promise<void>` — through the profile page's sign-out control (the real path, which calls `clearAuth()`).
  - `storageStatePath(username): string` → `.auth/<username>.json` (Playwright storage state).
  - `shot(page, name, opts?)` / `shotElement(locator, name)` — writes `artifacts/screenshots/<project>/<name>.png` with `animations: "disabled"`; `name` is a slash path like `recap/ava-2025/hero`.
  - `check(id, description, expected, actual)` — appends `{ id, project, description, expected, actual, pass }` to `artifacts/evidence.jsonl` and calls `expect.soft(actual).toEqual(expected)`.

- [ ] **Step 1: `auth.ts`** — virtual authenticator over CDP (Chromium only):

```ts
const { client } = ...; // page.context().newCDPSession(page)
await client.send("WebAuthn.enable", { enableUI: false });
const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
```
Sign-in uses discoverable credentials (the `/auth` sign-in button asks for no username), so each sign-in must start with exactly one credential in the authenticator: `WebAuthn.clearCredentials` then `WebAuthn.addCredential` with the saved JSON. Store credentials with `privateKey` as returned (base64) — they live only under the gitignored `.auth/`.

- [ ] **Step 2: `register.ts`** (wired to `npm run e2e:register`): for every persona with `signsIn: true` (Task 3's `PERSONAS`; until Task 3 lands, accept a username list on argv), open a fresh Chromium context, register via the UI, export the credential, save storage state. Skip a persona whose credential file already exists and whose username exists in the DB (re-run safe). Registration creates the user row with `created_at = now()`; the seeder backdates it.

- [ ] **Step 3: `01-auth.e2e.ts`** (desktop project only): register a throwaway `e2e_probe`, sign out, sign back in with the saved credential, assert `/api/auth/session` returns that username; screenshot `auth/registered-dashboard`. Delete `e2e_probe` at the end via the db (`db.sh psql -c "delete from users where username='e2e_probe'"` run through a small helper) so the cohort is not polluted.

- [ ] **Step 4: Run** `npm run e2e:build` (if src changed), then the auth spec. Expected PASS.

- [ ] **Step 5: Commit** — `test: e2e passkey accounts via a virtual authenticator`.

---

### Task 3: The cast and a deterministic history generator

**Files:**
- Create: `e2e/series-finale/seed/catalogue.ts`, `e2e/series-finale/seed/catalogue.lock.json`, `e2e/series-finale/seed/personas.ts`, `e2e/series-finale/seed/generate.ts`, `e2e/series-finale/seed/generate.test.ts`, `e2e/series-finale/seed/prng.ts`

**Interfaces:**
- Produces:
  - `type CatalogueEntry = { key: string; title: string; year: number; type: "tv" | "movie"; tmdbId: number; seasons?: { season: number; episodes: number }[] }`
  - `resolveCatalogue(): Promise<CatalogueEntry[]>` — reads `catalogue.lock.json`; for any entry without `tmdbId`, searches TMDB (`tmdbClient.searchTVShows` / `searchMovies`) for an exact title match with the same first-air/release year, fetches TV season shapes via `getTVShowDetails`, and rewrites the lock. Fails loudly on no exact match.
  - `PERSONAS: PersonaSpec[]` and `type PersonaSpec` (below).
  - `generate(persona: PersonaSpec, catalogue: Map<string, CatalogueEntry>): GeneratedRows` where `GeneratedRows = { episodes: EpisodeRow[]; statuses: StatusRow[] }` with `EpisodeRow = { tmdbId; seasonNumber; episodeNumber; watchedAt: Date }` and `StatusRow = { tmdbId; contentType: "tv" | "movie"; status: "planning" | "watching" | "completed" | "dropped"; createdAt: Date; updatedAt: Date }`.

**The catalogue** (real titles; `key` is a short slug used by personas). Shows: The Bear (2022), Severance (2022), Slow Horses (2022), Shōgun (2024), The Last of Us (2023), Andor (2022), Fleabag (2016), The Office (2005), Succession (2018), Taskmaster (2015), The Rehearsal (2022), Reservation Dogs (2021), Hacks (2021), Ted Lasso (2020), Mr. Robot (2015). Films: Dune: Part Two (2024), Past Lives (2023), Aftersun (2022), Perfect Days (2023), Anatomy of a Fall (2023), The Zone of Interest (2023), Poor Things (2023), Oppenheimer (2023), Everything Everywhere All at Once (2022), Paterson (2016), Columbus (2017), Drive My Car (2021), Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles (1975), Petite Maman (2021), The Holdovers (2023), Challengers (2024), Conclave (2024), The Brutalist (2024), Flow (2024), Anora (2024), The Substance (2024), A Real Pain (2024), Nickel Boys (2024), I Saw the TV Glow (2024), Evil Does Not Exist (2023), Fallen Leaves (2023), Monster (2023), Ich war zuhause, aber (2019), Furiosa: A Mad Max Saga (2024). If a title does not resolve exactly, replace it with another real title of the same kind and note it in the lock's `_notes`.

**The cast** — the heart of the plan. Every friend-based statistic has an account whose data makes it observable and an expected value the oracle can compute.

| Username | Signs in | Zone | Created | Role in the tests |
| --- | --- | --- | --- | --- |
| `e2e_ava` | yes | Australia/Brisbane (UTC+10, no DST) | 2023-02-01 | **Main viewer.** Rich 2025, moderate 2024, thin 2023. Owns the shared list. |
| `e2e_bo` | yes | UTC | 2023-03-01 | Out-watches ava in 2025. Same top show as ava (`alsoTopFor`). Finished a show ava dropped (`theyFinishedYouDropped`). Plans the same film ava plans (`bothPlanningNeitherStarted`). ~10 finished titles shared with ava. Renamed mid-suite. |
| `e2e_cy` | yes | UTC | 2023-03-01 | Light collaborator; also has ava's top show as their top show. **Opts out** mid-suite via the profile switch. |
| `e2e_dee` | no | UTC | 2023-03-01 | **Exactly** ava's 2025 episode count → tied rank (competition ranking 1, 1, 3). |
| `e2e_eli`, `e2e_fay`, `e2e_gus`, `e2e_hal`, `e2e_ivy`, `e2e_jon` | no | UTC | 2023-03-01 | Collaborators with 40–380 episodes each, so ava has **9 collaborators**: recap crew capped at `CREW_LIMIT = 8`; story crew shows top 5 + ava + "And N more". `e2e_jon` is on the list but has 0 activity in 2025 (must not rank as a zero row unless the service includes zeros — the oracle reproduces whatever rule `loadCollaboratorSlices` uses; read it). |
| `e2e_tia` | yes | UTC | 2024-01-10 | **Thin 2025** (7 episodes, 2 films): thin card, no banner, no Share, card route 404. |
| `e2e_neo` | yes | UTC | 2026-05-01 | **No completed years:** profile empty state, no banner, `/series-finale/2025` unavailable. |
| `e2e_bat` | yes | UTC | 2023-06-01 | **Batch ticker:** ~220 episodes in 2025, every one in a batch sharing a timestamp → `timeline === null` and `lateShare === null` disclosures. |
| `e2e_flo_watches_only_films_and_has_a_long_name` (≤ 50 chars; confirm) | yes | UTC | 2023-06-01 | **Films only** in 2025 (28 films, 0 episodes): no top show; long unbreakable-ish username on the share card; "Jeanne Dielman…" as a long title. |
| `e2e_pop01` … `e2e_pop12` | no | UTC | 2023-01-15 | **Percentile cohort:** 12 non-thin 2025 years spread from 30 h to 900 h, no lists shared with anyone. Their snapshots are pre-generated by the seeder so ava's percentile is computed against ≥ `PERCENTILE_COHORT_MINIMUM` (10). `e2e_pop12` is the lightest non-thin — its stored percentile must be > 50, so the line would be absent. Hours are spread so ava lands around 3rd of 13 (percentile line shown). |

**ava's 2025 in detail** (the oracle derives every number; these are the inputs):
- ~420 episodes across 8 shows. Top show: The Bear (most episodes). Shows completed in 2025: 4. Shows dropped: 2 (one of which bo finished in 2025). 
- 22 films completed, spanning popularity (Dune: Part Two … Ich war zuhause, aber) so `niche` is a genuinely obscure film. 1 film dropped. **One further dropped film deliberately left out of `tmdb_cache`** (the seeder deletes its cache row after warming) → headline dropped count exceeds named dropped titles → "And one more." (I3/S34).
- Planning films: 4 — two added in 2024, one added 2025-06, one added **2026-02-10** (must not appear in 2025's "still waiting", S32). One of the 2024 ones is also on bo's planning list.
- Rhythm: Sunday-heavy weekday weights; ≥ 120 solo ticks (≥ `SOLO_TICK_FLOOR` 50) of which ~45% after 21:00 local; the rest in batches of 2–6 sharing a timestamp.
- Big day: 2025-03-15 local, 14 episodes, solo-ticked across 13:00–23:30.
- Streak: 17 consecutive local days, 2025-07-04 → 2025-07-20.
- **Zone edges:** one episode at 2025-01-01 05:00 Brisbane (2024-12-31 19:00 UTC) — counts in 2025; one at 2026-01-01 08:00 Brisbane (2025-12-31 22:00 UTC) — does **not** count in 2025.
- **Unknown runtimes:** the seeder nulls the runtime of 3 of ava's 2025 episodes (keeping their `tmdb_season_fetch` row) → the unknown-runtime disclosure shows "3 episodes or films".
- 2024: ~150 episodes, 8 films (non-thin). 2023: 6 episodes, 2 titles (thin).

**Shared list:** `Couch Crew`, owned by ava; collaborators bo, cy, dee, eli, fay, gus, hal, ivy, jon; a handful of list items. `e2e_pop*`, tia, neo, bat, flo share nothing.

`PersonaSpec` (the generator's input — declarative, no timestamps written by hand except the edge cases):
```ts
export interface PersonaSpec {
  username: string;
  signsIn: boolean;
  timezone: "UTC" | "Australia/Brisbane";
  createdAt: string; // ISO date
  shareStatsWithCollaborators?: boolean; // default true
  years: Record<number, YearSpec>;
  planning?: { key: string; addedOn: string }[]; // ISO date, local
  lists?: { name: string; collaborators: string[]; items: string[] }[]; // owned lists
}
export interface YearSpec {
  shows: { key: string; episodes: number; outcome?: "completed" | "dropped" | "watching"; outcomeOn?: string }[];
  films: { key: string; outcome: "completed" | "dropped"; on?: string; uncached?: true }[];
  weekdayWeights: [number, number, number, number, number, number, number]; // Sun..Sat
  soloShare: number; // 0..1 of episodes ticked alone
  lateShareOfSolo: number; // 0..1 of solo ticks after 21:00 local
  bigDay?: { date: string; episodes: number };
  streak?: { start: string; days: number };
  extraEpisodes?: { key: string; season: number; episode: number; localDateTime: string }[]; // zone edges
}
```
Episodes are taken in order through each show's real seasons (from the catalogue) so every `(season, episode)` exists on TMDB. Wall-clock → UTC: `UTC` is identity; `Australia/Brisbane` is −10 h (no DST). The generator never uses `Math.random` — `prng.ts` exports `mulberry32(seed)` and `seedFrom(username, year)`.

- [ ] **Step 1: Write the failing generator tests** (`generate.test.ts`, Vitest; build a tiny in-test catalogue so no TMDB is needed):
  - same persona twice → identical rows (determinism);
  - ava-like spec → exactly the requested episode count per show and in total per year, all `watchedAt` inside the local year window, the two zone-edge rows land on the right side of the boundary;
  - solo share: the fraction of episodes whose `watchedAt` is unique within the persona is within ±2% of `soloShare`; every batch has 2–6 rows sharing one timestamp;
  - of solo ticks, the fraction after 21:00 local is within ±3% of `lateShareOfSolo`;
  - big day: exactly `episodes` rows on that local date, all solo;
  - streak: every day in the range has ≥ 1 episode, and the day before and after have none;
  - a batch-only persona (`soloShare: 0`) produces zero unique timestamps;
  - statuses: `completed`/`dropped` rows carry `updatedAt` inside the year (on `outcomeOn` if given); planning rows carry `createdAt` = `addedOn` local midnight → UTC;
  - thin spec → below both `THIN_YEAR_EPISODES` and `THIN_YEAR_TITLES` (import them from `src/lib/series-finale/types.ts`).
- [ ] **Step 2: Run to fail; Step 3: implement `prng.ts` + `generate.ts`; Step 4: run to pass.**
- [ ] **Step 5: Write `personas.ts`** exactly per the table and ava's detail above, then `catalogue.ts` + resolve the lock once: `npm run e2e:seed -- --resolve-only` (Task 4 wires the flag; until then run `tsx e2e/series-finale/seed/catalogue.ts` with `buildE2eEnv()`). Commit the lock.
- [ ] **Step 6: Commit** — `test: e2e cast and deterministic watch-history generator`.

---

### Task 4: Seeder and oracle

**Files:**
- Create: `e2e/series-finale/seed/seed.ts`, `e2e/series-finale/seed/oracle.ts`
- Modify: `e2e/series-finale/env/run.ts` (wire `register`, `seed`, `oracle`, `all`)

**Interfaces:**
- Consumes: `PERSONAS`, `generate`, `resolveCatalogue` (Task 3); `assertE2eDatabaseUrl`, `buildE2eEnv` (Task 1); the app's `addToCache` (`src/lib/tmdb/cache-utils.ts`), `ensureSeasonsCached` (`src/lib/series-finale/runtime.ts`), `normaliseFilmRuntime` + `tmdbClient` (as `tools/backfill-runtimes.ts` does), `getOrGenerateSnapshot` + `calendarYearPeriod` (`src/lib/series-finale/`).
- Produces: a seeded database; `artifacts/oracle.json` = `Record<username, Record<year, OracleYear>>`:
```ts
interface OracleYear {
  available: boolean; thin: boolean;
  episodes: number; hoursFloor: number; // floor(total minutes / 60), episodes + films, per the engine's rounding — read aggregate.ts and match it
  titlesCompleted: number; titlesDropped: number; namedDropped: string[];
  topShow: string | null; topShowLastWatched: string | null; // "YYYY-MM-DD" local
  niche: string | null;
  stillPlanning: string[]; // titles, created before period end
  unknownRuntime: number;
  bigDay: { date: string; episodes: number } | null;
  longestStreak: number;
  crew: { username: string; episodes: number }[]; // collaborators with consent, the viewer included, ordered as the service orders
  compare: Record<string, { onlyYou: number; both: number; onlyThem: number }>;
  alsoTopFor: string[];
}
```

- [ ] **Step 1: `seed.ts`** — in this order, each step logged with counts, all through a Drizzle client created with `buildE2eEnv().DATABASE_URL` after `assertE2eDatabaseUrl`:
  1. `resolveCatalogue()`.
  2. Users: for each persona, `SELECT` by username (signing-in personas already exist from `e2e:register`); insert the rest; then `UPDATE users SET created_at, timezone, share_stats_with_collaborators` from the spec. Truncate every seeded user's `episode_watch_status`, `user_content_status`, `series_finale`, `list_*` rows first so the seed is re-runnable.
  3. `generate()` each persona → bulk insert episodes (`watched = true`) and statuses.
  4. Lists and `list_collaborators` from `lists` specs; list items.
  5. Warm metadata: `addToCache(tmdbId, type)` for every catalogue entry any persona references (pace 250 ms, as the backfill does). Then delete the cache row of ava's `uncached` film.
  6. Warm runtimes: `ensureSeasonsCached(distinct (tmdbId, season) over all episodes)` and film runtimes the way `tools/backfill-runtimes.ts` does (import its helpers if exported; otherwise mirror its film loop).
  7. Degrade: set `runtime = NULL` for three chosen ava 2025 episodes (keep `tmdb_season_fetch`).
  8. Pre-generate the percentile cohort and the collaborators: `getOrGenerateSnapshot(userId, calendarYearPeriod(2025))` for every `e2e_pop*`, then dee, eli…jon, bo, cy, bat, flo, tia — **not ava** (her first generation happens in the browser, which is what the specs time). Log each snapshot's `thin` flag and headline minutes.
  9. Print a summary table.
- [ ] **Step 2: `oracle.ts`** — independent of `src/lib/series-finale/aggregate.ts`: plain SQL over the seeded tables plus the rules from the spec (read the spec's statistic definitions, `aggregate.ts` and `service.ts` once to match rounding, tie-breaks and the collaborator rule, and cite the line you matched in a comment). Where a rule is genuinely intricate (percentile tolerance), the oracle records `null` and specs check presence/absence instead of the number. Write `artifacts/oracle.json` and print ava's 2025 block.
- [ ] **Step 3: Run the full data path**

```bash
npm run e2e:db:reset && npm run e2e:migrate && npm run e2e:build
npm run e2e:start &   # or rely on Playwright's webServer; register needs the server up
npm run e2e:register && npm run e2e:seed && npm run e2e:oracle
```
Expected: seed summary shows every persona; cohort snapshots non-thin except tia; oracle JSON present. Record ava's 2025 oracle block in the task report.
- [ ] **Step 4: `run.ts all`** chains: db reset → migrate → build → start server (child, killed on exit) → register → seed → oracle → `playwright test` → gallery (Task 9) → leaves the db running for inspection (the report says how to `e2e:db:down`).
- [ ] **Step 5: Commit** — `test: e2e seeder and SQL oracle for Series Finale`.

---

### Task 5: Gating, APIs, share card image, dashboard banner

**Files:** Create `specs/10-gating.e2e.ts`, `specs/20-api-and-card.e2e.ts`, `specs/30-banner.e2e.ts`

Every assertion goes through `check()` so it lands in the evidence log; every visual state through `shot()`.

- [ ] **10-gating** (desktop + phone):
  - `e2e_neo`: profile data tab shows "No Series Finale yet…" (`shot profile/neo-empty`); dashboard has no banner; `/series-finale/2025` shows the unavailable state, not "try again" (`shot recap/neo-2025-unavailable`).
  - `e2e_ava`: `/series-finale/2026` → unavailable state (period not over); `/series-finale/abc` → the app's 404 page (`shot recap/malformed-404`); `/series-finale/2023/story` (ava's thin 2023) → thin card story.
  - `e2e_tia`: `/series-finale/2025` → thin-year card, no Share button, no "Play as story" (`shot recap/tia-2025-thin`); story → thin card (`shot story/tia-2025-thin`).
  - Signed out: `/series-finale/2025` redirects to `/auth`.
- [ ] **20-api-and-card** (desktop only; API-level, uses `page.request` with the persona's storage state):
  - `GET /api/series-finale` as ava → periods `["2025","2024","2023"]` newest first, headline episodes match the oracle, `cache-control: private, no-store`.
  - `GET /api/series-finale/2025` as ava → payload present; crew usernames are the oracle's; **timing** of this first generation recorded as evidence (`check("gen-time", …, "< 10000 ms", ms)` — informational, soft).
  - Status matrix for `/api/series-finale/{p}/card`: ava 2025 → 200 `image/png` with PNG IHDR 1080×1350 and `no-store`; ava 2026 → 404; ava `abc` → 400; tia 2025 → 404 (thin); signed out → 401 with `no-store`.
  - pop12: read its stored 2025 payload via `db.sh psql` → `headline.percentile` > 50 (`check`).
  - Save card PNGs: `artifacts/cards/ava-2025.png`, `bo-2025.png`, `bat-2025.png`, `flo-2025.png` (flo: no top-show block, long username wrapped).
  - **Privacy:** fetch ava's full payload JSON (it contains crew/compare usernames) and the card PNG; assert the PNG bytes do not contain any collaborator username as a UTF-8 string (cheap check that nothing text-embedded leaks — rendering is vector-to-raster, so the real proof is visual; the gallery puts the four cards side by side for Ben).
- [ ] **30-banner** (desktop + phone; order matters — read-only checks first):
  - ava's dashboard: banner is the first element in `<main>`, says "Your 2025 Series Finale is ready", "{episodes} episodes. {titles} titles." from the oracle (`shot dashboard/ava-banner`, `shotElement banner`).
  - tia, neo, flo-if-applicable: no banner.
  - The "See your Series Finale" link goes to `/series-finale/2025/story`.
  - **Mutating, last in file, desktop project only:** click "Not now" → banner gone **before** the POST resolves (delay the dismiss route by 1.5 s with `page.route` and assert invisibility within 300 ms); reload → still gone; no banner for 2024 appears (`shot dashboard/ava-after-dismiss`). Then a failure case on bo: fail the POST with 500 → banner comes back with the plain error line (`shot dashboard/bo-dismiss-failed`), then restore (unroute) and leave bo undismissed.
- [ ] Run, fix spec bugs (not app bugs — an app bug is reported, not fixed, see Task 9), commit — `test: e2e gating, API, share card and banner checks`.

---

### Task 6: Recap page — oracle checks and the screenshot set

**Files:** Create `specs/40-recap.e2e.ts`, `specs/41-recap-visual.e2e.ts`, `specs/42-recap-states.e2e.ts`

- [ ] **40-recap** (desktop + phone) as ava, `/series-finale/2025`:
  - hero: episodes, films and hours per the oracle (`formatCount`, "1 hour" singular never exercised here — covered by unit tests); date range "1 January – 31 December 2025".
  - stat tiles: finished = oracle `titlesCompleted`, dropped = oracle `titlesDropped`.
  - top show = oracle; "last watched {date}" formatted from `topShowLastWatched`.
  - niche = oracle niche.
  - shame panel: headline count = `titlesDropped`; names = `namedDropped`; "And one more." present (the uncached film).
  - still-planning list = oracle `stillPlanning` exactly — the 2026-02-10 film absent.
  - unknown-runtime disclosure mentions 3 "episodes or films".
  - big day date and count; streak "17".
  - crew: 8 collaborators + ava (CREW_LIMIT), ordered as the oracle; ava and dee share a rank number (competition ranking); cy present (pre-opt-out); bo above ava.
  - compare split for each peer the UI shows: onlyYou / both / onlyThem = oracle; "{bo} finished, you dropped" names the right title; the shared planning film shows.
  - "Also number one for" lists bo and cy.
  - percentile line present ("Top N% of everyone…") for ava; TMDB attribution logo + disclaimer in the footer.
  - "Play as story" and "Share" in the header.
- [ ] **41-recap-visual** (desktop, phone, webkit-phone): full-page screenshots and one `shotElement` per section, for: ava 2025, ava 2024, ava 2023 (thin), bo 2025, bat 2025 (disclosures instead of the clock chart / late share), flo 2025 (no top show; films only), pop12 is not a login persona — skip. Names: `recap/<user>-<year>/full`, `…/hero`, `…/tiles`, `…/top-show`, `…/niche`, `…/genres`, `…/months`, `…/big-day`, `…/rhythm`, `…/shame`, `…/crew`, `…/compare`, `…/footer`.
- [ ] **42-recap-states** (desktop + phone): loading (hold `GET /api/series-finale/2025` for 3 s via `page.route`, screenshot the skeleton/spinner), load failure (return 500 → failure notice with a Retry button; click Retry after unrouting → recap renders; `shot recap/state-error`, `…/state-retried`), unavailable (404 → the "no Series Finale for 2025" notice, no retry button).
- [ ] Run, commit — `test: e2e recap checks and screenshots`.

---

### Task 7: The story

**Files:** Create `specs/50-story.e2e.ts`, `specs/51-story-visual.e2e.ts`

- [ ] **50-story** (desktop + phone + small-phone) as ava 2025:
  - Walk every card with `ArrowRight`; at each, assert the progress bars (`role="progressbar"`, `aria-valuenow`/`aria-valuemax`) and record the card's heading (`h2`) in evidence; the reel has one `h1`.
  - `ArrowLeft` goes back; tap right third advances, tap left third goes back (phone: `page.touchscreen.tap`).
  - Close button (accessible name) returns to `/series-finale/2025`.
  - Crew card: top 5 + ava at her real rank + "And N more" (N = crew size − shown).
  - Summary card: "Share your card" button present; tapping it does **not** advance or close the reel (stub `navigator.share`/`canShare` via `addInitScript` so the tap resolves immediately and assert the URL and card index unchanged).
  - small-phone: on the tallest cards (crew, compare, shame) scroll to the bottom and assert the TMDB attribution and the compare controls are visible (S26); the page scroll resets on the next card.
  - Wording parity: the finished card's dropped number equals the recap's dropped tile; "last watched" date equals the recap's; straight-days wording equals the recap hero's.
- [ ] **51-story-visual** (phone, small-phone, desktop, webkit-phone): one screenshot per card: `story/<user>-<year>/<nn>-<heading-slug>` for ava 2025, bat 2025, flo 2025; thin story for tia.
- [ ] Run, commit — `test: e2e story navigation, layout and screenshots`.

---

### Task 8: Profile, consent, rename, share button, account switch

**Files:** Create `specs/60-profile.e2e.ts`, `specs/70-share-button.e2e.ts`, `specs/80-consent-and-rename.e2e.ts`, `specs/90-account-switch.e2e.ts`

- [ ] **60-profile** (desktop + phone): ava's data tab lists 2025, 2024, 2023 newest first, newest highlighted, each linking to its recap, "{n} episodes · {n} titles" per oracle, 2023 listed although thin (`shot profile/ava-rows`); list fetch failure (500 via `page.route`) shows "Couldn't load your Series Finale archive…" and not "No Series Finale yet" (`shot profile/rows-error`); the crew-comparison switch shows ON with the consent text (`shot profile/crew-switch-on`); failed PUT (500) reverts to ON and shows "Could not save that. Reverted." via the switch's error (`shot profile/crew-switch-failed`).
- [ ] **70-share-button**: desktop — as ava, recap header Share → a Playwright `download` named `series-finale-2025.png`, bytes are a 1080×1350 PNG (save to `artifacts/cards/ava-2025-downloaded.png`); prefetch happened on mount (the card request is observed before the click). Phone — stub `navigator.canShare → true` and `navigator.share` capturing its argument via `addInitScript`; tap Share; the captured payload has exactly `files` (one `File`, name `series-finale-2025.png`, type `image/png`) and no `text`/`title`/`url`. Cancel — `share` rejects with `{ name: "AbortError" }` → no failure line. Failure — card route 500 → "That card could not be made. Try again in a moment." (`shot share/failure-line`). Story summary Share behaves the same (phone).
- [ ] **80-consent-and-rename** (desktop; mutating):
  1. Sign in as cy; profile data tab; turn the crew switch OFF; reload; still OFF (`shot profile/cy-switch-off`).
  2. Sign in as ava; reload `/series-finale/2025`: cy absent from crew, from compare, and from "Also number one for" (only bo remains) — consent is applied on read, the stored snapshot untouched (verify via `db.sh psql` that ava's stored payload still names cy). `shot recap/ava-2025-after-cy-optout/crew` and `/compare`.
  3. Sign in as bo; rename to `e2e_bo_renamed` via the profile's username changer.
  4. Sign in as ava; the recap and story show `e2e_bo_renamed` in crew, compare and "Also number one for" (`shot recap/ava-2025-after-rename/crew`). bo's own card (`/api/series-finale/2025/card` as bo) shows the new name (save `cards/bo-2025-renamed.png`).
- [ ] **90-account-switch** (desktop; mutating; the I1 regression): one page, one virtual authenticator. Sign in as ava → open `/series-finale/2025` (card prefetches) → sign out through the profile → sign in as bat in the same page → open `/series-finale/2025` → click Share (download path): a new card request was made after sign-in, the downloaded bytes differ from `cards/ava-2025-downloaded.png`, and equal a direct `GET` of bat's card. Also: before bat's recap loads, the page never shows ava's crew (assert no ava collaborator username appears in the DOM at any time — use a `MutationObserver` installed via `addInitScript` that records any text node containing `e2e_bo`, `e2e_cy`, `e2e_dee`). Record the logout transition for the P19 flash: screenshot immediately after clicking sign-out on the Security tab (`shot profile/logout-transition-security`).
- [ ] Run, commit — `test: e2e profile, consent, rename, share and account-switch checks`.

---

### Task 9: Gallery, report, the full run, and the review

**Files:** Create `e2e/series-finale/report/gallery.ts`; modify `run.ts` (`gallery`, final step of `all`); `README.md` final.

- [ ] **Step 1: `gallery.ts`** — reads `artifacts/screenshots/**`, `artifacts/cards/*.png`, `artifacts/evidence.jsonl`, `artifacts/results.json`, `artifacts/oracle.json`, and writes:
  - `artifacts/index.html` — self-contained (images referenced relatively), dark page, sections in this order: Share cards (side by side), Dashboard banner, Recap (per persona/year: desktop | phone | webkit-phone columns per section), Story (per card, phone | small-phone | desktop | webkit-phone), Profile, States (loading, error, unavailable, 404), Consent & rename before/after, Account switch. Each image captioned with its name and the checks that relate to it. A top summary: pass/fail counts per project, failed checks listed first with expected vs actual.
  - `artifacts/report.md` — the same results as text: environment (git SHA, Playwright/Chromium/WebKit versions, db image), seeded cast summary, ava's oracle block, every check (id, project, expected, actual, PASS/FAIL), timing evidence, anything skipped and why (e.g. WebKit session cookie).
- [ ] **Step 2: The full run** — `npm run e2e:all`. Expected: all specs executed; failures are **findings**, not reasons to edit app code. A failing check caused by a spec bug is fixed in the spec and the run repeated; a failing check caused by the app is left failing, and listed under "Findings" in `report.md` with the evidence and a one-line diagnosis.
- [ ] **Step 3: Visual review** (the controller, not the implementer): read every screenshot; write `artifacts/visual-review.md` — per surface, anything that looks wrong against the artboards (`.superpowers/sdd/2026-08-31-series-finale-4-ui/artboards/`, `…-5-share-image/artboards/1g-share-card.html`): clipping, overflow at phone width (M9 was never browser-checked), untrue or inconsistent copy, missing attribution, gradients (P9), weight (P15), the logout flash (P19).
- [ ] **Step 4: Commit** the harness changes only (never artifacts) — `test: e2e gallery and report`. Leave the db and server state documented in the report; `npm run e2e:db:down` when Ben is done.

---

## Coverage map (self-check against the feature spec and Ben's request)

| Area | Where |
| --- | --- |
| Multi-account friend stats: crew ranking, cap, tie, compare split, they-finished-you-dropped, both-planning, also-number-one | Cast (Task 3), oracle (Task 4), 40-recap, 50-story |
| Consent withdrawal applied on read | 80-consent-and-rename |
| Current usernames substituted | 80-consent-and-rename |
| Percentile cohort (≥ 10), line only when ≤ 50% | Seeder step 8, 40-recap (present for ava), pop12's stored `headline.percentile` > 50 via a db check in 20-api (the ≤ 50 display rule itself is unit-tested) |
| Thin years, gap/none, not-yet-over years, malformed period | 10-gating, 20-api |
| Zone-correct periods (Brisbane edges) | ava's `extraEpisodes`, oracle episodes, 40-recap |
| Solo vs batch ticks, timeline and late share disclosures | ava vs bat, 41-recap-visual |
| Unknown runtimes disclosure | seeder step 7, 40-recap |
| Dropped count consistency (I3/S34) incl. uncached title | ava's uncached film, 40-recap, 50-story parity |
| Still-planning bounded by period (S32) | ava's 2026-02-10 film, 40-recap |
| Banner newest-only, not thin, optimistic dismiss + failure | 30-banner |
| Profile rows, empty, error; opt-out switch + failure | 60-profile |
| Story nav (keys, taps, close), progress bars, headings, small-phone scroll, crew cap | 50-story |
| Share card: statuses, no-store, dimensions, privacy, long username, films-only | 20-api-and-card |
| Share button: prefetch, download, native share payload, cancel, failure, summary card | 70-share-button |
| Cross-account cache clear (I1) and logout flash (P19) | 90-account-switch |
| Screenshots of recap and every component, desktop + phone (+ small phone, WebKit) | 41, 42, 51, 60, 70, 80, 90 + gallery |
