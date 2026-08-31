# Series Finale 2 — Pure Aggregation Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute every Series Finale statistic and the archetype classification as pure functions — plain arrays in, payload out — with no database, network, or clock access.

**Architecture:** One payload type is the contract between this engine and every consumer (story, desktop page, share image). Card-level aggregators each take the loaded rows and return one slice of the payload; a single `buildPayload` assembles them. The archetype classifier is an ordered rule list evaluated first-match-wins. Purity is the point: the rules carry precise numeric thresholds, and each needs a triggering case and a near-miss case, which is only affordable without I/O.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`

**Dependency:** Tasks 1-5 are fully independent and can run before or alongside
plan 1. Tasks 6-9 import `summariseEpisodeRuntimes` from
`src/lib/series-finale/runtime.ts`, which **plan 1 Task 3 creates** — do not
start Task 6 until that exists.

## Global Constraints

- Node.js 20.9+. TypeScript strict mode.
- **No I/O in this plan.** No `db`, no `fetch`, no `tmdbClient`, and no `new Date()` for "now" — anything time-relative is passed in. A test that needs mocking means the boundary is wrong.
- All calendar bucketing goes through `src/lib/time.ts`, never raw `Date.getDay()` / `getHours()`, which use server-local time.
- Weekday indexing is **Monday-first, 0–6**, everywhere in this engine. The DB's `show_schedules.dayOfWeek` is Sunday-first 0–6 — do not mix them.
- Tests: Vitest, `npm test`. Test files sit next to their source as `<name>.test.ts`.
- Lint zero-warnings: `npm run lint:ci`. Typecheck: `npm run typecheck`.
- Voice for any copy: plain, slightly wry, **no exclamation marks**.

## Constants (exact values, used across tasks)

```ts
export const SERIES_FINALE_SCHEMA_VERSION = 1;
export const SOLO_TICK_FLOOR = 50;
export const THIN_YEAR_EPISODES = 10;
export const THIN_YEAR_TITLES = 5;
```

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/series-finale/types.ts` (create) | Payload contract, input row types, constants |
| `src/lib/time.ts` (modify) | Add weekday and hour extraction in a timezone |
| `src/lib/series-finale/solo-ticks.ts` (create) | Batch-write detection |
| `src/lib/series-finale/aggregate.ts` (create) | Card aggregators + `buildPayload` |
| `src/lib/series-finale/archetype.ts` (create) | Ordered classifier |

---

### Task 1: Payload and input types

**Files:**
- Create: `src/lib/series-finale/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SeriesFinalePayload`, `ArchetypeId`, `AggregationInput`,
  `WatchedEpisodeRow`, `ContentStatusRow`, `TitleMeta`, `CrewMemberTotals`,
  `ComparePeer`, and the four constants above. Every later task in this plan and
  in plans 3–5 imports from here.

- [ ] **Step 1: Write the file**

Create `src/lib/series-finale/types.ts`:

```ts
/**
 * The Series Finale payload is the single contract between the aggregation
 * engine and every consumer -- the story, the desktop recap, and the share
 * image are three renderings of one object, not three query paths.
 *
 * Every optional-looking field is explicitly nullable rather than absent, so a
 * consumer can distinguish "computed, and there is nothing to say" from "this
 * payload predates the field". `schemaVersion` covers the second case.
 */

export const SERIES_FINALE_SCHEMA_VERSION = 1;

/**
 * Minimum individually-ticked episodes before any intra-day statistic is
 * reported. Below this, a handful of ticks would be presented as a habit.
 */
export const SOLO_TICK_FLOOR = 50;

/** Below both of these, the period is too thin to render as a story. */
export const THIN_YEAR_EPISODES = 10;
export const THIN_YEAR_TITLES = 5;

export type ArchetypeId =
  | "serial-abandoner"
  | "completionist"
  | "weekday-marathoner"
  | "feast-or-famine"
  | "nightly-ritualist"
  | "one-genre-only"
  | "deep-cut-hunter"
  | "group-watcher";

// ---------------------------------------------------------------------------
// Input rows -- what the service loads and hands to the engine
// ---------------------------------------------------------------------------

export interface WatchedEpisodeRow {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: Date;
}

export interface ContentStatusRow {
  tmdbId: number;
  contentType: "movie" | "tv";
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TitleMeta {
  tmdbId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genreIds: number[];
  popularity: number;
  runtime: number | null;
}

export interface CrewMemberTotals {
  userId: string;
  username: string;
  episodes: number;
  hours: number;
}

export interface ComparePeer {
  userId: string;
  username: string;
  completedKeys: string[];
  planningKeys: string[];
  droppedKeys: string[];
}

export interface AggregationInput {
  period: { start: Date; end: Date; label: string };
  timeZone: string;
  episodes: WatchedEpisodeRow[];
  statuses: ContentStatusRow[];
  titles: Map<string, TitleMeta>;
  genreNames: Map<number, string>;
  episodeMinutes: { minutes: number; unknownCount: number };
  filmMinutes: { minutes: number; unknownCount: number };
  episodeRuntimeLookup: Map<string, number | null>;
  collaborativeCompletedKeys: Set<string>;
  crew: CrewMemberTotals[];
  peers: ComparePeer[];
  percentile: number | null;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface SeriesFinalePayload {
  schemaVersion: number;
  period: { start: string; end: string; label: string };

  headline: {
    hours: number;
    minutes: number;
    episodes: number;
    titlesCompleted: number;
    titlesDropped: number;
    unknownRuntimeEpisodes: number;
    percentile: number | null;
  };

  episodes: { total: number; perDay: number };
  finished: { films: number; shows: number; total: number };

  topShow: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    episodes: number;
    minutes: number;
    finishedAt: string | null;
    alsoTopFor: string[];
  } | null;

  niche: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    popularity: number;
    medianPopularity: number;
    mostPopular: { tmdbId: number; title: string; popularity: number } | null;
    filmPopularities: number[];
  } | null;

  genres: { name: string; percent: number }[];
  months: { month: number; episodes: number }[];

  bigDay: {
    date: string;
    episodes: number;
    minutes: number;
    timeline: { at: string }[] | null;
    soloTickCount: number;
    streak: { days: number; start: string; end: string } | null;
  } | null;

  rhythm: {
    archetype: ArchetypeId | null;
    weekdayCounts: number[];
    topWeekday: number | null;
    lateShare: number | null;
  };

  shame: {
    dropped: { tmdbId: number; title: string; lastEpisode: string | null }[];
    stillPlanning: {
      tmdbId: number;
      title: string;
      days: number;
      runtime: number | null;
    }[];
  };

  crew: CrewMemberTotals[];

  compare: {
    userId: string;
    username: string;
    onlyYou: number;
    both: number;
    onlyThem: number;
    theyFinishedYouDropped: string | null;
    bothPlanningNeitherStarted: string | null;
  }[];

  thin: boolean;
}

/** Stable key for a title across both content types. */
export function titleKey(tmdbId: number, contentType: "movie" | "tv"): string {
  return `${contentType}:${tmdbId}`;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/series-finale/types.ts
git commit -m "feat: Series Finale payload contract"
```

---

### Task 2: Timezone weekday and hour helpers

**Files:**
- Modify: `src/lib/time.ts`
- Modify: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: existing `getTimezoneDateKey` in `src/lib/time.ts`
- Produces:
  - `function getTimezoneWeekday(date: Date, timeZone: string): number` — **Monday-first 0–6**
  - `function getTimezoneHour(date: Date, timeZone: string): number` — 0–23

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/time.test.ts`:

```ts
import { getTimezoneHour, getTimezoneWeekday } from "./time";

describe("getTimezoneWeekday", () => {
  it("returns 0 for Monday", () => {
    // 2026-03-16T12:00:00Z is a Monday
    expect(getTimezoneWeekday(new Date("2026-03-16T12:00:00Z"), "UTC")).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 2026-03-15T12:00:00Z is a Sunday
    expect(getTimezoneWeekday(new Date("2026-03-15T12:00:00Z"), "UTC")).toBe(6);
  });

  it("uses the caller's timezone, not the server's", () => {
    // 23:30 Sunday UTC is already Monday in Sydney
    const at = new Date("2026-03-15T23:30:00Z");
    expect(getTimezoneWeekday(at, "UTC")).toBe(6);
    expect(getTimezoneWeekday(at, "Australia/Sydney")).toBe(0);
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    expect(
      getTimezoneWeekday(new Date("2026-03-16T12:00:00Z"), "Mars/Olympus"),
    ).toBe(0);
  });
});

