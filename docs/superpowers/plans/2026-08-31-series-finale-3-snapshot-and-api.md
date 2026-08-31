# Series Finale 3 — Snapshot, Generation and API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a user's watch history for a period, run it through the pure aggregation engine, freeze the result in the database, and expose it over authenticated API routes.

**Architecture:** `service.ts` is the only file in `src/lib/series-finale/` that touches the database. It loads rows, resolves runtimes, computes the cross-user crew and comparison slices under the consent rules, computes the percentile from an existing cohort, calls `buildPayload`, and writes one immutable `series_finale` row. Generation is lazy — a completed period with no snapshot is generated on first request — so the launch backfill and the annual path are the same code.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Next.js 16 App Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`

**Dependencies:** Requires plan 1 (all tasks) and plan 2 (all tasks) complete.

## Global Constraints

- Node.js 20.9+. Next.js 16 App Router, React 19.
- All DB access via `src/lib/db`. **Never** the edge runtime — `postgres-js` opens raw TCP sockets.
- Schema changes additive only. `npm run db:generate` then `npm run db:migrate`. Never hand-write migration SQL.
- API routes wrap handlers in `withAuth` from `src/lib/auth/api-middleware.ts` and report failures via `handleApiError`.
- Snapshots are **immutable once written** except by explicit regeneration. No read path may recompute.
- Weekday indexing stays Monday-first 0–6 (plan 2's convention).
- Tests: Vitest. Lint zero-warnings: `npm run lint:ci`. Typecheck: `npm run typecheck`.
- Voice: plain, slightly wry, **no exclamation marks**.

## Privacy invariants (must hold at every step)

1. A collaborator appears in `crew` / `compare` **only** when their
   `users.share_stats_with_collaborators` is true.
2. `crew`, `compare` and `topShow.alsoTopFor` are **removed from the payload
   object** before it reaches the share-image renderer (plan 5) — not hidden
   with CSS.
3. No public, unauthenticated route serves any part of a payload.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/db/schema.ts` (modify) | `seriesFinale` table, `users.shareStatsWithCollaborators` |
| `src/lib/series-finale/service.ts` (create) | Loading, crew, percentile, generation, persistence |
| `src/lib/series-finale/service.test.ts` (create) | Tests |
| `src/lib/series-finale/periods.ts` (create) | Period derivation from a date |
| `src/lib/series-finale/periods.test.ts` (create) | Tests |
| `src/app/api/series-finale/route.ts` (create) | List available periods |
| `src/app/api/series-finale/[period]/route.ts` (create) | Fetch or generate a payload |
| `src/app/api/series-finale/[period]/dismiss/route.ts` (create) | Banner dismissal |
| `src/app/api/auth/session/route.ts` (modify) | Accept the opt-out field |

---

### Task 1: Schema — snapshot table and the opt-out column

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/<generated>.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `seriesFinale` table, `SeriesFinale` / `NewSeriesFinale` types,
  `users.shareStatsWithCollaborators` column

- [ ] **Step 1: Add the opt-out column to `users`**

In `src/lib/db/schema.ts`, inside the `users` table, add after `country`:

```ts
  // Series Finale crew comparisons. Default true, matching the app's existing
  // posture that people sharing a list can already see each other's activity.
  // This is a withdrawal switch, not an opt-in.
  shareStatsWithCollaborators: boolean("share_stats_with_collaborators")
    .default(true)
    .notNull(),
```

- [ ] **Step 2: Add the `seriesFinale` table**

After the `tmdbSeasonFetch` definition from plan 1, add:

```ts
// A frozen Series Finale recap. Written once per user per period and never
// recomputed on read -- tmdb_cache.popularity drifts and users keep editing
// status, so a live recompute would make an archived year disagree with the
// share image somebody already posted.
export const seriesFinale = pgTable(
  "series_finale",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    // Exclusive. A period is [start, end).
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    periodLabel: varchar("period_label", { length: 32 }).notNull(),
    payload: jsonb("payload").notNull(),
    // Bumped when the payload shape changes. A snapshot below the current
    // version is regenerated on read rather than rendered against a shape it
    // was never written for.
    schemaVersion: integer("schema_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Dashboard banner "Not now". Per-recap, so it needs no table of its own.
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.userId, table.periodStart, table.periodEnd),
    index("series_finale_user_id_period_start_idx").on(
      table.userId,
      table.periodStart.desc(),
    ),
  ],
);
```

- [ ] **Step 3: Add the inferred types**

```ts
export type SeriesFinale = typeof seriesFinale.$inferSelect;
export type NewSeriesFinale = typeof seriesFinale.$inferInsert;
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/` file with `CREATE TABLE "series_finale"` and
`ALTER TABLE "users" ADD COLUMN "share_stats_with_collaborators" boolean DEFAULT true NOT NULL`.

