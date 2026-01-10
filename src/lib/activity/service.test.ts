import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };
  const chain: any = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    set: () => chain,
    values: () => chain,
    limit: () => {
      const v = resultsQueue.shift();
      return Promise.resolve(v);
    },
    returning: () => {
      const v = resultsQueue.shift();
      return Promise.resolve(v);
    },
    then: (resolve: any) => {
      const v = resultsQueue.shift();
      return Promise.resolve(v).then(resolve);
    },
  };
  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
  (db as any).__setMockResults = setResults;

  const users = {} as any;
  const lists = {} as any;
  const listCollaborators = {} as any;
  const showSchedules = {} as any;
  const userContentStatus = {} as any;
  const episodeWatchStatus = {} as any;
  const activityFeed = {} as any;
  const ContentType = { TV: "tv" } as any;

  return {
    db,
    users,
    lists,
    listCollaborators,
    showSchedules,
    userContentStatus,
    episodeWatchStatus,
    activityFeed,
    ContentType,
  };
});

vi.mock("../tmdb/client", () => {
  return {
    tmdbClient: {
      getTVShowDetails: vi.fn(async (id: number) => ({
        id,
        name: `Show ${id}`,
        overview: "Overview",
        poster_path: null,
        backdrop_path: null,
        first_air_date: "2020-01-01",
        vote_average: 8,
        vote_count: 100,
        genre_ids: [],
        origin_country: ["US"],
        original_language: "en",
        original_name: `Show ${id}`,
        popularity: 10,
        // TV details-only fields (minimal for our mapping)
        created_by: [],
        episode_run_time: [],
        genres: [],
        homepage: "",
        in_production: false,
        languages: [],
        last_air_date: "2024-01-01",
        last_episode_to_air: null,
        next_episode_to_air: null,
        networks: [],
        number_of_episodes: 10,
        number_of_seasons: 1,
        production_companies: [],
        production_countries: [],
        seasons: [],
        spoken_languages: [],
        status: "Ended",
        tagline: "",
        type: "Scripted",
      })),
    },
  };
});

vi.mock("../tmdb/cache-utils", async () => {
  return {
    getCachedContent: vi.fn((tmdbId: number) => {
      return {
        tmdbId,
        contentType: "tv",
        title: "Some show",
        overview: "",
        posterPath: null,
        backdropPath: null,
        releaseDate: "2020-01-01T00:00:00.000Z",
        voteAverage: 8,
        voteCount: 100,
        popularity: 10,
        genreIds: [],
        adult: null,
        watchStatus: "planning",
        statusUpdatedAt: null,
      } as any;
    }),
  };
});

import { db } from "../db";
import { getCachedContent } from "../tmdb/cache-utils";
import { listActivityTimeline } from "./service";

describe("activity service", () => {
  const userId = "u1";
  const tz = "UTC";

  beforeEach(() => {
    (db as any).__setMockResults([]);
    vi.restoreAllMocks();
  });

  it("returns invalidCursor for bad cursor", async () => {
    const res = await listActivityTimeline(userId, tz, {
      limit: 10,
      cursor: "not-a-date",
    });
    expect(res).toBe("invalidCursor");
  });

  it("maps activities with collaborators, hasMore and nextCursor", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const rows = [
      {
        id: "a1",
        userId,
        activityType: "list_created",
        tmdbId: null,
        contentType: null,
        listId: "l1",
        metadata: { listName: "Favorites" },
        collaborators: ["c1"],
        isCollaborative: true,
        createdAt: now,
        username: "alice",
        userProfilePicture: null,
      },
      {
        id: "a2",
        userId,
        activityType: "list_item_added",
        tmdbId: 100,
        contentType: "movie",
        listId: "l1",
        metadata: { title: "Inception" },
        collaborators: ["c1", "c2"],
        isCollaborative: true,
        createdAt: new Date("2025-01-01T01:00:00Z"),
        username: "alice",
        userProfilePicture: null,
      },
      {
        id: "a3",
        userId,
        activityType: "status_changed",
        tmdbId: 200,
        contentType: "tv",
        listId: null,
        metadata: { title: "The Show", status: "watching" },
        collaborators: [],
        isCollaborative: false,
        createdAt: new Date("2025-01-01T02:00:00Z"),
        username: "alice",
        userProfilePicture: null,
      },
    ];

    const collaboratorUsers = [
      { id: "c1", username: "bob", profilePictureUrl: null },
      { id: "c2", username: "charlie", profilePictureUrl: null },
    ];

    (db as any).__setMockResults([[], rows, collaboratorUsers, []]);

    const res = await listActivityTimeline(userId, tz, { limit: 2 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.activities.length).toBe(2);
    expect(res.hasMore).toBe(true);
    expect(typeof res.nextCursor).toBe("string");
    const first = res.activities[0];
    expect(first.id).toBe("a1");
    expect(first.user.username).toBe("alice");
    expect(first.collaborators?.[0].username).toBe("bob");
    expect(typeof first.createdAt).toBe("string");
  });

  it("builds upcoming list and skips shows already watched today", async () => {
    const upcomingRows = [
      { tmdbId: 300, scheduleId: "s1", status: "watching" },
      { tmdbId: 400, scheduleId: "s2", status: "planning" },
    ];
    (db as any).__setMockResults([
      // collaborative lists
      [],
      // activities
      [],
      // upcoming rows
      upcomingRows,
      // watchedToday for first row -> non-empty to skip
      [{ id: "w1" }],
      // watchedToday for second row -> empty to include
      [],
    ]);

    const res = await listActivityTimeline(userId, tz, { limit: 10 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.upcoming.length).toBe(1);
    expect(res.upcoming[0].tmdbId).toBe(400);
    expect(res.upcoming[0].scheduleId).toBe("s2");
    expect(res.upcoming[0].watchStatus).toBe("planning");
    expect(getCachedContent as any).toHaveBeenCalledTimes(1);
    expect((getCachedContent as any).mock.calls[0][0]).toBe(400);
  });
});
