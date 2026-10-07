# Series Finale 1 — Runtime Cache Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache real per-episode and per-film runtimes from TMDB so the Series Finale "hours watched" headline is computed from actual minutes rather than an estimate.

**Architecture:** Two new global (user-independent) tables cache TMDB runtime data — `tmdb_episode_runtime` holds per-episode minutes, `tmdb_season_fetch` records which seasons have already been asked for so seasons with genuinely-missing runtimes are not refetched forever. Films get a new nullable `runtime` column on the existing `tmdb_cache`. A resolution module layers cache lookup, on-demand season fetch, and an explicit "unknown" accounting path; a backfill script warms the cache across all existing watch history.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest, existing `tmdbClient`.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`

## Global Constraints

- Node.js 20.9+. Next.js 16 App Router, React 19.
- All new DB access goes through `src/lib/db` (`postgres-js` driver). **Never** use the edge runtime with the DB.
- Schema changes are additive only. No existing column changes type or nullability.
- Migrations: edit `src/lib/db/schema.ts`, then `npm run db:generate`, then `npm run db:migrate`. Never hand-write migration SQL.
- Tests: Vitest, `npm test`. Test files sit next to their source as `<name>.test.ts`.
- Lint must pass with zero warnings: `npm run lint:ci`. Typecheck: `npm run typecheck`.
- Comment style in this repo is explanatory — comments say *why*, often citing the failure they prevent. Match it. Do not add narrating comments that restate the code.
- Voice for any user-facing copy: plain, slightly wry, **no exclamation marks**.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/db/schema.ts` (modify) | Add `tmdbCache.runtime`, `tmdbEpisodeRuntime`, `tmdbSeasonFetch` |
| `src/lib/tmdb/client.ts` (modify) | Correct `TMDBEpisode.runtime` to nullable |
| `src/lib/series-finale/runtime.ts` (create) | Runtime resolution: pure summarisers + DB/TMDB loaders |
| `src/lib/series-finale/runtime.test.ts` (create) | Unit tests |
| `tools/backfill-runtimes.ts` (create) | One-shot cache warmer over existing watch history |
| `package.json` (modify) | `backfill:runtimes` script |

---

### Task 1: Schema — runtime columns and tables

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/<generated>.sql` (via `npm run db:generate`)

**Interfaces:**
- Consumes: nothing
- Produces: `tmdbEpisodeRuntime`, `tmdbSeasonFetch` table objects and their
  `TmdbEpisodeRuntime` / `NewTmdbEpisodeRuntime` / `TmdbSeasonFetch` /
  `NewTmdbSeasonFetch` types; a `runtime` column on `tmdbCache`.

- [ ] **Step 1: Add the `runtime` column to `tmdbCache`**

In `src/lib/db/schema.ts`, inside the existing `tmdbCache` table definition, add
after the `adult` column:

```ts
    // Films only; TV rows leave this null and use `tmdb_episode_runtime`
    // instead, because a series-level average is wrong for any show whose
    // episodes vary in length -- which is most of them.
    runtime: integer("runtime"),
```

- [ ] **Step 2: Add the two new tables**

In `src/lib/db/schema.ts`, after the `tmdbCache` definition, add:

```ts
// Per-episode runtimes from TMDB. Global and user-independent: one fetch of a
// season serves every user forever.
export const tmdbEpisodeRuntime = pgTable(
  "tmdb_episode_runtime",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    // Nullable: TMDB genuinely has no runtime for some episodes. A null here
    // means "asked, and TMDB does not know", which is different from an
    // absent row meaning "never asked".
    runtime: integer("runtime"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(table.tmdbId, table.seasonNumber, table.episodeNumber),
  ],
);