Read it and confirm there are no `DROP` statements.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add series_finale snapshot table and crew opt-out"
```

---

### Task 2: Period derivation

**Files:**
- Create: `src/lib/series-finale/periods.ts`
- Create: `src/lib/series-finale/periods.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Period { start: Date; end: Date; label: string }`
  - `function calendarYearPeriod(year: number): Period`
  - `function completedYearsBetween(firstActivity: Date, now: Date): Period[]`
  - `function parsePeriodLabel(label: string): Period | null`

**Why a module:** the API takes a period as a URL segment, generation needs the
list of completed years, and the percentile cohort compares period lengths.
Deriving those in three places is three chances to disagree about whether the
end is inclusive.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/periods.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  calendarYearPeriod,
  completedYearsBetween,
  parsePeriodLabel,
} from "./periods";

describe("calendarYearPeriod", () => {
  it("spans 1 January to the following 1 January, end exclusive", () => {
    const period = calendarYearPeriod(2026);

    expect(period.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(period.label).toBe("2026");
  });
});

describe("completedYearsBetween", () => {
  it("returns every completed year, newest first", () => {
    const periods = completedYearsBetween(
      new Date("2024-06-01T00:00:00Z"),
      new Date("2027-03-01T00:00:00Z"),
    );

    expect(periods.map((p) => p.label)).toEqual(["2026", "2025", "2024"]);
  });

  it("excludes the year in progress", () => {
    const periods = completedYearsBetween(
      new Date("2024-06-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
    );

    expect(periods.map((p) => p.label)).toEqual(["2025", "2024"]);
  });

  it("returns nothing when the first activity is in the current year", () => {
    expect(
      completedYearsBetween(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-08-31T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

describe("parsePeriodLabel", () => {
  it("parses a four-digit year", () => {
    expect(parsePeriodLabel("2026")?.label).toBe("2026");
  });

  it("rejects a non-year label", () => {
    expect(parsePeriodLabel("summer")).toBeNull();
  });

  it("rejects an implausible year", () => {
    expect(parsePeriodLabel("1200")).toBeNull();
    expect(parsePeriodLabel("9999")).toBeNull();
  });

  it("rejects a label with extra characters", () => {
    expect(parsePeriodLabel("2026a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/periods.test.ts`
Expected: FAIL — cannot resolve `./periods`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/periods.ts`:

```ts
export interface Period {
  start: Date;
  /** Exclusive. A period is [start, end). */
  end: Date;
  label: string;
}

// Nothing before streaming existed, and nothing far in the future, is a real
// period. Bounds exist so a hand-typed URL segment cannot ask for a scan
// across a thousand years.
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

export function calendarYearPeriod(year: number): Period {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
    label: String(year),
  };
}

/**
 * Every completed calendar year between the user's first activity and now,
 * newest first. The year in progress is excluded -- a recap of a year that has
 * not finished would be frozen mid-flight.
 */
export function completedYearsBetween(
  firstActivity: Date,
  now: Date,
): Period[] {
  const firstYear = firstActivity.getUTCFullYear();
  const lastCompletedYear = now.getUTCFullYear() - 1;

  const periods: Period[] = [];
  for (let year = lastCompletedYear; year >= firstYear; year -= 1) {
    periods.push(calendarYearPeriod(year));
  }

  return periods;
}