describe("getTimezoneHour", () => {
  it("returns the hour observed in the zone", () => {
    const at = new Date("2026-03-16T21:30:00Z");
    expect(getTimezoneHour(at, "UTC")).toBe(21);
    expect(getTimezoneHour(at, "America/New_York")).toBe(17);
  });

  it("returns 0 for midnight rather than 24", () => {
    expect(getTimezoneHour(new Date("2026-03-16T00:15:00Z"), "UTC")).toBe(0);
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(getTimezoneHour(new Date("2026-03-16T21:30:00Z"), "Mars/Olympus")).toBe(
      21,
    );
  });
});
```

If `src/lib/time.test.ts` does not exist, create it with the standard header
`import { describe, expect, it } from "vitest";`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/time.test.ts`
Expected: FAIL — `getTimezoneWeekday is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/time.ts`:

```ts
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * Weekday of `date` as observed in `timeZone`, **Monday-first 0-6**.
 *
 * Monday-first because every weekday chart in Series Finale reads M T W T F S S.
 * Note this differs from `show_schedules.dayOfWeek`, which is Sunday-first --
 * the two must never be compared without conversion.
 */
export function getTimezoneWeekday(date: Date, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
  }).format(date);

  return WEEKDAY_TO_INDEX[label] ?? 0;
}

/** Hour (0-23) of `date` as observed in `timeZone`. */
export function getTimezoneHour(date: Date, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    hour12: false,
  }).format(date);

  // en-GB with hour12:false yields "24" for midnight in some ICU versions.
  const hour = Number.parseInt(label, 10);
  return hour === 24 ? 0 : hour;
}
```

Note `resolveTimeZone` is already exported from this file — reuse it rather
than re-implementing the UTC fallback.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/time.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: timezone weekday and hour helpers"
```

---

### Task 3: Solo-tick detection

**Files:**
- Create: `src/lib/series-finale/solo-ticks.ts`
- Create: `src/lib/series-finale/solo-ticks.test.ts`

**Interfaces:**
- Consumes: `WatchedEpisodeRow` from Task 1
- Produces: `function partitionSoloTicks(episodes: WatchedEpisodeRow[]): { solo: WatchedEpisodeRow[]; batched: WatchedEpisodeRow[] }`

**Why in memory rather than SQL:** the spec sketches this as a correlated
`NOT EXISTS`. The engine already loads every watched episode for the period (for
counts, months and weekdays), so grouping them in memory is strictly cheaper
than a second correlated query and is unit-testable without a database.

**The rule:** a row is a solo tick when no other row for the same user shares its
exact `watchedAt`. A batch write is one `INSERT` carrying one `new Date()`, so
every member of a batch collides on the millisecond. A one-episode batch is
indistinguishable from a solo tick — correctly, because it is one.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/solo-ticks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { partitionSoloTicks } from "./solo-ticks";
import type { WatchedEpisodeRow } from "./types";

const row = (episodeNumber: number, iso: string): WatchedEpisodeRow => ({
  tmdbId: 1,
  seasonNumber: 1,
  episodeNumber,
  watchedAt: new Date(iso),
});

describe("partitionSoloTicks", () => {
  it("treats a lone row as a solo tick", () => {
    const result = partitionSoloTicks([row(1, "2026-03-14T20:00:00.000Z")]);

    expect(result.solo).toHaveLength(1);
    expect(result.batched).toHaveLength(0);
  });

  it("treats rows sharing an exact timestamp as a batch", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.000Z"),
      row(3, "2026-03-14T20:00:00.000Z"),
    ]);

    expect(result.solo).toHaveLength(0);
    expect(result.batched).toHaveLength(3);
  });

  it("separates a batch from genuine solo ticks in the same set", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.000Z"),
      row(3, "2026-03-15T21:30:00.000Z"),
    ]);

    expect(result.solo.map((r) => r.episodeNumber)).toEqual([3]);
    expect(result.batched.map((r) => r.episodeNumber)).toEqual([1, 2]);
  });

  it("does not merge timestamps that differ by a millisecond", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.001Z"),
    ]);

    expect(result.solo).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(partitionSoloTicks([])).toEqual({ solo: [], batched: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/solo-ticks.test.ts`
Expected: FAIL — cannot resolve `./solo-ticks`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/solo-ticks.ts`:

```ts
import type { WatchedEpisodeRow } from "./types";

/**
 * Split episodes into those ticked individually and those written as part of a
 * batch.
 *
 * Batch episode writes in `src/lib/episodes/episodeUtils.ts` compute a single
 * `new Date()` and apply it to every episode in the batch, so marking a season
 * watched produces N rows sharing one timestamp to the millisecond. Intra-day
 * statistics computed over those rows would show ten episodes at one instant
 * and read as a viewing habit that never happened.
 *
 * Only intra-day cuts use this. Episode totals, monthly buckets, weekday
 * distribution and streaks are all correct over batched rows and must use the
 * full set.
 */