// Records which (show, season) pairs have been fetched from TMDB. Exists only
// to distinguish "TMDB has no runtime for these episodes" from "we never
// asked" -- without it, a season whose episodes all lack runtimes is refetched
// on every generation, forever.
export const tmdbSeasonFetch = pgTable(
  "tmdb_season_fetch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    seasonNumber: integer("season_number").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.tmdbId, table.seasonNumber)],
);
```

- [ ] **Step 3: Add the inferred types**

In the types block of `src/lib/db/schema.ts`, after the `TMDBCache` pair, add:

```ts
export type TmdbEpisodeRuntime = typeof tmdbEpisodeRuntime.$inferSelect;
export type NewTmdbEpisodeRuntime = typeof tmdbEpisodeRuntime.$inferInsert;

export type TmdbSeasonFetch = typeof tmdbSeasonFetch.$inferSelect;
export type NewTmdbSeasonFetch = typeof tmdbSeasonFetch.$inferInsert;
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file appears in `drizzle/` containing `CREATE TABLE
"tmdb_episode_runtime"`, `CREATE TABLE "tmdb_season_fetch"`, and `ALTER TABLE
"tmdb_cache" ADD COLUMN "runtime" integer`.

Read the generated SQL and confirm it contains no `DROP` statements. If it
does, stop — something was removed from the schema by accident.

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add runtime caches for Series Finale hours"
```

---

### Task 2: Correct the TMDB episode runtime type

**Files:**
- Modify: `src/lib/tmdb/client.ts` (the `TMDBEpisode` interface)

**Interfaces:**
- Consumes: nothing
- Produces: `TMDBEpisode.runtime` typed `number | null`

**Why this task exists:** `TMDBEpisode.runtime` is currently typed `number`, but
TMDB returns `null` for episodes it has no runtime for. The whole point of the
cache is to distinguish missing data from zero, so the type has to admit null
before any code depends on it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tmdb/client.test.ts` if it does not exist, or append to it:

```ts
import { describe, expect, it } from "vitest";

import type { TMDBEpisode } from "./client";

describe("TMDBEpisode", () => {
  it("admits a null runtime, which TMDB returns for some episodes", () => {
    const episode: TMDBEpisode = {
      air_date: "2026-03-14",
      episode_number: 1,
      name: "Pilot",
      overview: "",
      runtime: null,
    };

    expect(episode.runtime).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tmdb/client.test.ts`
Expected: FAIL — TypeScript error, `Type 'null' is not assignable to type 'number'`.

- [ ] **Step 3: Widen the type**

In `src/lib/tmdb/client.ts`, change the `TMDBEpisode` interface:

```ts
export interface TMDBEpisode {
  air_date: string;
  episode_number: number;
  name: string;
  overview: string;
  // TMDB returns null for episodes it has no runtime for. The Series Finale
  // runtime cache depends on telling "unknown" apart from "zero", so this
  // must not be narrowed back to `number`.
  runtime: number | null;
}
```

- [ ] **Step 4: Run test and typecheck**