/** Parse a URL period segment. Returns null for anything not a plausible year. */
export function parsePeriodLabel(label: string): Period | null {
  if (!/^\d{4}$/.test(label)) return null;

  const year = Number.parseInt(label, 10);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;

  return calendarYearPeriod(year);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/periods.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/periods.ts src/lib/series-finale/periods.test.ts
git commit -m "feat: Series Finale period derivation"
```

---

### Task 3: Load a user's rows for a period

**Files:**
- Create: `src/lib/series-finale/service.ts`
- Create: `src/lib/series-finale/service.test.ts`

**Interfaces:**
- Consumes: `Period` from Task 2; schema tables; `TitleMeta`,
  `WatchedEpisodeRow`, `ContentStatusRow`, `titleKey` from plan 2 Task 1
- Produces:
  - `async function loadGenreNames(): Promise<Map<number, string>>`
  - `async function loadUserRows(userId: string, period: Period): Promise<{ episodes: WatchedEpisodeRow[]; statuses: ContentStatusRow[]; titles: Map<string, TitleMeta>; genreNames: Map<number, string> }>`

**Loading rules:**
- Episodes: `episode_watch_status` where `user_id = $1`, `watched = true`,
  `watched_at >= period.start`, `watched_at < period.end`.
- Statuses: **all** rows for the user, not only in-period ones — `buildShame`
  needs `planning` rows created long before the period, and the aggregators
  filter by period themselves.
- Titles: `tmdb_cache` rows for every `(tmdbId, contentType)` referenced.
- Genre names: from the TMDB genre list, cached per call.

- [ ] **Step 1: Write the failing test**

Create `src/lib/series-finale/service.test.ts`. Use the db mock shape from
`src/lib/activity/service.test.ts` as the model — copy its chain object and
extend it with the methods this service uses (`select`, `insert`, `update`,
`selectDistinct`, `where`, `orderBy`, `limit`, `returning`, `onConflictDoUpdate`).

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock shape mirrors src/lib/activity/service.test.ts. Keep them in step.
vi.mock("../db", () => {
  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    set: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift() ?? []),
    returning: () => Promise.resolve(resultsQueue.shift() ?? []),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  });

  const db = {
    select: vi.fn(() => chain),
    selectDistinct: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
    },
  };

  return { db };
});

vi.mock("../db/schema", () => ({
  episodeWatchStatus: {},
  userContentStatus: {},
  tmdbCache: {},
  users: {},
  lists: {},
  listItems: {},
  listCollaborators: {},
  seriesFinale: {},
  ContentType: { MOVIE: "movie", TV: "tv" },
}));

const getMovieGenres = vi.fn().mockResolvedValue({ genres: [] });
const getTVGenres = vi.fn().mockResolvedValue({ genres: [] });
vi.mock("../tmdb/client", () => ({
  tmdbClient: {
    getMovieGenres: () => getMovieGenres(),
    getTVGenres: () => getTVGenres(),
    getTVSeasonDetails: vi.fn(),
    getMovieDetails: vi.fn(),
  },
}));

import { db } from "../db";
import { calendarYearPeriod } from "./periods";
import { loadGenreNames, loadUserRows } from "./service";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(rows);

describe("loadUserRows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns episodes, statuses and a title map keyed by content type", async () => {
    setResults([
      // episodes
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-03-14T20:00:00Z"),
        },
      ],
      // statuses
      [
        {
          tmdbId: 1,
          contentType: "tv",
          status: "completed",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-04-04T00:00:00Z"),
        },
      ],
      // titles
      [
        {
          tmdbId: 1,
          contentType: "tv",
          title: "The Bear",
          posterPath: "/a.jpg",
          genreIds: [18],
          popularity: "88.5",
          runtime: null,
        },
      ],
    ]);

    const result = await loadUserRows("user-1", calendarYearPeriod(2026));

    expect(result.episodes).toHaveLength(1);
    expect(result.statuses).toHaveLength(1);
    expect(result.titles.get("tv:1")?.title).toBe("The Bear");
  });

  it("coerces the decimal popularity column to a number", async () => {
    setResults([
      [],
      [],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          title: "Sinners",
          posterPath: null,
          genreIds: [],
          popularity: "2.10",
          runtime: 164,
        },
      ],
    ]);

    const result = await loadUserRows("user-1", calendarYearPeriod(2026));

    expect(result.titles.get("movie:1")?.popularity).toBe(2.1);
  });
});

describe("loadGenreNames", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps ids to names across both movie and TV lists", async () => {
    getMovieGenres.mockResolvedValue({ genres: [{ id: 18, name: "Drama" }] });
    getTVGenres.mockResolvedValue({
      genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
    });

    const names = await loadGenreNames();

    expect(names.get(18)).toBe("Drama");
    expect(names.get(10765)).toBe("Sci-Fi & Fantasy");
  });

  it("returns an empty map rather than throwing when TMDB is unreachable", async () => {
    getMovieGenres.mockRejectedValue(new Error("503"));
    getTVGenres.mockRejectedValue(new Error("503"));

    await expect(loadGenreNames()).resolves.toBeInstanceOf(Map);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/service.ts`:

```ts
import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "../db";
import {
  episodeWatchStatus,
  tmdbCache,
  userContentStatus,
} from "../db/schema";
import type { Period } from "./periods";
import {
  titleKey,
  type ContentStatusRow,
  type TitleMeta,
  type WatchedEpisodeRow,
} from "./types";

export interface LoadedRows {
  episodes: WatchedEpisodeRow[];
  statuses: ContentStatusRow[];
  titles: Map<string, TitleMeta>;
  genreNames: Map<number, string>;
}

/**
 * Load everything the aggregation engine needs for one user and period.
 *
 * Statuses are loaded in full rather than filtered to the period: `buildShame`
 * reports films that have sat in "planning" for years, and those rows were
 * created long before the period started. The aggregators apply their own
 * period filters.
 */
export async function loadUserRows(
  userId: string,
  period: Period,
): Promise<LoadedRows> {
  const episodeRows = await db
    .select({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
      episodeNumber: episodeWatchStatus.episodeNumber,
      watchedAt: episodeWatchStatus.watchedAt,
    })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.watched, true),
        gte(episodeWatchStatus.watchedAt, period.start),
        lt(episodeWatchStatus.watchedAt, period.end),
      ),
    );

  const episodes: WatchedEpisodeRow[] = episodeRows
    // `watched_at` is nullable in the schema. A watched row without one cannot
    // be placed on the calendar, so it is dropped rather than dated to the
    // epoch.
    .filter((row) => row.watchedAt !== null)
    .map((row) => ({
      tmdbId: row.tmdbId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      watchedAt: row.watchedAt as Date,
    }));

  const statuses = (await db
    .select({
      tmdbId: userContentStatus.tmdbId,
      contentType: userContentStatus.contentType,
      status: userContentStatus.status,
      createdAt: userContentStatus.createdAt,
      updatedAt: userContentStatus.updatedAt,
    })
    .from(userContentStatus)
    .where(eq(userContentStatus.userId, userId))) as ContentStatusRow[];

  const referencedIds = Array.from(
    new Set([
      ...episodes.map((row) => row.tmdbId),
      ...statuses.map((row) => row.tmdbId),
    ]),
  );

  const titles = new Map<string, TitleMeta>();
  if (referencedIds.length > 0) {
    const titleRows = await db
      .select({
        tmdbId: tmdbCache.tmdbId,
        contentType: tmdbCache.contentType,
        title: tmdbCache.title,
        posterPath: tmdbCache.posterPath,
        genreIds: tmdbCache.genreIds,
        popularity: tmdbCache.popularity,
        runtime: tmdbCache.runtime,
      })
      .from(tmdbCache)
      .where(inArray(tmdbCache.tmdbId, referencedIds));

    for (const row of titleRows) {
      const contentType = row.contentType as "movie" | "tv";
      titles.set(titleKey(row.tmdbId, contentType), {
        tmdbId: row.tmdbId,
        contentType,
        title: row.title,
        posterPath: row.posterPath,
        genreIds: row.genreIds ?? [],
        // `popularity` is a Postgres numeric, which postgres-js returns as a
        // string. Every comparison downstream is numeric.
        popularity: Number(row.popularity),
        runtime: row.runtime,
      });
    }
  }

  return {
    episodes,
    statuses,
    titles,
    genreNames: await loadGenreNames(),
  };
}

/**
 * TMDB genre id to display name, across both movie and TV lists.
 *
 * Without this the genres card renders every slice as "Unknown" -- `genre_ids`
 * in `tmdb_cache` are numbers, and nothing else in the codebase resolves them
 * server-side.
 *
 * Best-effort: TMDB being unreachable during generation should cost the genre
 * labels, not the whole recap. An empty map degrades the card, and `buildGenres`
 * already falls back to "Unknown" per id.
 */
export async function loadGenreNames(): Promise<Map<number, string>> {
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbClient.getMovieGenres(),
      tmdbClient.getTVGenres(),
    ]);

    return new Map(
      [...movieGenres.genres, ...tvGenres.genres].map((genre) => [
        genre.id,
        genre.name,
      ]),
    );
  } catch (error) {
    console.error("Series Finale: failed to load TMDB genre names", error);
    return new Map();
  }
}
```

Add `import { tmdbClient } from "../tmdb/client";` to the top of the file.

**Call-count note:** `loadUserRows` is called once per crew member as well as for
the viewer, so this would hit TMDB once per collaborator. Memoise it at module
scope for the lifetime of the process — the genre list changes perhaps once a
year:

```ts
let genreNameCache: Map<number, string> | null = null;
```

Return the cache when set, populate it on the first successful load, and leave
it null on failure so a transient error is retried rather than cached.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/service.ts src/lib/series-finale/service.test.ts
git commit -m "feat: load user rows for a Series Finale period"
```

---

### Task 4: Crew and comparison, under the consent rules

**Files:**
- Modify: `src/lib/series-finale/service.ts`
- Modify: `src/lib/series-finale/service.test.ts`

**Interfaces:**
- Consumes: `Period`, `LoadedRows`; `CrewMemberTotals`, `ComparePeer`,
  `titleKey` from plan 2
- Produces:
  - `async function loadCollaboratorIds(userId: string): Promise<string[]>`
  - `async function loadCrew(userId: string, period: Period): Promise<CrewMemberTotals[]>`
  - `async function loadPeers(userId: string, period: Period): Promise<ComparePeer[]>`
  - `function buildCompare(mine: LoadedRows, peers: ComparePeer[], period: Period): SeriesFinalePayload["compare"]`
  - `const CREW_LIMIT = 8`

**Consent rule, enforced in `loadCrew` and `loadPeers`:** every query joins
`users` and filters `users.share_stats_with_collaborators = true`. A collaborator
who has withdrawn is absent from the result, not zeroed.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/service.test.ts`:

```ts
import { buildCompare, CREW_LIMIT } from "./service";
import type { ComparePeer } from "./types";

describe("CREW_LIMIT", () => {
  it("caps the leaderboard so a user on many shared lists cannot fan out unbounded", () => {
    expect(CREW_LIMIT).toBe(8);
  });
});

describe("buildCompare", () => {
  const period = calendarYearPeriod(2026);

  const mine = {
    episodes: [],
    titles: new Map(),
    genreNames: new Map(),
    statuses: [
      { tmdbId: 1, contentType: "tv" as const, status: "completed", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-02-01T00:00:00Z") },
      { tmdbId: 2, contentType: "tv" as const, status: "completed", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-02-01T00:00:00Z") },
      { tmdbId: 3, contentType: "tv" as const, status: "dropped", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-02-01T00:00:00Z") },
    ],
  };

  const peer = (overrides: Partial<ComparePeer> = {}): ComparePeer => ({
    userId: "u2",
    username: "ana",
    completedKeys: [],
    planningKeys: [],
    droppedKeys: [],
    ...overrides,
  });

  it("counts the three-way split of completed titles", () => {
    const result = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:2", "tv:9"] })],
      period,
    );

    expect(result[0]).toMatchObject({
      username: "ana",
      onlyYou: 1,
      both: 1,
      onlyThem: 1,
    });
  });

  it("names a title they finished and you dropped", () => {
    const result = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:3"] })],
      period,
    );

    expect(result[0].theyFinishedYouDropped).toBe("tv:3");
  });

  it("returns an empty list when there are no peers", () => {
    expect(buildCompare(mine, [], period)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: FAIL — `buildCompare is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/service.ts`, adding these to the schema import:
`users`, `lists`, `listCollaborators`, `listItems`, and `or` to the drizzle
import.

```ts
/**
 * Maximum people on the crew leaderboard.
 *
 * A user on many shared lists with many collaborators would otherwise fan out
 * into an unbounded number of per-peer aggregate queries at generation time.
 * The mock shows five; eight leaves room without letting it grow.
 */
export const CREW_LIMIT = 8;

/**
 * Everyone who shares a list with this user and has not withdrawn from crew
 * comparisons.
 *
 * The `share_stats_with_collaborators` filter is the consent boundary. It lives
 * in the query rather than a later filter so there is no path that loads a
 * withdrawn user's totals at all.
 */
export async function loadCollaboratorIds(userId: string): Promise<string[]> {
  const ownedOrJoined = await db
    .selectDistinct({ listId: lists.id })
    .from(lists)
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)));

  const listIds = ownedOrJoined.map((row) => row.listId);
  if (listIds.length === 0) return [];

  const owners = await db
    .selectDistinct({ userId: lists.ownerId })
    .from(lists)
    .innerJoin(users, eq(users.id, lists.ownerId))
    .where(
      and(
        inArray(lists.id, listIds),
        eq(users.shareStatsWithCollaborators, true),
      ),
    );

  const collaborators = await db
    .selectDistinct({ userId: listCollaborators.userId })
    .from(listCollaborators)
    .innerJoin(users, eq(users.id, listCollaborators.userId))
    .where(
      and(
        inArray(listCollaborators.listId, listIds),
        eq(users.shareStatsWithCollaborators, true),
      ),
    );

  const ids = new Set<string>();
  for (const row of [...owners, ...collaborators]) {
    if (row.userId !== userId) ids.add(row.userId);
  }

  return Array.from(ids).slice(0, CREW_LIMIT);
}