export function partitionSoloTicks(episodes: WatchedEpisodeRow[]): {
  solo: WatchedEpisodeRow[];
  batched: WatchedEpisodeRow[];
} {
  const countByInstant = new Map<number, number>();
  for (const episode of episodes) {
    const instant = episode.watchedAt.getTime();
    countByInstant.set(instant, (countByInstant.get(instant) ?? 0) + 1);
  }

  const solo: WatchedEpisodeRow[] = [];
  const batched: WatchedEpisodeRow[] = [];

  for (const episode of episodes) {
    if (countByInstant.get(episode.watchedAt.getTime()) === 1) {
      solo.push(episode);
    } else {
      batched.push(episode);
    }
  }

  return { solo, batched };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/solo-ticks.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/solo-ticks.ts src/lib/series-finale/solo-ticks.test.ts
git commit -m "feat: solo-tick detection for intra-day statistics"
```

---

### Task 4: Archetype classifier

**Files:**
- Create: `src/lib/series-finale/archetype.ts`
- Create: `src/lib/series-finale/archetype.test.ts`

**Interfaces:**
- Consumes: `ArchetypeId`, `SOLO_TICK_FLOOR`, `THIN_YEAR_EPISODES`,
  `THIN_YEAR_TITLES` from Task 1
- Produces:
  - `interface ArchetypeInput` (exact shape below)
  - `function classifyArchetype(input: ArchetypeInput): ArchetypeId | null`
  - `function coefficientOfVariation(values: number[]): number`
  - `function maxWindowShare(hours: number[], windowSize: number): number`

**The rules, in evaluation order. First match wins; evaluation stops there.**

| # | Id | Condition |
| --- | --- | --- |
| 1 | `serial-abandoner` | `dropped / (dropped + completed) >= 0.35` and `dropped >= 5` |
| 2 | `completionist` | `completed / (completed + dropped + paused) >= 0.9` and `completed + dropped + paused >= 15` |
| 3 | `weekday-marathoner` | some weekday holds `>= 22%` of episodes **and** median episodes-per-active-day on that weekday `>= 4` |
| 4 | `feast-or-famine` | coefficient of variation of the 12 monthly counts `>= 0.75` |
| 5 | `nightly-ritualist` | `>= 60%` of solo ticks fall in one 3-hour window **and** solo ticks span `>= 5` distinct weekdays. **Skipped entirely when `soloTickCount < SOLO_TICK_FLOOR`.** |
| 6 | `one-genre-only` | top genre `>= 40%` of watched titles |
| 7 | `deep-cut-hunter` | median popularity of completed titles `<= 25` |
| 8 | `group-watcher` | `>= 50%` of completed titles also sit on a list with at least one collaborator |

Fallback: `totalEpisodes < THIN_YEAR_EPISODES` **and** `totalTitles < THIN_YEAR_TITLES` yields `null`, checked **before** any rule.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/archetype.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  classifyArchetype,
  coefficientOfVariation,
  maxWindowShare,
  type ArchetypeInput,
} from "./archetype";

/** A deliberately unremarkable year that matches no rule. */
const base = (): ArchetypeInput => ({
  completedTitles: 20,
  droppedShows: 1,
  pausedTitles: 3,
  weekdayCounts: [30, 30, 30, 30, 30, 30, 30],
  medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 1],
  monthlyEpisodeCounts: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  soloTickHours: [],
  soloTickWeekdays: [],
  soloTickCount: 0,
  topGenreShare: 0.2,
  medianPopularity: 90,
  collaborativeCompletedShare: 0.1,
  totalEpisodes: 210,
  totalTitles: 24,
});

describe("coefficientOfVariation", () => {
  it("is zero for identical values", () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
  });

  it("is zero when the mean is zero, rather than NaN", () => {
    expect(coefficientOfVariation([0, 0, 0])).toBe(0);
  });

  it("rises with spread", () => {
    expect(coefficientOfVariation([0, 0, 120])).toBeGreaterThan(1);
  });
});

describe("maxWindowShare", () => {
  it("finds a window holding every hour", () => {
    expect(maxWindowShare([21, 22, 23], 3)).toBe(1);
  });

  it("wraps across midnight", () => {
    expect(maxWindowShare([23, 0, 1], 3)).toBe(1);
  });

  it("returns 0 for no hours", () => {
    expect(maxWindowShare([], 3)).toBe(0);
  });
});

describe("classifyArchetype", () => {
  it("returns null for a year too thin to characterise", () => {
    expect(
      classifyArchetype({
        ...base(),
        totalEpisodes: 9,
        totalTitles: 4,
      }),
    ).toBeNull();
  });

  it("does not return null when only one thin threshold is met", () => {
    expect(
      classifyArchetype({ ...base(), totalEpisodes: 9, totalTitles: 24 }),
    ).not.toBeNull();
  });

  it("matches serial-abandoner at the threshold", () => {
    expect(
      classifyArchetype({ ...base(), droppedShows: 7, completedTitles: 13 }),
    ).toBe("serial-abandoner");
  });

  it("misses serial-abandoner below the minimum dropped count", () => {
    // ratio is 0.44, but only 4 dropped shows
    expect(
      classifyArchetype({ ...base(), droppedShows: 4, completedTitles: 5 }),
    ).not.toBe("serial-abandoner");
  });

  it("matches completionist", () => {
    expect(
      classifyArchetype({
        ...base(),
        completedTitles: 19,
        droppedShows: 1,
        pausedTitles: 0,
      }),
    ).toBe("completionist");
  });

  it("misses completionist below the 15-title minimum", () => {
    expect(
      classifyArchetype({
        ...base(),
        completedTitles: 10,
        droppedShows: 0,
        pausedTitles: 0,
      }),
    ).not.toBe("completionist");
  });

  it("matches weekday-marathoner", () => {
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 5],
      }),
    ).toBe("weekday-marathoner");
  });

  it("misses weekday-marathoner when the weekday is concentrated but shallow", () => {
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 3],
      }),
    ).not.toBe("weekday-marathoner");
  });

  it("matches feast-or-famine", () => {
    expect(
      classifyArchetype({
        ...base(),
        monthlyEpisodeCounts: [174, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36],
      }),
    ).toBe("feast-or-famine");
  });

  it("matches nightly-ritualist when solo ticks clear the floor", () => {
    const hours = Array.from({ length: 60 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4, 5, 6],
        soloTickCount: hours.length,
      }),
    ).toBe("nightly-ritualist");
  });

  it("skips nightly-ritualist below the solo-tick floor, even when the pattern is perfect", () => {
    const hours = Array.from({ length: 10 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4],
        soloTickCount: hours.length,
      }),
    ).not.toBe("nightly-ritualist");
  });

  it("skips nightly-ritualist when solo ticks span too few weekdays", () => {
    const hours = Array.from({ length: 60 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2],
        soloTickCount: hours.length,
      }),
    ).not.toBe("nightly-ritualist");
  });

  it("matches one-genre-only", () => {
    expect(classifyArchetype({ ...base(), topGenreShare: 0.4 })).toBe(
      "one-genre-only",
    );
  });

  it("matches deep-cut-hunter", () => {
    expect(classifyArchetype({ ...base(), medianPopularity: 25 })).toBe(
      "deep-cut-hunter",
    );
  });

  it("does not match deep-cut-hunter when there is no popularity data", () => {
    expect(
      classifyArchetype({ ...base(), medianPopularity: null }),
    ).not.toBe("deep-cut-hunter");
  });

  it("matches group-watcher", () => {
    expect(
      classifyArchetype({ ...base(), collaborativeCompletedShare: 0.5 }),
    ).toBe("group-watcher");
  });

  it("returns null when nothing matches", () => {
    expect(classifyArchetype(base())).toBeNull();
  });

  it("resolves an input matching two rules to the earlier one", () => {
    // serial-abandoner (rule 1) and one-genre-only (rule 6) both hold
    expect(
      classifyArchetype({
        ...base(),
        droppedShows: 7,
        completedTitles: 13,
        topGenreShare: 0.9,
      }),
    ).toBe("serial-abandoner");
  });

  it("lets a later rule win when the skipped rule 5 would have matched", () => {
    // Perfect nightly pattern but below the floor, so rule 6 is reached
    const hours = Array.from({ length: 10 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4],
        soloTickCount: hours.length,
        topGenreShare: 0.5,
      }),
    ).toBe("one-genre-only");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/archetype.test.ts`
Expected: FAIL — cannot resolve `./archetype`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/archetype.ts`:

```ts
import {
  SOLO_TICK_FLOOR,
  THIN_YEAR_EPISODES,
  THIN_YEAR_TITLES,
  type ArchetypeId,
} from "./types";

export interface ArchetypeInput {
  completedTitles: number;
  droppedShows: number;
  pausedTitles: number;
  /** Episode counts per weekday, Monday-first, 7 entries. */
  weekdayCounts: number[];
  /** Median episodes on the days that weekday was active, Monday-first. */
  medianEpisodesPerActiveDayByWeekday: number[];
  /** Episode counts per calendar month, 12 entries. */
  monthlyEpisodeCounts: number[];
  soloTickHours: number[];
  soloTickWeekdays: number[];
  soloTickCount: number;
  topGenreShare: number;
  medianPopularity: number | null;
  collaborativeCompletedShare: number;
  totalEpisodes: number;
  totalTitles: number;
}

/**
 * Standard deviation over the mean. Zero when the mean is zero, because a year
 * with no episodes is not "highly variable" -- it is empty, and NaN would
 * propagate into the comparison and silently read as false anyway.
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;

  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

/**
 * Largest share of `hours` falling inside any window of `windowSize` hours.
 * Windows wrap across midnight, because a 22:00-01:00 habit is exactly the
 * pattern this is looking for.
 */
export function maxWindowShare(hours: number[], windowSize: number): number {
  if (hours.length === 0) return 0;

  const counts = new Array(24).fill(0) as number[];
  for (const hour of hours) counts[hour] += 1;

  let best = 0;
  for (let start = 0; start < 24; start += 1) {
    let inWindow = 0;
    for (let offset = 0; offset < windowSize; offset += 1) {
      inWindow += counts[(start + offset) % 24];
    }
    best = Math.max(best, inWindow);
  }

  return best / hours.length;
}

/**
 * Assign exactly one archetype.
 *
 * Rules are evaluated in order and the first match wins, so an input satisfying
 * several resolves deterministically rather than depending on iteration order.
 * Rule 5 is skipped when there are too few individually-ticked episodes to say
 * anything about time of day -- batch writes share one timestamp, so a bulk
 * marker would otherwise satisfy the window test trivially.
 */
export function classifyArchetype(input: ArchetypeInput): ArchetypeId | null {
  if (
    input.totalEpisodes < THIN_YEAR_EPISODES &&
    input.totalTitles < THIN_YEAR_TITLES
  ) {
    return null;
  }

  // 1 - Serial Abandoner
  const abandonDenominator = input.droppedShows + input.completedTitles;
  if (
    input.droppedShows >= 5 &&
    abandonDenominator > 0 &&
    input.droppedShows / abandonDenominator >= 0.35
  ) {
    return "serial-abandoner";
  }

  // 2 - Completionist
  const completionDenominator =
    input.completedTitles + input.droppedShows + input.pausedTitles;
  if (
    completionDenominator >= 15 &&
    input.completedTitles / completionDenominator >= 0.9
  ) {
    return "completionist";
  }

  // 3 - Weekday Marathoner
  const totalWeekdayEpisodes = input.weekdayCounts.reduce((a, b) => a + b, 0);
  if (totalWeekdayEpisodes > 0) {
    for (let weekday = 0; weekday < input.weekdayCounts.length; weekday += 1) {
      const share = input.weekdayCounts[weekday] / totalWeekdayEpisodes;
      const median = input.medianEpisodesPerActiveDayByWeekday[weekday] ?? 0;
      if (share >= 0.22 && median >= 4) {
        return "weekday-marathoner";
      }
    }
  }

  // 4 - Feast or Famine
  if (coefficientOfVariation(input.monthlyEpisodeCounts) >= 0.75) {
    return "feast-or-famine";
  }

  // 5 - Nightly Ritualist (skipped below the solo-tick floor)
  if (input.soloTickCount >= SOLO_TICK_FLOOR) {
    const distinctWeekdays = new Set(input.soloTickWeekdays).size;
    if (
      distinctWeekdays >= 5 &&
      maxWindowShare(input.soloTickHours, 3) >= 0.6
    ) {
      return "nightly-ritualist";
    }
  }

  // 6 - One Genre Only
  if (input.topGenreShare >= 0.4) {
    return "one-genre-only";
  }

  // 7 - Deep Cut Hunter
  if (input.medianPopularity !== null && input.medianPopularity <= 25) {
    return "deep-cut-hunter";
  }

  // 8 - Group Watcher
  if (input.collaborativeCompletedShare >= 0.5) {
    return "group-watcher";
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/archetype.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/archetype.ts src/lib/series-finale/archetype.test.ts
git commit -m "feat: Series Finale archetype classifier"
```

---

### Task 5: Counting aggregators — headline, episodes, finished, months

**Files:**
- Create: `src/lib/series-finale/aggregate.ts`
- Create: `src/lib/series-finale/aggregate.test.ts`

**Interfaces:**
- Consumes: types from Task 1, `getTimezoneDateKey` / `getTimezoneWeekday` from Task 2
- Produces:
  - `function buildMonths(episodes: WatchedEpisodeRow[], statuses: ContentStatusRow[], timeZone: string, periodStartYear: number): { month: number; episodes: number }[]`
  - `function countFinished(statuses: ContentStatusRow[], period: { start: Date; end: Date }): { films: number; shows: number; total: number }`
  - `function countDropped(statuses: ContentStatusRow[], period: { start: Date; end: Date }): number`
  - `function episodesPerDay(total: number, period: { start: Date; end: Date }): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildMonths,
  countDropped,
  countFinished,
  episodesPerDay,
} from "./aggregate";
import type { ContentStatusRow, WatchedEpisodeRow } from "./types";

const PERIOD = {
  start: new Date("2026-01-01T00:00:00Z"),
  end: new Date("2027-01-01T00:00:00Z"),
};

const episode = (iso: string, episodeNumber = 1): WatchedEpisodeRow => ({
  tmdbId: 1,
  seasonNumber: 1,
  episodeNumber,
  watchedAt: new Date(iso),
});

const status = (
  overrides: Partial<ContentStatusRow> & { tmdbId: number },
): ContentStatusRow => ({
  contentType: "tv",
  status: "completed",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2026-04-04T00:00:00Z"),
  ...overrides,
});

describe("countFinished", () => {
  it("splits completed titles by content type", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, contentType: "movie" }),
        status({ tmdbId: 2, contentType: "movie" }),
        status({ tmdbId: 3, contentType: "tv" }),
      ],
      PERIOD,
    );

    expect(result).toEqual({ films: 2, shows: 1, total: 3 });
  });

  it("ignores titles completed outside the period", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, updatedAt: new Date("2025-06-01T00:00:00Z") }),
        status({ tmdbId: 2, updatedAt: new Date("2026-06-01T00:00:00Z") }),
      ],
      PERIOD,
    );

    expect(result.total).toBe(1);
  });

  it("ignores non-completed statuses", () => {
    const result = countFinished(
      [status({ tmdbId: 1, status: "watching" })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });

  it("treats period end as exclusive", () => {
    const result = countFinished(
      [status({ tmdbId: 1, updatedAt: new Date("2027-01-01T00:00:00Z") })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });
});

describe("countDropped", () => {
  it("counts only dropped titles inside the period", () => {
    expect(
      countDropped(
        [
          status({ tmdbId: 1, status: "dropped" }),
          status({ tmdbId: 2, status: "dropped", updatedAt: new Date("2025-01-01T00:00:00Z") }),
          status({ tmdbId: 3, status: "completed" }),
        ],
        PERIOD,
      ),
    ).toBe(1);
  });
});

describe("buildMonths", () => {
  it("returns twelve zero-filled buckets", () => {
    const result = buildMonths([], [], "UTC", 2026);

    expect(result).toHaveLength(12);
    expect(result.every((m) => m.episodes === 0)).toBe(true);
    expect(result.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("buckets episodes by the month observed in the user's timezone", () => {
    // 2026-04-01T00:30Z is still March in New York
    const result = buildMonths(
      [episode("2026-04-01T00:30:00Z")],
      [],
      "America/New_York",
      2026,
    );

    expect(result[2].episodes).toBe(1);
    expect(result[3].episodes).toBe(0);
  });

  it("includes completed films dated by updatedAt", () => {
    const result = buildMonths(
      [],
      [status({ tmdbId: 1, contentType: "movie", updatedAt: new Date("2026-03-14T12:00:00Z") })],
      "UTC",
      2026,
    );

    expect(result[2].episodes).toBe(1);
  });

  it("ignores rows from another year", () => {
    const result = buildMonths([episode("2025-03-14T12:00:00Z")], [], "UTC", 2026);

    expect(result.every((m) => m.episodes === 0)).toBe(true);
  });
});

describe("episodesPerDay", () => {
  it("divides by the number of days in the period", () => {
    expect(episodesPerDay(365, PERIOD)).toBeCloseTo(1, 5);
  });

  it("returns 0 for a zero-length period rather than Infinity", () => {
    expect(
      episodesPerDay(10, { start: PERIOD.start, end: PERIOD.start }),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: FAIL — cannot resolve `./aggregate`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/aggregate.ts`:

```ts
import { getTimezoneDateKey } from "../time";
import type { ContentStatusRow, WatchedEpisodeRow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isWithin(at: Date, period: { start: Date; end: Date }): boolean {
  return at >= period.start && at < period.end;
}

/**
 * Completed titles in the period, split by content type.
 *
 * Films carry no per-watch timestamp, so completion is dated by
 * `user_content_status.updated_at`. That column is only written when a writer
 * sets it explicitly -- the `nextEpisodeDate`-only update path does not touch
 * it -- so it survives as a completion date. A user who re-marks a title does
 * move it into the later period; that is accepted and documented in the spec.
 */
export function countFinished(
  statuses: ContentStatusRow[],
  period: { start: Date; end: Date },
): { films: number; shows: number; total: number } {
  let films = 0;
  let shows = 0;

  for (const row of statuses) {
    if (row.status !== "completed") continue;
    if (!isWithin(row.updatedAt, period)) continue;

    if (row.contentType === "movie") films += 1;
    else shows += 1;
  }

  return { films, shows, total: films + shows };
}

/** Dropped titles in the period. Only shows can be dropped. */
export function countDropped(
  statuses: ContentStatusRow[],
  period: { start: Date; end: Date },
): number {
  return statuses.filter(
    (row) => row.status === "dropped" && isWithin(row.updatedAt, period),
  ).length;
}

/**
 * Twelve zero-filled monthly buckets combining episodes (dated by `watchedAt`)
 * and completed films (dated by `updatedAt`), both bucketed in the user's
 * timezone so the months match the calendar they experienced.
 */
export function buildMonths(
  episodes: WatchedEpisodeRow[],
  statuses: ContentStatusRow[],
  timeZone: string,
  periodStartYear: number,
): { month: number; episodes: number }[] {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    episodes: 0,
  }));

  const add = (at: Date) => {
    const key = getTimezoneDateKey(at, timeZone);
    const [year, month] = key.split("-");
    if (Number.parseInt(year, 10) !== periodStartYear) return;
    buckets[Number.parseInt(month, 10) - 1].episodes += 1;
  };

  for (const row of episodes) add(row.watchedAt);
  for (const row of statuses) {
    if (row.status === "completed" && row.contentType === "movie") {
      add(row.updatedAt);
    }
  }

  return buckets;
}

/** Mean episodes per calendar day across the period. */
export function episodesPerDay(
  total: number,
  period: { start: Date; end: Date },
): number {
  const days = (period.end.getTime() - period.start.getTime()) / MS_PER_DAY;
  if (days <= 0) return 0;
  return total / days;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/aggregate.ts src/lib/series-finale/aggregate.test.ts
git commit -m "feat: counting aggregators for Series Finale"
```

---

### Task 6: Title aggregators — top show, niche, genres

**Files:**
- Modify: `src/lib/series-finale/aggregate.ts`
- Modify: `src/lib/series-finale/aggregate.test.ts`

**Interfaces:**
- Consumes: `TitleMeta`, `WatchedEpisodeRow`, `ContentStatusRow`, `titleKey`,
  `SeriesFinalePayload` from Task 1; `summariseEpisodeRuntimes` and
  `episodeKeyOf` from plan 1 Task 3
- Produces:
  - `function buildTopShow(episodes, titles, episodeRuntimeLookup, timeZone): SeriesFinalePayload["topShow"]`
  - `function buildNiche(statuses, titles, period): SeriesFinalePayload["niche"]`
  - `function buildGenres(statuses, titles, genreNames, period): { name: string; percent: number }[]`
  - `function median(values: number[]): number | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/aggregate.test.ts`:

```ts
import { buildGenres, buildNiche, buildTopShow, median } from "./aggregate";
import type { TitleMeta } from "./types";

const title = (overrides: Partial<TitleMeta> & { tmdbId: number }): TitleMeta => ({
  contentType: "tv",
  title: `Title ${overrides.tmdbId}`,
  posterPath: null,
  genreIds: [],
  popularity: 50,
  runtime: null,
  ...overrides,
});

const titleMap = (metas: TitleMeta[]) =>
  new Map(metas.map((m) => [`${m.contentType}:${m.tmdbId}`, m]));

describe("median", () => {
  it("returns the middle value for an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for no values", () => {
    expect(median([])).toBeNull();
  });
});

describe("buildTopShow", () => {
  it("picks the show with the most watched episodes", () => {
    const result = buildTopShow(
      [
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, watchedAt: new Date("2026-01-01T00:00:00Z") },
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, watchedAt: new Date("2026-01-02T00:00:00Z") },
        { tmdbId: 2, seasonNumber: 1, episodeNumber: 1, watchedAt: new Date("2026-01-03T00:00:00Z") },
      ],
      titleMap([title({ tmdbId: 1 }), title({ tmdbId: 2 })]),
      new Map([["1:1:1", 42], ["1:1:2", 45]]),
      "UTC",
    );

    expect(result?.tmdbId).toBe(1);
    expect(result?.episodes).toBe(2);
    expect(result?.minutes).toBe(87);
  });

  it("dates the finish from the latest watchedAt, not a status column", () => {
    const result = buildTopShow(
      [
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, watchedAt: new Date("2026-01-01T00:00:00Z") },
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, watchedAt: new Date("2026-04-04T00:00:00Z") },
      ],
      titleMap([title({ tmdbId: 1 })]),
      new Map(),
      "UTC",
    );

    expect(result?.finishedAt).toBe("2026-04-04");
  });

  it("returns null when there are no episodes", () => {
    expect(buildTopShow([], new Map(), new Map(), "UTC")).toBeNull();
  });

  it("returns null when the top show has no cached metadata", () => {
    const result = buildTopShow(
      [{ tmdbId: 99, seasonNumber: 1, episodeNumber: 1, watchedAt: new Date("2026-01-01T00:00:00Z") }],
      new Map(),
      new Map(),
      "UTC",
    );

    expect(result).toBeNull();
  });
});

describe("buildNiche", () => {
  it("picks the least popular completed film and reports the median of the rest", () => {
    const statuses = [
      status({ tmdbId: 1, contentType: "movie" }),
      status({ tmdbId: 2, contentType: "movie" }),
      status({ tmdbId: 3, contentType: "movie" }),
    ];
    const titles = titleMap([
      title({ tmdbId: 1, contentType: "movie", popularity: 2.1 }),
      title({ tmdbId: 2, contentType: "movie", popularity: 68 }),
      title({ tmdbId: 3, contentType: "movie", popularity: 412 }),
    ]);

    const result = buildNiche(statuses, titles, PERIOD);

    expect(result?.tmdbId).toBe(1);
    expect(result?.popularity).toBe(2.1);
    expect(result?.medianPopularity).toBe(240);
    expect(result?.mostPopular?.tmdbId).toBe(3);
  });

  it("returns null when no films were completed", () => {
    expect(buildNiche([], new Map(), PERIOD)).toBeNull();
  });
});

describe("buildGenres", () => {
  it("returns the top five plus a remainder bucket", () => {
    const statuses = Array.from({ length: 6 }, (_, i) =>
      status({ tmdbId: i + 1 }),
    );
    const titles = titleMap(
      Array.from({ length: 6 }, (_, i) =>
        title({ tmdbId: i + 1, genreIds: [i + 1] }),
      ),
    );
    const names = new Map([
      [1, "Sci-Fi & Fantasy"],
      [2, "Drama"],
      [3, "Comedy"],
      [4, "Thriller"],
      [5, "Documentary"],
      [6, "Western"],
    ]);

    const result = buildGenres(statuses, titles, names, PERIOD);

    expect(result).toHaveLength(6);
    expect(result[5].name).toBe("Everything else");
  });

  it("omits the remainder bucket when there are five or fewer genres", () => {
    const statuses = [status({ tmdbId: 1 })];
    const titles = titleMap([title({ tmdbId: 1, genreIds: [1] })]);

    const result = buildGenres(statuses, titles, new Map([[1, "Drama"]]), PERIOD);

    expect(result).toEqual([{ name: "Drama", percent: 100 }]);
  });

  it("returns an empty list when nothing was completed", () => {
    expect(buildGenres([], new Map(), new Map(), PERIOD)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: FAIL — `buildTopShow is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/aggregate.ts`. Add these imports at the top:

```ts
import { summariseEpisodeRuntimes } from "./runtime";
import { titleKey, type SeriesFinalePayload, type TitleMeta } from "./types";
```

`summariseEpisodeRuntimes` accepts `EpisodeKey[]`, and `WatchedEpisodeRow`
carries every member of `EpisodeKey`, so the rows pass through directly with no
mapping.

Then append:

```ts
/** Median of `values`, or null when there are none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * The show with the most episodes watched in the period.
 *
 * `finishedAt` comes from the latest `watchedAt` rather than a status column,
 * because that is a real event with a real timestamp -- unlike film completion,
 * which has to be inferred.
 */
export function buildTopShow(
  episodes: WatchedEpisodeRow[],
  titles: Map<string, TitleMeta>,
  episodeRuntimeLookup: Map<string, number | null>,
  timeZone: string,
): SeriesFinalePayload["topShow"] {
  if (episodes.length === 0) return null;

  const byShow = new Map<number, WatchedEpisodeRow[]>();
  for (const row of episodes) {
    const existing = byShow.get(row.tmdbId);
    if (existing) existing.push(row);
    else byShow.set(row.tmdbId, [row]);
  }

  let topId: number | null = null;
  let topRows: WatchedEpisodeRow[] = [];
  for (const [tmdbId, rows] of byShow) {
    if (rows.length > topRows.length) {
      topId = tmdbId;
      topRows = rows;
    }
  }

  if (topId === null) return null;

  const meta = titles.get(titleKey(topId, "tv"));
  if (!meta) return null;

  const { minutes } = summariseEpisodeRuntimes(topRows, episodeRuntimeLookup);
  const latest = topRows.reduce((newest, row) =>
    row.watchedAt > newest.watchedAt ? row : newest,
  );

  return {
    tmdbId: topId,
    title: meta.title,
    posterPath: meta.posterPath,
    episodes: topRows.length,
    minutes,
    finishedAt: getTimezoneDateKey(latest.watchedAt, timeZone),
    alsoTopFor: [],
  };
}

/**
 * The least popular film completed in the period, against the median of the
 * others.
 *
 * Popularity is the currently-cached TMDB value, not the value at watch time --
 * TMDB popularity drifts, so this reflects today's obscurity. Accepted and
 * documented in the spec.
 */
export function buildNiche(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  period: { start: Date; end: Date },
): SeriesFinalePayload["niche"] {
  const films = statuses
    .filter(
      (row) =>
        row.contentType === "movie" &&
        row.status === "completed" &&
        isWithin(row.updatedAt, period),
    )
    .map((row) => titles.get(titleKey(row.tmdbId, "movie")))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  if (films.length === 0) return null;

  const least = films.reduce((lowest, meta) =>
    meta.popularity < lowest.popularity ? meta : lowest,
  );
  const most = films.reduce((highest, meta) =>
    meta.popularity > highest.popularity ? meta : highest,
  );

  const others = films
    .filter((meta) => meta.tmdbId !== least.tmdbId)
    .map((meta) => meta.popularity);

  return {
    tmdbId: least.tmdbId,
    title: least.title,
    posterPath: least.posterPath,
    popularity: least.popularity,
    medianPopularity: median(others) ?? least.popularity,
    mostPopular:
      most.tmdbId === least.tmdbId
        ? null
        : { tmdbId: most.tmdbId, title: most.title, popularity: most.popularity },
    filmPopularities: films.map((meta) => meta.popularity),
  };
}

/** Share of completed titles per genre: top five, remainder folded together. */
export function buildGenres(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  genreNames: Map<number, string>,
  period: { start: Date; end: Date },
): { name: string; percent: number }[] {
  const completed = statuses
    .filter((row) => row.status === "completed" && isWithin(row.updatedAt, period))
    .map((row) => titles.get(titleKey(row.tmdbId, row.contentType)))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  if (completed.length === 0) return [];

  const counts = new Map<number, number>();
  for (const meta of completed) {
    for (const genreId of meta.genreIds) {
      counts.set(genreId, (counts.get(genreId) ?? 0) + 1);
    }
  }

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);

  const result = top.map(([genreId, count]) => ({
    name: genreNames.get(genreId) ?? "Unknown",
    percent: Math.round((count / total) * 100),
  }));

  if (rest.length > 0) {
    const restCount = rest.reduce((sum, [, count]) => sum + count, 0);
    result.push({
      name: "Everything else",
      percent: Math.round((restCount / total) * 100),
    });
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/aggregate.ts src/lib/series-finale/aggregate.test.ts
git commit -m "feat: title aggregators for Series Finale"
```

---

### Task 7: Day aggregators — big day, streak, rhythm

**Files:**
- Modify: `src/lib/series-finale/aggregate.ts`
- Modify: `src/lib/series-finale/aggregate.test.ts`

**Interfaces:**
- Consumes: `partitionSoloTicks` from Task 3, `getTimezoneWeekday` /
  `getTimezoneHour` from Task 2, `SOLO_TICK_FLOOR` from Task 1
- Produces:
  - `function buildBigDay(episodes, timeZone, episodeRuntimeLookup): SeriesFinalePayload["bigDay"]`
  - `function longestStreak(dateKeys: string[]): { days: number; start: string; end: string } | null`
  - `function buildRhythm(episodes, timeZone): { weekdayCounts: number[]; topWeekday: number | null; lateShare: number | null }`
  - `function medianEpisodesPerActiveDayByWeekday(episodes, timeZone): number[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/aggregate.test.ts`:

```ts
import {
  buildBigDay,
  buildRhythm,
  longestStreak,
  medianEpisodesPerActiveDayByWeekday,
} from "./aggregate";

/** N episodes sharing one instant — i.e. a batch write. */
const batch = (iso: string, count: number): WatchedEpisodeRow[] =>
  Array.from({ length: count }, (_, i) => episode(iso, i + 1));

/** N episodes at distinct instants on the same day — i.e. solo ticks. */
const soloDay = (day: string, hours: number[]): WatchedEpisodeRow[] =>
  hours.map((hour, i) =>
    episode(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`, i + 1),
  );

describe("longestStreak", () => {
  it("finds the longest run of consecutive days", () => {
    expect(
      longestStreak(["2026-01-02", "2026-01-03", "2026-01-04", "2026-02-01"]),
    ).toEqual({ days: 3, start: "2026-01-02", end: "2026-01-04" });
  });

  it("handles a single day", () => {
    expect(longestStreak(["2026-01-02"])).toEqual({
      days: 1,
      start: "2026-01-02",
      end: "2026-01-02",
    });
  });

  it("deduplicates repeated days", () => {
    expect(longestStreak(["2026-01-02", "2026-01-02"])?.days).toBe(1);
  });

  it("returns null for no days", () => {
    expect(longestStreak([])).toBeNull();
  });
});

describe("buildBigDay", () => {
  it("picks the day with the most episodes and counts all of them", () => {
    const result = buildBigDay(
      [...batch("2026-03-14T12:00:00.000Z", 11), ...soloDay("2026-03-15", [20])],
      "UTC",
      new Map(),
    );

    expect(result?.date).toBe("2026-03-14");
    expect(result?.episodes).toBe(11);
  });

  it("returns a null timeline when solo ticks are below the floor", () => {
    const result = buildBigDay(batch("2026-03-14T12:00:00.000Z", 11), "UTC", new Map());

    expect(result?.timeline).toBeNull();
    expect(result?.soloTickCount).toBe(0);
  });

  it("returns a timeline once solo ticks clear the floor", () => {
    // 60 solo ticks across 60 distinct hours, all on distinct days
    const solo = Array.from({ length: 60 }, (_, i) =>
      episode(
        `2026-0${Math.floor(i / 28) + 1}-${String((i % 28) + 1).padStart(2, "0")}T21:00:00.000Z`,
        i + 1,
      ),
    );

    const result = buildBigDay(solo, "UTC", new Map());

    expect(result?.timeline).not.toBeNull();
  });

  it("returns null for no episodes", () => {
    expect(buildBigDay([], "UTC", new Map())).toBeNull();
  });
});

describe("buildRhythm", () => {
  it("counts weekdays Monday-first over every episode, batched included", () => {
    // 2026-03-16 is a Monday
    const result = buildRhythm(batch("2026-03-16T12:00:00.000Z", 3), "UTC");

    expect(result.weekdayCounts[0]).toBe(3);
    expect(result.topWeekday).toBe(0);
  });

  it("returns a null lateShare below the solo-tick floor", () => {
    expect(buildRhythm(batch("2026-03-16T22:00:00.000Z", 3), "UTC").lateShare).toBeNull();
  });

  it("returns zero counts for no episodes", () => {
    const result = buildRhythm([], "UTC");

    expect(result.weekdayCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.topWeekday).toBeNull();
  });
});

describe("medianEpisodesPerActiveDayByWeekday", () => {
  it("computes the median only over days that weekday was active", () => {
    // Two Sundays: one with 4 episodes, one with 6. Median is 5.
    const result = medianEpisodesPerActiveDayByWeekday(
      [
        ...batch("2026-03-15T12:00:00.000Z", 4),
        ...batch("2026-03-22T12:00:00.000Z", 6),
      ],
      "UTC",
    );

    expect(result[6]).toBe(5);
  });

  it("returns zero for a weekday with no activity", () => {
    expect(medianEpisodesPerActiveDayByWeekday([], "UTC")).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: FAIL — `buildBigDay is not a function`.

- [ ] **Step 3: Implement**

Add these imports to `src/lib/series-finale/aggregate.ts`:

```ts
import { getTimezoneHour, getTimezoneWeekday } from "../time";
import { partitionSoloTicks } from "./solo-ticks";
import { SOLO_TICK_FLOOR } from "./types";
```

Then append:

```ts
function groupByDateKey(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): Map<string, WatchedEpisodeRow[]> {
  const byDay = new Map<string, WatchedEpisodeRow[]>();
  for (const row of episodes) {
    const key = getTimezoneDateKey(row.watchedAt, timeZone);
    const existing = byDay.get(key);
    if (existing) existing.push(row);
    else byDay.set(key, [row]);
  }
  return byDay;
}

/** Longest run of consecutive calendar days present in `dateKeys`. */
export function longestStreak(
  dateKeys: string[],
): { days: number; start: string; end: string } | null {
  const unique = Array.from(new Set(dateKeys)).sort();
  if (unique.length === 0) return null;

  let bestLength = 1;
  let bestStart = unique[0];
  let bestEnd = unique[0];

  let runLength = 1;
  let runStart = unique[0];

  for (let i = 1; i < unique.length; i += 1) {
    const previous = Date.parse(`${unique[i - 1]}T00:00:00Z`);
    const current = Date.parse(`${unique[i]}T00:00:00Z`);
    const consecutive = current - previous === MS_PER_DAY;

    if (consecutive) {
      runLength += 1;
    } else {
      runLength = 1;
      runStart = unique[i];
    }

    if (runLength > bestLength) {
      bestLength = runLength;
      bestStart = runStart;
      bestEnd = unique[i];
    }
  }

  return { days: bestLength, start: bestStart, end: bestEnd };
}

/**
 * The day with the most episodes.
 *
 * The date, count and minutes use every episode. The `timeline` uses only solo
 * ticks and is null below the floor -- a batch of eleven episodes shares one
 * timestamp, so charting it would draw a single spike and describe it as an
 * eight-hour session.
 */
export function buildBigDay(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
  episodeRuntimeLookup: Map<string, number | null>,
): SeriesFinalePayload["bigDay"] {
  if (episodes.length === 0) return null;

  const byDay = groupByDateKey(episodes, timeZone);

  let bestKey = "";
  let bestRows: WatchedEpisodeRow[] = [];
  for (const [key, rows] of byDay) {
    if (rows.length > bestRows.length) {
      bestKey = key;
      bestRows = rows;
    }
  }

  const { solo } = partitionSoloTicks(episodes);
  const soloOnBestDay = solo.filter(
    (row) => getTimezoneDateKey(row.watchedAt, timeZone) === bestKey,
  );

  const { minutes } = summariseEpisodeRuntimes(bestRows, episodeRuntimeLookup);

  return {
    date: bestKey,
    episodes: bestRows.length,
    minutes,
    timeline:
      solo.length >= SOLO_TICK_FLOOR
        ? soloOnBestDay
            .slice()
            .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
            .map((row) => ({ at: row.watchedAt.toISOString() }))
        : null,
    soloTickCount: soloOnBestDay.length,
    streak: longestStreak(Array.from(byDay.keys())),
  };
}

/**
 * Weekday distribution over every episode, plus the share of solo ticks after
 * 21:00.
 *
 * Weekday counts use all episodes: a batch write still lands on the right day.
 * `lateShare` uses solo ticks only and is null below the floor, because
 * time-of-day over batched rows is an artefact of when someone bulk-marked.
 */
export function buildRhythm(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): { weekdayCounts: number[]; topWeekday: number | null; lateShare: number | null } {
  const weekdayCounts = new Array(7).fill(0) as number[];
  for (const row of episodes) {
    weekdayCounts[getTimezoneWeekday(row.watchedAt, timeZone)] += 1;
  }

  const total = weekdayCounts.reduce((a, b) => a + b, 0);
  const topWeekday =
    total === 0 ? null : weekdayCounts.indexOf(Math.max(...weekdayCounts));

  const { solo } = partitionSoloTicks(episodes);
  const lateShare =
    solo.length >= SOLO_TICK_FLOOR
      ? solo.filter((row) => getTimezoneHour(row.watchedAt, timeZone) >= 21)
          .length / solo.length
      : null;

  return { weekdayCounts, topWeekday, lateShare };
}

/**
 * For each weekday, the median episode count across the days that weekday was
 * actually active. Feeds archetype rule 3, which distinguishes "watches a bit
 * every Sunday" from "marathons on Sundays".
 */
export function medianEpisodesPerActiveDayByWeekday(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): number[] {
  const byDay = groupByDateKey(episodes, timeZone);
  const perWeekday: number[][] = Array.from({ length: 7 }, () => []);

  for (const rows of byDay.values()) {
    const weekday = getTimezoneWeekday(rows[0].watchedAt, timeZone);
    perWeekday[weekday].push(rows.length);
  }

  return perWeekday.map((counts) => median(counts) ?? 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: PASS, 33 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/aggregate.ts src/lib/series-finale/aggregate.test.ts
git commit -m "feat: day and rhythm aggregators for Series Finale"
```

---

### Task 8: Abandonment aggregator

**Files:**
- Modify: `src/lib/series-finale/aggregate.ts`
- Modify: `src/lib/series-finale/aggregate.test.ts`

**Interfaces:**
- Consumes: `ContentStatusRow`, `TitleMeta`, `titleKey` from Task 1
- Produces: `function buildShame(statuses, titles, episodes, period, now): SeriesFinalePayload["shame"]`

**Note:** `now` is a parameter, not `new Date()`. This plan forbids clock access
so "days in planning" stays deterministic under test.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/aggregate.test.ts`:

```ts
import { buildShame } from "./aggregate";

describe("buildShame", () => {
  const NOW = new Date("2026-12-31T00:00:00Z");

  it("lists dropped shows with the last episode watched", () => {
    const result = buildShame(
      [status({ tmdbId: 1, status: "dropped" })],
      titleMap([title({ tmdbId: 1, title: "Foundation" })]),
      [
        { tmdbId: 1, seasonNumber: 2, episodeNumber: 3, watchedAt: new Date("2026-02-01T00:00:00Z") },
        { tmdbId: 1, seasonNumber: 2, episodeNumber: 1, watchedAt: new Date("2026-01-01T00:00:00Z") },
      ],
      PERIOD,
      NOW,
    );

    expect(result.dropped).toEqual([
      { tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" },
    ]);
  });

  it("reports a null last episode when none were watched", () => {
    const result = buildShame(
      [status({ tmdbId: 1, status: "dropped" })],
      titleMap([title({ tmdbId: 1 })]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.dropped[0].lastEpisode).toBeNull();
  });

  it("lists still-planning films with days since they were added", () => {
    const result = buildShame(
      [
        status({
          tmdbId: 2,
          contentType: "movie",
          status: "planning",
          createdAt: new Date("2026-12-01T00:00:00Z"),
        }),
      ],
      titleMap([
        title({ tmdbId: 2, contentType: "movie", title: "Blade Runner 2049", runtime: 164 }),
      ]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning).toEqual([
      { tmdbId: 2, title: "Blade Runner 2049", days: 30, runtime: 164 },
    ]);
  });

  it("orders still-planning films by longest wait first", () => {
    const result = buildShame(
      [
        status({ tmdbId: 1, contentType: "movie", status: "planning", createdAt: new Date("2026-12-01T00:00:00Z") }),
        status({ tmdbId: 2, contentType: "movie", status: "planning", createdAt: new Date("2024-01-01T00:00:00Z") }),
      ],
      titleMap([
        title({ tmdbId: 1, contentType: "movie" }),
        title({ tmdbId: 2, contentType: "movie" }),
      ]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning.map((f) => f.tmdbId)).toEqual([2, 1]);
  });

  it("returns empty lists when there is nothing to report", () => {
    expect(buildShame([], new Map(), [], PERIOD, NOW)).toEqual({
      dropped: [],
      stillPlanning: [],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: FAIL — `buildShame is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/aggregate.ts`:

```ts
/**
 * Shows abandoned in the period, and films still sitting in "planning".
 *
 * Only shows can be dropped -- `MovieWatchStatus` is planning-or-completed --
 * so the two lists are genuinely different things rather than one filtered
 * two ways.
 *
 * `now` is a parameter rather than `new Date()` so the day counts are
 * deterministic under test.
 */
export function buildShame(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  episodes: WatchedEpisodeRow[],
  period: { start: Date; end: Date },
  now: Date,
): SeriesFinalePayload["shame"] {
  const lastEpisodeByShow = new Map<number, WatchedEpisodeRow>();
  for (const row of episodes) {
    const current = lastEpisodeByShow.get(row.tmdbId);
    const isLater =
      !current ||
      row.seasonNumber > current.seasonNumber ||
      (row.seasonNumber === current.seasonNumber &&
        row.episodeNumber > current.episodeNumber);
    if (isLater) lastEpisodeByShow.set(row.tmdbId, row);
  }

  const dropped = statuses
    .filter((row) => row.status === "dropped" && isWithin(row.updatedAt, period))
    .map((row) => {
      const meta = titles.get(titleKey(row.tmdbId, row.contentType));
      if (!meta) return null;

      const last = lastEpisodeByShow.get(row.tmdbId);
      return {
        tmdbId: row.tmdbId,
        title: meta.title,
        lastEpisode: last
          ? `S${last.seasonNumber}E${String(last.episodeNumber).padStart(2, "0")}`
          : null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const stillPlanning = statuses
    .filter((row) => row.status === "planning" && row.contentType === "movie")
    .map((row) => {
      const meta = titles.get(titleKey(row.tmdbId, "movie"));
      if (!meta) return null;

      return {
        tmdbId: row.tmdbId,
        title: meta.title,
        days: Math.floor(
          (now.getTime() - row.createdAt.getTime()) / MS_PER_DAY,
        ),
        runtime: meta.runtime,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.days - a.days);

  return { dropped, stillPlanning };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: PASS, 38 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/aggregate.ts src/lib/series-finale/aggregate.test.ts
git commit -m "feat: abandonment aggregator for Series Finale"
```

---

### Task 9: Assemble the payload

**Files:**
- Modify: `src/lib/series-finale/aggregate.ts`
- Modify: `src/lib/series-finale/aggregate.test.ts`

**Interfaces:**
- Consumes: every aggregator from Tasks 5–8, `classifyArchetype` from Task 4,
  `AggregationInput` / `SeriesFinalePayload` / `SERIES_FINALE_SCHEMA_VERSION` /
  `THIN_YEAR_*` from Task 1
- Produces: `function buildPayload(input: AggregationInput, now: Date): SeriesFinalePayload`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/aggregate.test.ts`:

```ts
import { buildPayload } from "./aggregate";
import { SERIES_FINALE_SCHEMA_VERSION } from "./types";
import type { AggregationInput } from "./types";

const input = (overrides: Partial<AggregationInput> = {}): AggregationInput => ({
  period: { start: PERIOD.start, end: PERIOD.end, label: "2026" },
  timeZone: "UTC",
  episodes: [],
  statuses: [],
  titles: new Map(),
  genreNames: new Map(),
  episodeMinutes: { minutes: 0, unknownCount: 0 },
  filmMinutes: { minutes: 0, unknownCount: 0 },
  episodeRuntimeLookup: new Map(),
  collaborativeCompletedKeys: new Set(),
  crew: [],
  peers: [],
  percentile: null,
  ...overrides,
});

describe("buildPayload", () => {
  const NOW = new Date("2026-12-31T00:00:00Z");

  it("stamps the current schema version", () => {
    expect(buildPayload(input(), NOW).schemaVersion).toBe(
      SERIES_FINALE_SCHEMA_VERSION,
    );
  });

  it("combines episode and film minutes into the headline hours", () => {
    const payload = buildPayload(
      input({
        episodeMinutes: { minutes: 24_000, unknownCount: 3 },
        filmMinutes: { minutes: 720, unknownCount: 1 },
      }),
      NOW,
    );

    expect(payload.headline.minutes).toBe(24_720);
    expect(payload.headline.hours).toBe(412);
    expect(payload.headline.unknownRuntimeEpisodes).toBe(4);
  });

  it("marks a thin period", () => {
    expect(buildPayload(input(), NOW).thin).toBe(true);
  });

  it("does not mark a substantial period as thin", () => {
    const episodes = Array.from({ length: 40 }, (_, i) =>
      episode(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`, i + 1),
    );

    expect(buildPayload(input({ episodes }), NOW).thin).toBe(false);
  });

  it("passes the percentile through unchanged", () => {
    expect(buildPayload(input({ percentile: 4 }), NOW).headline.percentile).toBe(4);
  });

  it("serialises the period as ISO strings", () => {
    const payload = buildPayload(input(), NOW);

    expect(payload.period.start).toBe(PERIOD.start.toISOString());
    expect(payload.period.label).toBe("2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/aggregate.test.ts`
Expected: FAIL — `buildPayload is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/aggregate.ts`, adding the needed imports:

```ts
import { classifyArchetype } from "./archetype";
import {
  SERIES_FINALE_SCHEMA_VERSION,
  THIN_YEAR_EPISODES,
  THIN_YEAR_TITLES,
  type AggregationInput,
} from "./types";
```

Then append:

```ts
/**
 * Assemble the full payload.
 *
 * Every card is computed independently and nullable cards return null rather
 * than throwing, so one thin slice of data cannot fail a whole recap.
 *
 * `now` is a parameter rather than `new Date()` so the whole engine stays pure
 * and the "days in planning" counts are deterministic under test.
 */
export function buildPayload(
  input: AggregationInput,
  now: Date,
): SeriesFinalePayload {
  const { period, timeZone, episodes, statuses, titles } = input;

  const finished = countFinished(statuses, period);
  const titlesDropped = countDropped(statuses, period);
  const minutes = input.episodeMinutes.minutes + input.filmMinutes.minutes;

  const rhythm = buildRhythm(episodes, timeZone);
  const months = buildMonths(
    episodes,
    statuses,
    timeZone,
    period.start.getUTCFullYear(),
  );
  const genres = buildGenres(statuses, titles, input.genreNames, period);

  const { solo } = partitionSoloTicks(episodes);

  const completedMetas = statuses
    .filter((row) => row.status === "completed" && isWithin(row.updatedAt, period))
    .map((row) => titles.get(titleKey(row.tmdbId, row.contentType)))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  const collaborativeCount = statuses.filter(
    (row) =>
      row.status === "completed" &&
      isWithin(row.updatedAt, period) &&
      input.collaborativeCompletedKeys.has(titleKey(row.tmdbId, row.contentType)),
  ).length;

  const archetype = classifyArchetype({
    completedTitles: finished.total,
    droppedShows: titlesDropped,
    pausedTitles: statuses.filter(
      (row) => row.status === "paused" && isWithin(row.updatedAt, period),
    ).length,
    weekdayCounts: rhythm.weekdayCounts,
    medianEpisodesPerActiveDayByWeekday: medianEpisodesPerActiveDayByWeekday(
      episodes,
      timeZone,
    ),
    monthlyEpisodeCounts: months.map((m) => m.episodes),
    soloTickHours: solo.map((row) => getTimezoneHour(row.watchedAt, timeZone)),
    soloTickWeekdays: solo.map((row) =>
      getTimezoneWeekday(row.watchedAt, timeZone),
    ),
    soloTickCount: solo.length,
    topGenreShare: genres.length > 0 ? genres[0].percent / 100 : 0,
    medianPopularity: median(completedMetas.map((meta) => meta.popularity)),
    collaborativeCompletedShare:
      finished.total === 0 ? 0 : collaborativeCount / finished.total,
    totalEpisodes: episodes.length,
    totalTitles: finished.total,
  });

  return {
    schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
    },
    headline: {
      hours: Math.round(minutes / 60),
      minutes,
      episodes: episodes.length,
      titlesCompleted: finished.total,
      titlesDropped,
      unknownRuntimeEpisodes:
        input.episodeMinutes.unknownCount + input.filmMinutes.unknownCount,
      percentile: input.percentile,
    },
    episodes: {
      total: episodes.length,
      perDay: episodesPerDay(episodes.length, period),
    },
    finished,
    topShow: buildTopShow(episodes, titles, input.episodeRuntimeLookup, timeZone),
    niche: buildNiche(statuses, titles, period),
    genres,
    months,
    bigDay: buildBigDay(episodes, timeZone, input.episodeRuntimeLookup),
    rhythm: { archetype, ...rhythm },
    shame: buildShame(statuses, titles, episodes, period, now),
    crew: input.crew,
    compare: [],
    thin:
      episodes.length < THIN_YEAR_EPISODES && finished.total < THIN_YEAR_TITLES,
  };
}
```

**Note:** `compare` is assembled in plan 3, where peer completed/planning sets
are loaded. It is `[]` here so the payload typechecks and the engine stays free
of cross-user concerns.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/aggregate.ts src/lib/series-finale/aggregate.test.ts
git commit -m "feat: assemble the Series Finale payload"
```

---

## Verification

```bash
npm run lint:ci && npm run typecheck && npm test
```

All three must pass. Confirm by inspection that no file under
`src/lib/series-finale/` other than `runtime.ts` (from plan 1) imports `db`,
`tmdbClient`, or calls `new Date()` for the current time — that is the
invariant this plan exists to establish.