Run: `npx vitest run src/lib/tmdb/client.test.ts && npm run typecheck`
Expected: PASS. If `npm run typecheck` now reports errors in
`src/components/content/EpisodeTracker.tsx`, that is expected — it renders
`episode.runtime` behind a truthiness check (`{episode.runtime && ...}`), which
already handles null correctly and should compile. Fix any genuine new errors
by adding null checks; do not revert the type.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tmdb/client.ts src/lib/tmdb/client.test.ts
git commit -m "fix: TMDB episode runtime is nullable"
```

---

### Task 3: Pure runtime summariser

**Files:**
- Create: `src/lib/series-finale/runtime.ts`
- Create: `src/lib/series-finale/runtime.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type EpisodeKey = { tmdbId: number; seasonNumber: number; episodeNumber: number }`
  - `type RuntimeLookup = Map<string, number | null>`
  - `function episodeKeyOf(key: EpisodeKey): string`
  - `function summariseEpisodeRuntimes(episodes: EpisodeKey[], lookup: RuntimeLookup): { minutes: number; unknownCount: number }`

**Why pure:** this is the arithmetic behind the headline number on every card.
Keeping it free of DB and network access is what makes the unknown-runtime
accounting cheap to test exhaustively.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  episodeKeyOf,
  summariseEpisodeRuntimes,
  type EpisodeKey,
  type RuntimeLookup,
} from "./runtime";

const ep = (
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): EpisodeKey => ({ tmdbId, seasonNumber, episodeNumber });

describe("episodeKeyOf", () => {
  it("builds a stable composite key", () => {
    expect(episodeKeyOf(ep(1396, 2, 7))).toBe("1396:2:7");
  });

  it("does not collide across differently-shaped ids", () => {
    expect(episodeKeyOf(ep(1, 23, 4))).not.toBe(episodeKeyOf(ep(1, 2, 34)));
  });
});

describe("summariseEpisodeRuntimes", () => {
  it("sums known runtimes", () => {
    const lookup: RuntimeLookup = new Map([
      ["1:1:1", 42],
      ["1:1:2", 45],
    ]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)], lookup)).toEqual(
      { minutes: 87, unknownCount: 0 },
    );
  });

  it("counts an episode whose cached runtime is null as unknown, not zero", () => {
    const lookup: RuntimeLookup = new Map([
      ["1:1:1", 42],
      ["1:1:2", null],
    ]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)], lookup)).toEqual(
      { minutes: 42, unknownCount: 1 },
    );
  });

  it("counts an episode absent from the lookup as unknown", () => {
    const lookup: RuntimeLookup = new Map([["1:1:1", 42]]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(9, 9, 9)], lookup)).toEqual(
      { minutes: 42, unknownCount: 1 },
    );
  });

  it("returns zeroes for no episodes", () => {
    expect(summariseEpisodeRuntimes([], new Map())).toEqual({
      minutes: 0,
      unknownCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: FAIL — cannot resolve `./runtime`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/series-finale/runtime.ts`:

```ts
export interface EpisodeKey {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * Maps `episodeKeyOf(...)` to a runtime in minutes. A `null` value means TMDB
 * was asked and has no runtime; an absent entry means it was never asked. Both
 * count as unknown for arithmetic, but only the second is worth refetching.
 */
export type RuntimeLookup = Map<string, number | null>;

export function episodeKeyOf(key: EpisodeKey): string {
  return `${key.tmdbId}:${key.seasonNumber}:${key.episodeNumber}`;
}

/**
 * Total known minutes across `episodes`, plus a count of those whose runtime is
 * unknown.
 *
 * The unknown count is not decoration. Silently treating a missing runtime as
 * zero would make the headline "hours watched" quietly low in a way no reader
 * could detect, so callers get the number of episodes the total excludes and
 * can decide whether to qualify it.
 */
export function summariseEpisodeRuntimes(
  episodes: EpisodeKey[],
  lookup: RuntimeLookup,
): { minutes: number; unknownCount: number } {
  let minutes = 0;
  let unknownCount = 0;

  for (const episode of episodes) {
    const runtime = lookup.get(episodeKeyOf(episode));
    if (typeof runtime === "number") {
      minutes += runtime;
    } else {
      unknownCount += 1;
    }
  }

  return { minutes, unknownCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/runtime.ts src/lib/series-finale/runtime.test.ts
git commit -m "feat: pure episode runtime summariser"
```

---

### Task 4: Load cached runtimes from the database

**Files:**
- Modify: `src/lib/series-finale/runtime.ts`
- Modify: `src/lib/series-finale/runtime.test.ts`

**Interfaces:**
- Consumes: `EpisodeKey`, `RuntimeLookup`, `episodeKeyOf` from Task 3;
  `tmdbEpisodeRuntime` from Task 1