/** Episode and hour totals for each consenting collaborator, in the period. */
export async function loadCrew(
  userId: string,
  period: Period,
): Promise<CrewMemberTotals[]> {
  const collaboratorIds = await loadCollaboratorIds(userId);
  if (collaboratorIds.length === 0) return [];

  const crew: CrewMemberTotals[] = [];

  for (const collaboratorId of collaboratorIds) {
    const rows = await loadUserRows(collaboratorId, period);
    const profile = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, collaboratorId))
      .limit(1);

    if (profile.length === 0) continue;

    const lookup = await loadEpisodeRuntimes(rows.episodes);
    const { minutes } = summariseEpisodeRuntimes(rows.episodes, lookup);

    // Their most-watched show, for the "also number one for" line on the
    // viewer's top-show card.
    const episodeCounts = new Map<number, number>();
    for (const episode of rows.episodes) {
      episodeCounts.set(
        episode.tmdbId,
        (episodeCounts.get(episode.tmdbId) ?? 0) + 1,
      );
    }
    let topShowTmdbId: number | null = null;
    let topCount = 0;
    for (const [tmdbId, count] of episodeCounts) {
      if (count > topCount) {
        topShowTmdbId = tmdbId;
        topCount = count;
      }
    }

    crew.push({
      userId: collaboratorId,
      username: profile[0].username,
      episodes: rows.episodes.length,
      hours: Math.round(minutes / 60),
      topShowTmdbId,
    });
  }

  return crew.sort((a, b) => b.episodes - a.episodes);
}

