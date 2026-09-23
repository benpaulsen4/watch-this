import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This file exists to fail loudly if a future change turns the read path of
 * `getOrGenerateSnapshot` back into a live query. Freezing is the central
 * premise of Series Finale: once a snapshot is written, reading it must
 * return exactly the stored payload, never a value recomputed from whatever
 * the source rows currently say.
 *
 * The db mock shape mirrors `service.test.ts` (current, not the original
 * plan draft): `service.ts` reaches `../db` both directly and indirectly
 * through `./runtime`, which imports `ContentType`, `tmdbCache`,
 * `tmdbEpisodeRuntime` and `tmdbSeasonFetch` from `../db` rather than
 * `../db/schema`, and `isTMDBHttpError` from `../tmdb/client`. This file does
 * not need the query-shape capture (`joins`, `where`) that `service.test.ts`
 * builds for its consent-boundary assertions -- only call counts and queued
 * results -- so the chain here is the minimal subset that keeps those
 * imports from throwing when touched.
 */
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

  return {
    db,
    ContentType: { MOVIE: "movie", TV: "tv" },
    tmdbCache: {},
    tmdbEpisodeRuntime: {},
    tmdbSeasonFetch: {},
  };
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

vi.mock("../tmdb/client", () => ({
  isTMDBHttpError: () => false,
  tmdbClient: {
    getMovieGenres: vi.fn().mockResolvedValue({ genres: [] }),
    getTVGenres: vi.fn().mockResolvedValue({ genres: [] }),
    getTVSeasonDetails: vi.fn(),
    getMovieDetails: vi.fn(),
  },
}));

import { db } from "../db";
import { calendarYearPeriod } from "./periods";
import { getOrGenerateSnapshot } from "./service";
import {
  SERIES_FINALE_SCHEMA_VERSION,
  type SeriesFinalePayload,
} from "./types";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(
    rows,
  );

/** Narrows `SeriesFinalePayload | null` without a non-null assertion. */
function requirePayload(
  payload: SeriesFinalePayload | null,
): SeriesFinalePayload {
  if (payload === null) throw new Error("expected a stored payload, got null");
  return payload;
}

/**
 * A complete, valid, crew-less `SeriesFinalePayload`. `withholdWithdrawnCollaborators`
 * reads `payload.crew` and `payload.compare` unconditionally, so a partial
 * fixture (e.g. `{ schemaVersion, headline }` alone) would crash the read
 * path rather than exercise it.
 */
function basePayload(): SeriesFinalePayload {
  return {
    schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
    period: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
      label: "2026",
    },
    headline: {
      hours: 412,
      minutes: 24_720,
      episodes: 1208,
      titlesCompleted: 12,
      titlesDropped: 3,
      unknownRuntimeEpisodes: 0,
      percentile: 4,
    },
    episodes: { total: 1208, perDay: 3.3 },
    finished: { films: 5, shows: 7, total: 12 },
    topShow: null,
    niche: null,
    genres: [],
    months: [],
    soloTickTotal: 0,
    bigDay: null,
    rhythm: {
      archetype: null,
      weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
      topWeekday: null,
      lateShare: null,
    },
    shame: { dropped: [], stillPlanning: [] },
    crew: [],
    compare: [],
    thin: false,
  };
}

describe("snapshot immutability", () => {
  const period = calendarYearPeriod(2026);
  // Falls inside the period: a stored snapshot is already a fact regardless
  // of whether the period has "completed" yet, so `now` here should never
  // matter to the outcome.
  const now = new Date("2026-06-01T00:00:00Z");

  beforeEach(() => vi.clearAllMocks());

  it("returns the stored payload untouched for a crew-less snapshot, issuing exactly one query", async () => {
    const stored = basePayload();

    // Only the stored row is queued. If the read path fell through to
    // generation, it would need many more queued results (timezone, first
    // activity, episodes, statuses, ...) and would either throw on an empty
    // queue or silently consume `[]` for each -- either way it could not
    // legitimately reproduce these headline numbers.
    setResults([
      [{ payload: stored, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }],
    ]);

    const payload = requirePayload(
      await getOrGenerateSnapshot("user-1", period, now),
    );

    expect(payload).toEqual(stored);
    expect(payload.headline.hours).toBe(412);
    expect(payload.headline.episodes).toBe(1208);

    // Exactly the stored-row lookup. A crew-less payload has no ids for
    // `withholdWithdrawnCollaborators` to check, so it issues no query of its
    // own -- any additional `select` call here would mean something besides
    // that one lookup ran.
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns a stored payload with a consenting crew member via exactly one extra query, and nothing else", async () => {
    const crewMember = {
      userId: "crew-1",
      username: "ana",
      episodes: 50,
      hours: 20,
      topShowTmdbId: 42,
    };
    const compareRow = {
      userId: "crew-1",
      username: "ana",
      onlyYou: 3,
      both: 2,
      onlyThem: 1,
      theyFinishedYouDropped: null,
      bothPlanningNeitherStarted: null,
    };
    const stored: SeriesFinalePayload = {
      ...basePayload(),
      topShow: {
        tmdbId: 42,
        title: "Severance",
        posterPath: null,
        episodes: 19,
        minutes: 950,
        finishedAt: "2026-03-21",
        alsoTopFor: ["ana"],
      },
      crew: [crewMember],
      compare: [compareRow],
    };

    setResults([
      [{ payload: stored, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }],
      // The consent check for "crew-1": still sharing, so nothing is withheld.
      [{ id: "crew-1" }],
    ]);

    const payload = requirePayload(
      await getOrGenerateSnapshot("user-1", period, now),
    );

    const { crew, compare, topShow, ...rest } = payload;
    const {
      crew: storedCrew,
      compare: storedCompare,
      topShow: storedTopShow,
      ...storedRest
    } = stored;

    // Every field the consent check does not touch is exactly the frozen
    // value -- not a value that happens to match after being recomputed.
    expect(rest).toEqual(storedRest);
    // The one consenting crew member survives the check untouched, and so do
    // the compare row and the alsoTopFor line built from it.
    expect(crew).toEqual(storedCrew);
    expect(compare).toEqual(storedCompare);
    expect(topShow).toEqual(storedTopShow);

    // The stored-row lookup, plus exactly one more: the consent check.
    // Loading rows, runtimes or the cohort would each add a further call,
    // so pinning the count at two is what stops a future "recompute" from
    // hiding behind the one legitimate read-time query.
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