- Produces: `async function loadEpisodeRuntimes(episodes: EpisodeKey[]): Promise<RuntimeLookup>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/series-finale/runtime.test.ts`. Put this `vi.mock` call at
the **top of the file**, above the existing imports — `vi.mock` is hoisted, but
keeping it at the top is what the rest of this repo does (see
`src/lib/activity/service.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  });

  const db = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
    },
  };

  return {
    db,
    tmdbEpisodeRuntime: {
      tmdbId: "tmdb_id",
      seasonNumber: "season_number",
      episodeNumber: "episode_number",
      runtime: "runtime",
    },
    tmdbSeasonFetch: { tmdbId: "tmdb_id", seasonNumber: "season_number" },
  };
});
```

Then append the test:

```ts
import { db } from "../db";
import { loadEpisodeRuntimes } from "./runtime";

describe("loadEpisodeRuntimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty lookup without querying when given no episodes", async () => {
    const lookup = await loadEpisodeRuntimes([]);

    expect(lookup.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("maps returned rows onto composite keys", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([
      [
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, runtime: 42 },
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, runtime: null },
      ],
    ]);

    const lookup = await loadEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)]);

    expect(lookup.get("1:1:1")).toBe(42);
    expect(lookup.get("1:1:2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: FAIL — `loadEpisodeRuntimes is not a function`.

- [ ] **Step 3: Implement the loader**

Add to `src/lib/series-finale/runtime.ts`:

```ts
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, tmdbEpisodeRuntime } from "../db";
```

Adjust the import to match how the rest of the repo imports the db and schema —
check `src/lib/activity/service.ts` for the exact form and follow it. Then add:

```ts
/**
 * Read cached runtimes for the given episodes.
 *
 * Queries by distinct show so the predicate stays a small set of
 * `tmdb_id IN (...)` rather than one clause per episode; a heavy user has
 * thousands of episodes but only dozens of shows.
 */