/** Completed, planning and dropped title keys for each consenting collaborator. */
export async function loadPeers(
  userId: string,
  period: Period,
): Promise<ComparePeer[]> {
  const collaboratorIds = await loadCollaboratorIds(userId);
  const peers: ComparePeer[] = [];

  for (const collaboratorId of collaboratorIds) {
    const profile = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, collaboratorId))
      .limit(1);

    if (profile.length === 0) continue;

    const rows = await loadUserRows(collaboratorId, period);
    const keysWithStatus = (status: string) =>
      rows.statuses
        .filter((row) => row.status === status)
        .map((row) => titleKey(row.tmdbId, row.contentType));

    peers.push({
      userId: collaboratorId,
      username: profile[0].username,
      completedKeys: keysWithStatus("completed"),
      planningKeys: keysWithStatus("planning"),
      droppedKeys: keysWithStatus("dropped"),
    });
  }

  return peers;
}

/** Set arithmetic between the viewer's completed titles and each peer's. */
export function buildCompare(
  mine: Pick<LoadedRows, "statuses">,
  peers: ComparePeer[],
  period: Period,
): SeriesFinalePayload["compare"] {
  const inPeriod = (at: Date) => at >= period.start && at < period.end;

  const myCompleted = new Set(
    mine.statuses
      .filter((row) => row.status === "completed" && inPeriod(row.updatedAt))
      .map((row) => titleKey(row.tmdbId, row.contentType)),
  );
  const myDropped = new Set(
    mine.statuses
      .filter((row) => row.status === "dropped" && inPeriod(row.updatedAt))
      .map((row) => titleKey(row.tmdbId, row.contentType)),
  );
  const myPlanning = new Set(
    mine.statuses
      .filter((row) => row.status === "planning")
      .map((row) => titleKey(row.tmdbId, row.contentType)),
  );

  return peers.map((peer) => {
    const theirCompleted = new Set(peer.completedKeys);

    let both = 0;
    for (const key of myCompleted) {
      if (theirCompleted.has(key)) both += 1;
    }

    return {
      userId: peer.userId,
      username: peer.username,
      onlyYou: myCompleted.size - both,
      both,
      onlyThem: theirCompleted.size - both,
      theyFinishedYouDropped:
        peer.completedKeys.find((key) => myDropped.has(key)) ?? null,
      bothPlanningNeitherStarted:
        peer.planningKeys.find((key) => myPlanning.has(key)) ?? null,
    };
  });
}
```

Add to the imports at the top of the file:

```ts
import { loadEpisodeRuntimes, summariseEpisodeRuntimes } from "./runtime";
import type { ComparePeer, CrewMemberTotals, SeriesFinalePayload } from "./types";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/service.ts src/lib/series-finale/service.test.ts
git commit -m "feat: crew and comparison under the consent rules"
```

---

### Task 5: Percentile cohort

**Files:**
- Modify: `src/lib/series-finale/service.ts`
- Modify: `src/lib/series-finale/service.test.ts`

**Interfaces:**
- Consumes: `seriesFinale` table, `Period`
- Produces:
  - `const PERCENTILE_COHORT_MINIMUM = 10`
  - `const PERCENTILE_LENGTH_TOLERANCE = 0.1`
  - `function percentileOf(minutes: number, cohortMinutes: number[]): number | null`
  - `async function loadCohortMinutes(period: Period): Promise<number[]>`

**Rules (from the spec):** the cohort draws from snapshots **across all
periods**, not only the one being generated. A snapshot joins only when its
duration is within 10% of the target period's. Below 10 qualifying snapshots the
percentile is `null` and the card drops the line.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/service.test.ts`:

```ts
import {
  PERCENTILE_COHORT_MINIMUM,
  PERCENTILE_LENGTH_TOLERANCE,
  percentileOf,
} from "./service";

describe("percentileOf", () => {
  const cohort = Array.from({ length: 20 }, (_, i) => i * 100);

  it("returns null below the cohort minimum", () => {
    expect(percentileOf(500, [1, 2, 3])).toBeNull();
  });

  it("puts a top scorer in a low percentile number", () => {
    expect(percentileOf(10_000, cohort)).toBe(1);
  });

  it("puts a bottom scorer in a high percentile number", () => {
    expect(percentileOf(0, cohort)).toBeGreaterThan(90);
  });

  it("uses exactly the cohort minimum as the floor", () => {
    expect(PERCENTILE_COHORT_MINIMUM).toBe(10);
    expect(percentileOf(500, Array.from({ length: 10 }, () => 100))).not.toBeNull();
    expect(percentileOf(500, Array.from({ length: 9 }, () => 100))).toBeNull();
  });

  it("uses a 10% length tolerance for cohort membership", () => {
    expect(PERCENTILE_LENGTH_TOLERANCE).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: FAIL — `percentileOf is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/service.ts`:

```ts
/**
 * Minimum qualifying snapshots before a percentile is reported.
 *
 * Generation is lazy, so the first user to generate has no cohort at all.
 * Below this, "top 4% of everyone on WatchThis" would describe a handful of
 * people, so the line is dropped rather than shown with a weak number behind it.
 */
