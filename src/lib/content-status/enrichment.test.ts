import { beforeEach, describe, expect, it, vi } from "vitest";

// A COMPLETED TV show whose next episode has aired is promoted back to
// `watching` by an UPDATE that runs *after* a TMDB round trip. If the user
// clears their status during that round trip the UPDATE matches no rows, and
// these tests pin what happens then. The mock therefore only needs to answer a
// short, ordered queue of statements.
vi.mock("@/lib/db", () => {
  // CONSTRAINT: one shared FIFO, consumed at `await` time, plus one shared
  // `chain` object across select/update/insert. That is only deterministic while
  // at most ONE path in a given test actually touches the database. The batch
  // test below satisfies this because its second show has status `watching` and
  // returns before any query.
  //
  // If you add a second DB-touching show to a batch test, `Promise.all`
  // interleaving will make queue consumption order-dependent and the failure
  // will look like flake rather than a mock limitation. Key results by statement
  // before doing that.
  const resultsQueue: any[] = [];

  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift() ?? []),
    set: () => chain,
    values: () => chain,
    returning: () => Promise.resolve(resultsQueue.shift() ?? []),
    then: (resolve: any) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  };

  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
  db.__setMockResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };

  return { db };
});

vi.mock("@/lib/activity/activityUtils", () => ({
  syncStatusToCollaborators: vi.fn(async () => []),
}));

vi.mock("@/lib/tmdb/client", () => ({
  tmdbClient: {
    getMovieDetails: vi.fn(),
    getTVShowDetails: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  userContentStatus: {
    userId: "userContentStatus.userId",
    tmdbId: "userContentStatus.tmdbId",
    contentType: "userContentStatus.contentType",
    status: "userContentStatus.status",
    nextEpisodeDate: "userContentStatus.nextEpisodeDate",
    updatedAt: "userContentStatus.updatedAt",
  } as any,
  episodeWatchStatus: {
    userId: "episodeWatchStatus.userId",
    tmdbId: "episodeWatchStatus.tmdbId",
    seasonNumber: "episodeWatchStatus.seasonNumber",
    episodeNumber: "episodeWatchStatus.episodeNumber",
    watched: "episodeWatchStatus.watched",
  } as any,
  showSchedules: {} as any,
  activityFeed: {} as any,
  ActivityType: { STATUS_CHANGED: "status_changed" } as const,
  ContentType: { MOVIE: "movie", TV: "tv" } as const,
  WatchStatus: {
    PLANNING: "planning",
    WATCHING: "watching",
    PAUSED: "paused",
    COMPLETED: "completed",
    DROPPED: "dropped",
  } as const,
  TVWatchStatus: {
    PLANNING: "planning",
    WATCHING: "watching",
    PAUSED: "paused",
    COMPLETED: "completed",
    DROPPED: "dropped",
  } as const,
}));

import { db } from "@/lib/db";
import { userContentStatus } from "@/lib/db/schema";
import { tmdbClient } from "@/lib/tmdb/client";

import {
  enrichAllWithContentStatus,
  enrichWithContentStatus,
} from "./service";

describe("status enrichment when the status row disappears mid-request", () => {
  const userId = "u1";
  const aired = new Date("2025-01-01T00:00:00Z");

  const show = (tmdbId: number) =>
    ({
      tmdbId,
      contentType: "tv",
      title: `Show ${tmdbId}`,
      overview: "",
      posterPath: null,
      backdropPath: null,
      releaseDate: aired.toISOString(),
      voteAverage: 0,
      voteCount: 0,
      popularity: 0,
      genreIds: [],
      adult: null,
      watchStatus: null,
      statusUpdatedAt: null,
    }) as any;

  // A completed show with a next-episode date already in the past: the shape
  // that sends both enrich paths down the promote-to-watching branch.
  const completedStatusRow = (tmdbId: number) => ({
    id: `cs${tmdbId}`,
    userId,
    tmdbId,
    contentType: "tv",
    status: "completed",
    nextEpisodeDate: new Date("2020-01-01T00:00:00Z"),
    createdAt: aired,
    updatedAt: aired,
  });

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (tmdbClient.getTVShowDetails as any).mockReset();
    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      id: 1,
      name: "Show",
      poster_path: null,
      last_episode_to_air: { season_number: 1, episode_number: 2 },
    });
  });

  it("leaves the item unenriched instead of throwing", async () => {
    (db as any).__setMockResults([
      // status lookup for the batch
      [completedStatusRow(1)],
      // last aired episode is not marked watched
      [],
      // the promote-to-watching UPDATE matches nothing: status was cleared
      [],
    ]);

    const result = await enrichAllWithContentStatus([show(1)], userId);

    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(1);
    expect(result[0]!.watchStatus).toBeNull();

    // Without this, a refactor that stopped issuing the promote-to-watching
    // UPDATE altogether would still satisfy the assertions above -- the test
    // would be pinning "no status" rather than "the UPDATE ran and matched
    // nothing", which is a different thing.
    expect(db.update).toHaveBeenCalledWith(userContentStatus);
  });

  it("still enriches the other items in the same batch", async () => {
    // Regression guard for the real damage: enrichAllWithContentStatus awaits
    // these inside a Promise.all, so one show throwing used to reject the whole
    // batch and lose the statuses of every unrelated item in the response.
    (db as any).__setMockResults([
      [completedStatusRow(1), { ...completedStatusRow(2), status: "watching" }],
      [],
      [],
    ]);

    const result = await enrichAllWithContentStatus(
      [show(1), show(2)],
      userId
    );

    expect(result).toHaveLength(2);
    const watching = result.find((item) => item.tmdbId === 2);
    expect(watching?.watchStatus).toBe("watching");
  });

  it("returns the content untouched from the single-item path too", async () => {
    (db as any).__setMockResults([
      // enrichWithContentStatus' own status lookup (.limit(1))
      [completedStatusRow(3)],
      // last aired episode not watched
      [],
      // UPDATE matches nothing
      [],
    ]);

    const result = await enrichWithContentStatus(show(3), userId);

    expect(result.tmdbId).toBe(3);
    expect(result.watchStatus).toBeNull();
  });
});