export async function loadEpisodeRuntimes(
  episodes: EpisodeKey[],
): Promise<RuntimeLookup> {
  if (episodes.length === 0) return new Map();

  const showIds = Array.from(new Set(episodes.map((e) => e.tmdbId)));

  const rows = await db
    .select({
      tmdbId: tmdbEpisodeRuntime.tmdbId,
      seasonNumber: tmdbEpisodeRuntime.seasonNumber,
      episodeNumber: tmdbEpisodeRuntime.episodeNumber,
      runtime: tmdbEpisodeRuntime.runtime,
    })
    .from(tmdbEpisodeRuntime)
    .where(inArray(tmdbEpisodeRuntime.tmdbId, showIds));

  const lookup: RuntimeLookup = new Map();
  for (const row of rows) {
    lookup.set(episodeKeyOf(row), row.runtime);
  }

  return lookup;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/runtime.ts src/lib/series-finale/runtime.test.ts
git commit -m "feat: load cached episode runtimes"
```

---

### Task 5: Fetch and persist missing seasons

**Files:**
- Modify: `src/lib/series-finale/runtime.ts`
- Modify: `src/lib/series-finale/runtime.test.ts`

**Interfaces:**
- Consumes: `EpisodeKey` from Task 3; `tmdbSeasonFetch`, `tmdbEpisodeRuntime`
  from Task 1; `tmdbClient.getTVSeasonDetails` from `src/lib/tmdb/client.ts`
- Produces: `async function ensureSeasonsCached(pairs: { tmdbId: number; seasonNumber: number }[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add this mock alongside the existing ones at the top of
`src/lib/series-finale/runtime.test.ts`:

```ts
const getTVSeasonDetails = vi.fn();
vi.mock("../tmdb/client", () => ({
  tmdbClient: {
    getTVSeasonDetails: (...args: unknown[]) => getTVSeasonDetails(...args),
  },
}));
```

Then append:

```ts
import { ensureSeasonsCached } from "./runtime";

describe("ensureSeasonsCached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTVSeasonDetails.mockReset();
  });

  it("does not refetch a season already recorded in tmdb_season_fetch", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([
      [{ tmdbId: 1, seasonNumber: 1 }],
    ]);

    await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).not.toHaveBeenCalled();
  });

  it("fetches an unrecorded season and persists every episode, nulls included", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([[]]);
    getTVSeasonDetails.mockResolvedValue({
      name: "Season 1",
      season_number: 1,
      episodes: [
        { air_date: "2026-01-01", episode_number: 1, name: "A", overview: "", runtime: 42 },
        { air_date: "2026-01-08", episode_number: 2, name: "B", overview: "", runtime: null },
      ],
    });

    await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).toHaveBeenCalledWith(1, 1);
    expect(db.insert).toHaveBeenCalled();
  });

  it("records the season fetch even when TMDB throws, so a broken season is not retried forever", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([[]]);
    getTVSeasonDetails.mockRejectedValue(new Error("404"));

    await expect(
      ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: FAIL — `ensureSeasonsCached is not a function`.

- [ ] **Step 3: Implement**

Add to `src/lib/series-finale/runtime.ts`:

```ts
export interface SeasonKey {
  tmdbId: number;
  seasonNumber: number;
}

/**
 * Make sure every given (show, season) has been asked for at least once,
 * fetching and persisting per-episode runtimes for those that have not.
 *
 * Best-effort by design: a TMDB failure must not cost the caller its whole
 * generation run. A season that fails is still recorded as fetched, because
 * the alternative is retrying a permanently-404ing season on every generation
 * for every user, forever. Re-running the backfill script is the deliberate
 * way to retry.
 */
export async function ensureSeasonsCached(pairs: SeasonKey[]): Promise<void> {
  if (pairs.length === 0) return;

  const unique = new Map<string, SeasonKey>();
  for (const pair of pairs) {
    unique.set(`${pair.tmdbId}:${pair.seasonNumber}`, pair);
  }

  const showIds = Array.from(new Set(pairs.map((p) => p.tmdbId)));
  const fetched = await db
    .select({
      tmdbId: tmdbSeasonFetch.tmdbId,
      seasonNumber: tmdbSeasonFetch.seasonNumber,
    })
    .from(tmdbSeasonFetch)
    .where(inArray(tmdbSeasonFetch.tmdbId, showIds));

  const alreadyFetched = new Set(
    fetched.map((row) => `${row.tmdbId}:${row.seasonNumber}`),
  );

  for (const [key, season] of unique) {
    if (alreadyFetched.has(key)) continue;

    try {
      const details = await tmdbClient.getTVSeasonDetails(
        season.tmdbId,
        season.seasonNumber,
      );

      if (details.episodes.length > 0) {
        await db
          .insert(tmdbEpisodeRuntime)
          .values(
            details.episodes.map((episode) => ({
              tmdbId: season.tmdbId,
              seasonNumber: season.seasonNumber,
              episodeNumber: episode.episode_number,
              runtime: episode.runtime,
            })),
          )
          .onConflictDoUpdate({
            target: [
              tmdbEpisodeRuntime.tmdbId,
              tmdbEpisodeRuntime.seasonNumber,
              tmdbEpisodeRuntime.episodeNumber,
            ],
            set: {
              runtime: sql`excluded.runtime`,
              updatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      console.error(
        `Series Finale: failed to fetch season ${season.tmdbId}/${season.seasonNumber}`,
        error,
      );
    }

    await db
      .insert(tmdbSeasonFetch)
      .values({ tmdbId: season.tmdbId, seasonNumber: season.seasonNumber })
      .onConflictDoNothing();
  }
}
```

Add `tmdbSeasonFetch` to the schema import at the top of the file, and import
`tmdbClient` from `../tmdb/client`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/runtime.ts src/lib/series-finale/runtime.test.ts
git commit -m "feat: fetch and cache per-episode runtimes by season"
```

---

### Task 6: Film runtime resolution

**Files:**
- Modify: `src/lib/series-finale/runtime.ts`
- Modify: `src/lib/series-finale/runtime.test.ts`

**Interfaces:**
- Consumes: `tmdbCache` from Task 1
- Produces: `async function loadFilmRuntimes(tmdbIds: number[]): Promise<Map<number, number | null>>`
  and `function summariseFilmRuntimes(tmdbIds: number[], lookup: Map<number, number | null>): { minutes: number; unknownCount: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/runtime.test.ts`:

```ts
import { loadFilmRuntimes, summariseFilmRuntimes } from "./runtime";

describe("summariseFilmRuntimes", () => {
  it("sums known film runtimes", () => {
    const lookup = new Map<number, number | null>([
      [1, 164],
      [2, 120],
    ]);

    expect(summariseFilmRuntimes([1, 2], lookup)).toEqual({
      minutes: 284,
      unknownCount: 0,
    });
  });

  it("counts a null runtime as unknown", () => {
    const lookup = new Map<number, number | null>([
      [1, 164],
      [2, null],
    ]);

    expect(summariseFilmRuntimes([1, 2], lookup)).toEqual({
      minutes: 164,
      unknownCount: 1,
    });
  });

  it("counts an absent film as unknown", () => {
    expect(summariseFilmRuntimes([1], new Map())).toEqual({
      minutes: 0,
      unknownCount: 1,
    });
  });
});

describe("loadFilmRuntimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map without querying when given no ids", async () => {
    const lookup = await loadFilmRuntimes([]);

    expect(lookup.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: FAIL — `loadFilmRuntimes is not a function`.

- [ ] **Step 3: Implement**

Add to `src/lib/series-finale/runtime.ts`, importing `tmdbCache` and adding
`ContentType` to the schema import:

```ts
/** Read cached film runtimes from `tmdb_cache`. */
export async function loadFilmRuntimes(
  tmdbIds: number[],
): Promise<Map<number, number | null>> {
  if (tmdbIds.length === 0) return new Map();

  const rows = await db
    .select({ tmdbId: tmdbCache.tmdbId, runtime: tmdbCache.runtime })
    .from(tmdbCache)
    .where(
      and(
        inArray(tmdbCache.tmdbId, tmdbIds),
        eq(tmdbCache.contentType, ContentType.MOVIE),
      ),
    );

  return new Map(rows.map((row) => [row.tmdbId, row.runtime]));
}

/**
 * Total known minutes across `tmdbIds`, plus a count of those whose runtime is
 * unknown. Same contract as `summariseEpisodeRuntimes`, and unknown is counted
 * for the same reason: a silent zero would understate the headline.
 */
export function summariseFilmRuntimes(
  tmdbIds: number[],
  lookup: Map<number, number | null>,
): { minutes: number; unknownCount: number } {
  let minutes = 0;
  let unknownCount = 0;

  for (const tmdbId of tmdbIds) {
    const runtime = lookup.get(tmdbId);
    if (typeof runtime === "number") {
      minutes += runtime;
    } else {
      unknownCount += 1;
    }
  }

  return { minutes, unknownCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/runtime.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/runtime.ts src/lib/series-finale/runtime.test.ts
git commit -m "feat: film runtime resolution"
```

---

### Task 7: Backfill script

**Files:**
- Create: `tools/backfill-runtimes.ts`
- Modify: `package.json`
- Modify: `tools/README.md`

**Interfaces:**
- Consumes: `ensureSeasonsCached` from Task 5; `episodeWatchStatus`,
  `userContentStatus`, `tmdbCache` from schema
- Produces: an npm script `backfill:runtimes`

**Note on precedent:** `tools/` currently holds only standalone converters with
no database access. This is the first tool that touches the DB, so it needs
`DATABASE_URL` and `TMDB_API_KEY` in the environment exactly as the app does.

- [ ] **Step 1: Write the script**

Create `tools/backfill-runtimes.ts`:

```ts
/**
 * Warm the Series Finale runtime caches across all existing watch history.
 *
 * Run before generating any snapshot. Re-run safe: `ensureSeasonsCached`
 * skips seasons already recorded in `tmdb_season_fetch`, and film lookups skip
 * rows that already carry a runtime.
 *
 * Usage: npm run backfill:runtimes
 */
import { eq, isNull, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  ContentType,
  episodeWatchStatus,
  tmdbCache,
  userContentStatus,
} from "../src/lib/db/schema";
import { ensureSeasonsCached } from "../src/lib/series-finale/runtime";
import { tmdbClient } from "../src/lib/tmdb/client";

// TMDB asks for restraint rather than enforcing a hard cap. One request at a
// time with a short gap keeps a full backfill well inside anything they would
// consider abusive, and the job is not latency-sensitive.
const REQUEST_GAP_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillSeasons(): Promise<void> {
  const pairs = await db
    .selectDistinct({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
    })
    .from(episodeWatchStatus);

  console.log(`Seasons to consider: ${pairs.length}`);

  for (const [index, pair] of pairs.entries()) {
    await ensureSeasonsCached([pair]);
    await sleep(REQUEST_GAP_MS);
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${pairs.length}`);
    }
  }
}

async function backfillFilms(): Promise<void> {
  const films = await db
    .selectDistinct({ tmdbId: userContentStatus.tmdbId })
    .from(userContentStatus)
    .where(eq(userContentStatus.contentType, ContentType.MOVIE));

  console.log(`Films to consider: ${films.length}`);

  for (const [index, film] of films.entries()) {
    const cached = await db
      .select({ runtime: tmdbCache.runtime })
      .from(tmdbCache)
      .where(
        sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
      );

    if (cached.length > 0 && cached[0].runtime !== null) continue;

    try {
      const details = await tmdbClient.getMovieDetails(film.tmdbId);
      await db
        .update(tmdbCache)
        .set({ runtime: details.runtime, updatedAt: new Date() })
        .where(
          sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
        );
    } catch (error) {
      console.error(`  film ${film.tmdbId} failed`, error);
    }

    await sleep(REQUEST_GAP_MS);
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${films.length}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("Backfilling Series Finale runtime caches");
  await backfillSeasons();
  await backfillFilms();
  console.log("Done");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

The movie-details call is verified against the current client:
`getMovieDetails(movieId: number): Promise<TMDBMovieDetails>` at
`src/lib/tmdb/client.ts:305`, and `TMDBMovieDetails.runtime` is a plain
`number`.

- [ ] **Step 2: Add the npm script**

In `package.json`, add alongside the existing `db:*` entries:

```json
    "backfill:runtimes": "tsx tools/backfill-runtimes.ts",
```

Check whether `tsx` is already a dependency. If it is not, prefer whatever
TypeScript runner the repo already has available rather than adding a new
dependency; `npx tsx` works without installing if nothing suitable exists.

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck && npm run lint:ci`
Expected: PASS.

- [ ] **Step 4: Dry-run against a local database**

Run: `npm run backfill:runtimes`
Expected: prints season and film counts and completes. On an empty local
database it prints zeroes and exits cleanly — that is a valid pass.

- [ ] **Step 5: Document it**

Add a section to `tools/README.md` describing the script, its environment
requirements (`DATABASE_URL`, `TMDB_API_KEY`), that it is re-run safe, and that
it must complete before Series Finale generation is enabled.

- [ ] **Step 6: Commit**

```bash
git add tools/backfill-runtimes.ts tools/README.md package.json
git commit -m "feat: runtime cache backfill script"
```

---

## Verification

Run the full suite before declaring this plan complete:

```bash
npm run lint:ci && npm run typecheck && npm test
```

All three must pass. Coverage thresholds in `vitest.config.mts` are floors —
if this plan's new code drops the totals below them, add tests rather than
lowering the floors.