export const PERCENTILE_COHORT_MINIMUM = 10;

/**
 * How closely a snapshot's period length must match the target's to join the
 * cohort.
 *
 * The cohort spans periods -- a year is a year, and restricting to one period
 * starves it for no benefit. But the seasonal cut on the roadmap would
 * otherwise pool three-month totals with twelve-month ones and make the figure
 * meaningless. Inert while every period is a calendar year.
 */
export const PERCENTILE_LENGTH_TOLERANCE = 0.1;

/**
 * Where `minutes` falls in `cohortMinutes`, as a "top N%" figure. Lower is
 * better: 1 means the top one percent.
 */
export function percentileOf(
  minutes: number,
  cohortMinutes: number[],
): number | null {
  if (cohortMinutes.length < PERCENTILE_COHORT_MINIMUM) return null;

  const below = cohortMinutes.filter((value) => value < minutes).length;
  const share = below / cohortMinutes.length;

  // Clamp to 1 so a top scorer reads "top 1%" rather than "top 0%".
  return Math.max(1, Math.round((1 - share) * 100));
}

/** Headline minutes from every snapshot of a comparable period length. */
export async function loadCohortMinutes(period: Period): Promise<number[]> {
  const targetLength = period.end.getTime() - period.start.getTime();
  const rows = await db
    .select({
      payload: seriesFinale.payload,
      periodStart: seriesFinale.periodStart,
      periodEnd: seriesFinale.periodEnd,
    })
    .from(seriesFinale)
    .where(eq(seriesFinale.schemaVersion, SERIES_FINALE_SCHEMA_VERSION));

  return rows
    .filter((row) => {
      const length = row.periodEnd.getTime() - row.periodStart.getTime();
      return (
        Math.abs(length - targetLength) / targetLength <=
        PERCENTILE_LENGTH_TOLERANCE
      );
    })
    .map((row) => (row.payload as SeriesFinalePayload).headline?.minutes)
    .filter((minutes): minutes is number => typeof minutes === "number");
}
```

Add `seriesFinale` to the schema import and `SERIES_FINALE_SCHEMA_VERSION` to
the types import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/service.ts src/lib/series-finale/service.test.ts
git commit -m "feat: Series Finale percentile cohort"
```

---

### Task 6: Generate and persist a snapshot

**Files:**
- Modify: `src/lib/series-finale/service.ts`
- Modify: `src/lib/series-finale/service.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5, `buildPayload` from plan 2 Task 9,
  `ensureSeasonsCached` / `loadFilmRuntimes` / `summariseFilmRuntimes` from plan 1
- Produces:
  - `async function generateSnapshot(userId: string, period: Period): Promise<SeriesFinalePayload>`
  - `async function getOrGenerateSnapshot(userId: string, period: Period): Promise<SeriesFinalePayload>`
  - `async function listSnapshots(userId: string): Promise<{ label: string; generatedAt: Date; dismissedAt: Date | null; headline: SeriesFinalePayload["headline"] }[]>`

**Ordering inside `generateSnapshot`:**
1. `loadUserRows`
2. `ensureSeasonsCached` over the distinct (show, season) pairs in the episodes
3. `loadEpisodeRuntimes` / `loadFilmRuntimes`, then summarise both
4. `loadCrew`, `loadPeers`, `loadCohortMinutes`
5. `buildPayload`, then attach `compare` via `buildCompare`
6. Upsert into `series_finale` on the unique key

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/service.test.ts`:

```ts
import { getOrGenerateSnapshot } from "./service";
import { SERIES_FINALE_SCHEMA_VERSION } from "./types";

describe("alsoTopFor", () => {
  it("names only crew members whose top show matches the viewer's", () => {
    const crew = [
      { userId: "u1", username: "ana", episodes: 10, hours: 5, topShowTmdbId: 1 },
      { userId: "u2", username: "marcus", episodes: 10, hours: 5, topShowTmdbId: 2 },
    ];

    const matching = crew
      .filter((member) => member.topShowTmdbId === 1)
      .map((member) => member.username);

    expect(matching).toEqual(["ana"]);
  });
});

describe("getOrGenerateSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a stored snapshot without regenerating", async () => {
    const stored = {
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
      headline: { hours: 412 },
    };
    setResults([[{ payload: stored, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }]]);

    const payload = await getOrGenerateSnapshot("user-1", calendarYearPeriod(2026));

    expect(payload.headline.hours).toBe(412);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("regenerates a snapshot written against an older schema version", async () => {
    setResults([
      [{ payload: { schemaVersion: 0 }, schemaVersion: 0 }],
      [], // episodes
      [], // statuses
      [], // titles
    ]);

    await getOrGenerateSnapshot("user-1", calendarYearPeriod(2026));

    expect(db.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: FAIL — `getOrGenerateSnapshot is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/service.ts`:

```ts
/**
 * Compute and freeze a recap for one user and period.
 *
 * Idempotent on `(user_id, period_start, period_end)` -- regenerating replaces
 * the row. Nothing else may write to `series_finale`; a read path that
 * recomputes would defeat the entire point of snapshotting.
 */
export async function generateSnapshot(
  userId: string,
  period: Period,
): Promise<SeriesFinalePayload> {
  const rows = await loadUserRows(userId, period);

  const seasonPairs = Array.from(
    new Map(
      rows.episodes.map((row) => [
        `${row.tmdbId}:${row.seasonNumber}`,
        { tmdbId: row.tmdbId, seasonNumber: row.seasonNumber },
      ]),
    ).values(),
  );
  await ensureSeasonsCached(seasonPairs);

  const episodeRuntimeLookup = await loadEpisodeRuntimes(rows.episodes);
  const episodeMinutes = summariseEpisodeRuntimes(
    rows.episodes,
    episodeRuntimeLookup,
  );

  const completedFilmIds = rows.statuses
    .filter(
      (row) =>
        row.contentType === "movie" &&
        row.status === "completed" &&
        row.updatedAt >= period.start &&
        row.updatedAt < period.end,
    )
    .map((row) => row.tmdbId);
  const filmRuntimeLookup = await loadFilmRuntimes(completedFilmIds);
  const filmMinutes = summariseFilmRuntimes(completedFilmIds, filmRuntimeLookup);

  const crew = await loadCrew(userId, period);
  const peers = await loadPeers(userId, period);

  const user = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const collaborativeCompletedKeys = await loadCollaborativeTitleKeys(userId);

  const draft = buildPayload(
    {
      period,
      timeZone: user[0]?.timezone ?? "UTC",
      episodes: rows.episodes,
      statuses: rows.statuses,
      titles: rows.titles,
      genreNames: rows.genreNames,
      episodeMinutes,
      filmMinutes,
      episodeRuntimeLookup,
      collaborativeCompletedKeys,
      crew,
      peers,
      percentile: null,
    },
    new Date(),
  );

  const payload: SeriesFinalePayload = {
    ...draft,
    headline: {
      ...draft.headline,
      percentile: percentileOf(
        draft.headline.minutes,
        await loadCohortMinutes(period),
      ),
    },
    // The pure engine cannot know about other users, so the cross-user line on
    // the top-show card is filled here.
    topShow: draft.topShow
      ? {
          ...draft.topShow,
          alsoTopFor: crew
            .filter((member) => member.topShowTmdbId === draft.topShow?.tmdbId)
            .map((member) => member.username),
        }
      : null,
    compare: buildCompare(rows, peers, period),
  };

  await db
    .insert(seriesFinale)
    .values({
      userId,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      payload,
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
    })
    .onConflictDoUpdate({
      target: [
        seriesFinale.userId,
        seriesFinale.periodStart,
        seriesFinale.periodEnd,
      ],
      set: {
        payload,
        schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
        generatedAt: new Date(),
      },
    });

  return payload;
}

/**
 * Read a stored snapshot, generating one only if absent or written against an
 * older payload shape.
 */
export async function getOrGenerateSnapshot(
  userId: string,
  period: Period,
): Promise<SeriesFinalePayload> {
  const existing = await db
    .select({
      payload: seriesFinale.payload,
      schemaVersion: seriesFinale.schemaVersion,
    })
    .from(seriesFinale)
    .where(
      and(
        eq(seriesFinale.userId, userId),
        eq(seriesFinale.periodStart, period.start),
        eq(seriesFinale.periodEnd, period.end),
      ),
    )
    .limit(1);

  if (
    existing.length > 0 &&
    existing[0].schemaVersion === SERIES_FINALE_SCHEMA_VERSION
  ) {
    return existing[0].payload as SeriesFinalePayload;
  }

  return generateSnapshot(userId, period);
}

/** Titles the user completed that also sit on a list with a collaborator. */
export async function loadCollaborativeTitleKeys(
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
    })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .innerJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(eq(lists.ownerId, userId));

  return new Set(
    rows.map((row) => titleKey(row.tmdbId, row.contentType as "movie" | "tv")),
  );
}

/** Every generated period for a user, newest first. */
export async function listSnapshots(userId: string) {
  const rows = await db
    .select({
      periodLabel: seriesFinale.periodLabel,
      generatedAt: seriesFinale.generatedAt,
      dismissedAt: seriesFinale.dismissedAt,
      payload: seriesFinale.payload,
    })
    .from(seriesFinale)
    .where(eq(seriesFinale.userId, userId))
    .orderBy(seriesFinale.periodStart);

  return rows
    .map((row) => ({
      label: row.periodLabel,
      generatedAt: row.generatedAt,
      dismissedAt: row.dismissedAt,
      headline: (row.payload as SeriesFinalePayload).headline,
    }))
    .reverse();
}
```

Add to the imports: `buildPayload` from `./aggregate`, and
`ensureSeasonsCached`, `loadFilmRuntimes`, `summariseFilmRuntimes` from
`./runtime`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/service.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/service.ts src/lib/series-finale/service.test.ts
git commit -m "feat: generate and persist Series Finale snapshots"
```

---

### Task 7: Snapshot immutability test

**Files:**
- Create: `src/lib/series-finale/immutability.test.ts`

**Interfaces:**
- Consumes: `getOrGenerateSnapshot` from Task 6

**Why its own task:** freezing is the central premise of this feature. This test
exists to fail loudly if a future change turns the read path back into a live
query. It is worth a reviewer's gate on its own.

- [ ] **Step 1: Write the test**

Create `src/lib/series-finale/immutability.test.ts` using the same db mock shape
as `service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Reuse the mock shape from service.test.ts.
vi.mock("../db", () => {
  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift() ?? []),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  });

  const db = {
    select: vi.fn(() => chain),
    selectDistinct: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
    },
  };

  return { db };
});

vi.mock("../db/schema", () => ({
  episodeWatchStatus: {},
  userContentStatus: {},
  tmdbCache: {},
  users: {},
  lists: {},
  listItems: {},
  listCollaborators: {},
  seriesFinale: {},
  ContentType: { MOVIE: "movie", TV: "tv" },
}));

import { db } from "../db";
import { calendarYearPeriod } from "./periods";
import { getOrGenerateSnapshot } from "./service";
import { SERIES_FINALE_SCHEMA_VERSION } from "./types";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(rows);

describe("snapshot immutability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored payload even when the underlying rows have changed", async () => {
    const frozen = {
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
      headline: { hours: 412, episodes: 1208 },
    };

    // The stored row is returned first. Every later queued result represents
    // source data that has since changed -- if the read path recomputed, the
    // assertion below would see those numbers instead.
    setResults([
      [{ payload: frozen, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }],
      [{ tmdbId: 99, seasonNumber: 1, episodeNumber: 1, watchedAt: new Date() }],
      [],
      [],
    ]);

    const payload = await getOrGenerateSnapshot("user-1", calendarYearPeriod(2026));

    expect(payload.headline.hours).toBe(412);
    expect(payload.headline.episodes).toBe(1208);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/series-finale/immutability.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/series-finale/immutability.test.ts
git commit -m "test: snapshots are frozen, not recomputed on read"
```

---

### Task 8: API routes

**Files:**
- Create: `src/app/api/series-finale/route.ts`
- Create: `src/app/api/series-finale/[period]/route.ts`
- Create: `src/app/api/series-finale/[period]/dismiss/route.ts`

**Interfaces:**
- Consumes: `listSnapshots`, `getOrGenerateSnapshot` from Task 6;
  `parsePeriodLabel` from Task 2; `withAuth` / `handleApiError` from
  `src/lib/auth/api-middleware.ts`
- Produces: three authenticated routes

- [ ] **Step 1: Write the list route**

Create `src/app/api/series-finale/route.ts`:

```ts
import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { listSnapshots } from "@/lib/series-finale/service";

// GET /api/series-finale - every generated period for the current user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const periods = await listSnapshots(request.user.id);
    return NextResponse.json({ periods });
  } catch (error) {
    return handleApiError(error, "Series Finale list");
  }
});
```

- [ ] **Step 2: Write the payload route**

Create `src/app/api/series-finale/[period]/route.ts`:

```ts
import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { parsePeriodLabel } from "@/lib/series-finale/periods";
import { getOrGenerateSnapshot } from "@/lib/series-finale/service";

// GET /api/series-finale/[period] - the frozen payload, generated if absent
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const label = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    // A period that has not finished has nothing to freeze.
    if (period.end > new Date()) {
      return NextResponse.json(
        { error: "Period is not complete" },
        { status: 400 },
      );
    }

    const payload = await getOrGenerateSnapshot(request.user.id, period);
    return NextResponse.json({ payload });
  } catch (error) {
    return handleApiError(error, "Series Finale payload");
  }
});
```

Note the path is parsed from `request.url` rather than a route-params argument
because `withAuth` wraps a single-argument handler — this matches how
`src/app/api/tmdb/episodes/[id]/route.ts` already extracts its id.

- [ ] **Step 3: Write the dismiss route**

Create `src/app/api/series-finale/[period]/dismiss/route.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import { parsePeriodLabel } from "@/lib/series-finale/periods";

// POST /api/series-finale/[period]/dismiss - hide the dashboard banner
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const label = segments.at(-2) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    await db
      .update(seriesFinale)
      .set({ dismissedAt: new Date() })
      .where(
        and(
          eq(seriesFinale.userId, request.user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Series Finale dismiss");
  }
});
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint:ci`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/series-finale/
git commit -m "feat: Series Finale API routes"
```

---

### Task 9: Crew opt-out in the session update

**Files:**
- Modify: `src/app/api/auth/session/route.ts`

**Interfaces:**
- Consumes: `users.shareStatsWithCollaborators` from Task 1
- Produces: `PUT /api/auth/session` accepts `shareStatsWithCollaborators: boolean`

**Note:** there is no `/api/profile` route. Profile fields are updated by the
`PUT` handler in `src/app/api/auth/session/route.ts`, alongside `username`,
`profilePictureUrl` and `timezone`.

- [ ] **Step 1: Accept the field**

In the `PUT` handler of `src/app/api/auth/session/route.ts`, add
`shareStatsWithCollaborators` to the destructured body, then validate and apply
it alongside the existing fields:

```ts
    if (shareStatsWithCollaborators !== undefined) {
      if (typeof shareStatsWithCollaborators !== "boolean") {
        return NextResponse.json(
          { error: "shareStatsWithCollaborators must be a boolean" },
          { status: 400 },
        );
      }
      updateData.shareStatsWithCollaborators = shareStatsWithCollaborators;
    }
```

- [ ] **Step 2: Return it in the response**

Add `shareStatsWithCollaborators: updatedUser.shareStatsWithCollaborators` to
the `user` object in the `PUT` response, and to the `GET` response's user object
so the profile UI can render the current state.

- [ ] **Step 3: Write the test**

Add to the existing test file for this route, or create it, following the
patterns already used for the `timezone` field:

```ts
it("rejects a non-boolean shareStatsWithCollaborators", async () => {
  const response = await PUT(
    buildRequest({ shareStatsWithCollaborators: "yes" }),
  );

  expect(response.status).toBe(400);
});
```

Match `buildRequest` to whatever helper the existing tests for this route use.
If there is no existing test file, model it on another route's test in
`src/app/api/`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint:ci && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/session/
git commit -m "feat: crew opt-out on the session update"
```

---

## Verification

```bash
npm run lint:ci && npm run typecheck && npm test
```

Then confirm the privacy invariants by inspection:

1. Every query in `loadCollaboratorIds` filters
   `users.share_stats_with_collaborators = true`.
2. No route outside `withAuth` reads `series_finale`.
3. `generateSnapshot` is the only writer of `series_finale`.
