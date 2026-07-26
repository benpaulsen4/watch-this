import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };
  const joinCalls: Array<{ type: "left" | "inner"; table: any }> = [];
  const chain: any = {
    from: () => chain,
    leftJoin: (table: any) => {
      joinCalls.push({ type: "left", table });
      return chain;
    },
    innerJoin: (table: any) => {
      joinCalls.push({ type: "inner", table });
      return chain;
    },
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
  (db as any).__getJoinCalls = () => joinCalls.slice();
  (db as any).__resetJoinCalls = () => {
    joinCalls.length = 0;
  };

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
    getAllCachedContent: vi.fn(async (items: Array<{ tmdbId: number }>) =>
      items.map(({ tmdbId }) => ({
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
      })),
    ),
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

import { db, users } from "../db";
import { getAllCachedContent, getCachedContent } from "../tmdb/cache-utils";
import { listActivityTimeline } from "./service";

describe("activity service", () => {
  const userId = "u1";
  const tz = "UTC";

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetJoinCalls();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

    (db as any).__setMockResults([rows, collaboratorUsers, []]);

    const res = await listActivityTimeline(userId, tz, { limit: 2 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.activities.length).toBe(2);
    expect(res.hasMore).toBe(true);
    expect(typeof res.nextCursor).toBe("string");
    const first = res.activities[0]!;
    expect(first.id).toBe("a1");
    expect(first.user.username).toBe("alice");
    expect(first.collaborators?.[0]!.username).toBe("bob");
    expect(typeof first.createdAt).toBe("string");
  });

  it("builds upcoming list and skips shows already watched today", async () => {
    const upcomingRows = [
      { tmdbId: 300, scheduleId: "s1", status: "watching", nextEpisodeDate: null },
      { tmdbId: 400, scheduleId: "s2", status: "planning", nextEpisodeDate: null },
    ];
    (db as any).__setMockResults([
      // activities
      [],
      // upcoming rows
      upcomingRows,
      // watchedToday rows -> skip tmdbId 300
      [{ tmdbId: 300 }],
    ]);

    const res = await listActivityTimeline(userId, tz, { limit: 10 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.upcoming.length).toBe(1);
    expect(res.upcoming[0]!.tmdbId).toBe(400);
    expect(res.upcoming[0]!.scheduleId).toBe("s2");
    expect(res.upcoming[0]!.watchStatus).toBe("planning");
    expect(getAllCachedContent as any).toHaveBeenCalledTimes(1);
    expect((getAllCachedContent as any).mock.calls[0][0]).toEqual([
      { tmdbId: 400, contentType: "tv" },
    ]);
    expect(getCachedContent as any).not.toHaveBeenCalled();
  });

  it("skips upcoming suggestions when the next episode is known but not aired yet", async () => {
    const futureDate = new Date("2999-01-01T00:00:00Z");
    (db as any).__setMockResults([
      [],
      [
        {
          tmdbId: 500,
          scheduleId: "s3",
          status: "watching",
          nextEpisodeDate: futureDate,
        },
      ],
    ]);

    const res = await listActivityTimeline(userId, tz, { limit: 10 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.upcoming).toEqual([]);
    expect(getAllCachedContent as any).not.toHaveBeenCalled();
    expect(getCachedContent as any).not.toHaveBeenCalled();
  });

  it("treats next episode dates using the user's local calendar day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));

    (db as any).__setMockResults([
      [],
      [
        {
          tmdbId: 600,
          scheduleId: "s4",
          status: "watching",
          nextEpisodeDate: new Date("2025-01-02T00:00:00Z"),
        },
      ],
      [],
    ]);

    const res = await listActivityTimeline(userId, "America/New_York", {
      limit: 10,
    });

    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.upcoming).toHaveLength(1);
    expect(res.upcoming[0]!.tmdbId).toBe(600);
    expect(getAllCachedContent as any).toHaveBeenCalledTimes(1);
  });

  // LOGIC-12
  it("degrades to UTC instead of 500ing when the stored timezone is invalid", async () => {
    const rows = [
      {
        id: "a1",
        userId,
        activityType: "list_created",
        tmdbId: null,
        contentType: null,
        listId: "l1",
        metadata: { listName: "Favorites" },
        collaborators: [],
        isCollaborative: false,
        createdAt: new Date("2025-01-01T00:00:00Z"),
        username: "alice",
        userProfilePicture: null,
      },
    ];
    (db as any).__setMockResults([rows, []]);

    // A stale or renamed IANA zone makes `Intl.DateTimeFormat` throw
    // `RangeError`, which used to reject the whole endpoint — activities
    // included, despite having nothing to do with timezones.
    const res = await listActivityTimeline(userId, "Mars/Olympus_Mons", {
      limit: 10,
    });

    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.activities).toHaveLength(1);
    expect(res.activities[0]!.id).toBe("a1");
    expect(res.upcoming).toEqual([]);
  });

  // LOGIC-14
  it("emits a compound (createdAt, id) cursor so tied timestamps are not skipped", async () => {
    const tied = new Date("2025-01-01T00:00:00.000Z");
    // Batch writes land several rows in the same millisecond.
    const rows = ["a1", "a2", "a3"].map((id) => ({
      id,
      userId,
      activityType: "episode_progress",
      tmdbId: 1,
      contentType: "tv",
      listId: null,
      metadata: {},
      collaborators: [],
      isCollaborative: false,
      createdAt: tied,
      username: "alice",
      userProfilePicture: null,
    }));

    (db as any).__setMockResults([rows, []]);

    const res = await listActivityTimeline(userId, tz, { limit: 2 });
    if (typeof res === "string") throw new Error("unexpected error");

    expect(res.hasMore).toBe(true);
    // A bare `createdAt` cursor plus a strict `lt` would skip every remaining
    // row sharing this millisecond.
    expect(res.nextCursor).toBe(`${tied.toISOString()}|a2`);
  });

  // LOGIC-14
  it("accepts a compound cursor", async () => {
    (db as any).__setMockResults([[], []]);

    const res = await listActivityTimeline(userId, tz, {
      limit: 10,
      // `activity_feed.id` is a uuid column, so a real successor cursor carries
      // a uuid here.
      cursor: "2025-01-01T00:00:00.000Z|1e5f7a2c-9d64-4f2b-8a41-0c3b6d9e7f11",
    });

    // `new Date("2025-01-01T00:00:00.000Z|<id>")` is an Invalid Date, so the old
    // parser rejected its own successor cursor outright.
    expect(res).not.toBe("invalidCursor");
  });

  // The id half is fed straight to `lt(activityFeed.id, ...)` against a uuid
  // column, so anything that is not uuid-shaped made Postgres raise
  // `22P02 invalid input syntax for type uuid` — an unhandled 500 on an
  // endpoint that already has a working invalidCursor -> 400 path.
  it.each([
    ["2025-01-01T00:00:00.000Z|x"],
    ["2025-01-01T00:00:00.000Z|"],
    ["2025-01-01T00:00:00.000Z|'; drop table activity_feed --"],
    ["2025-01-01T00:00:00.000Z|1e5f7a2c-9d64-4f2b-8a41-0c3b6d9e7f1"],
    ["2025-01-01T00:00:00.000Z|1e5f7a2c9d644f2b8a410c3b6d9e7f11"],
  ])("rejects a compound cursor whose id half is not a uuid (%s)", async (
    cursor,
  ) => {
    (db as any).__setMockResults([[], []]);

    const res = await listActivityTimeline(userId, tz, { limit: 10, cursor });

    expect(res).toBe("invalidCursor");
    // Rejected before any query is issued.
    expect((db.select as any).mock.calls).toHaveLength(0);
  });

  it("still accepts a legacy bare-ISO cursor", async () => {
    (db as any).__setMockResults([[], []]);

    const res = await listActivityTimeline(userId, tz, {
      limit: 10,
      cursor: "2025-01-01T00:00:00.000Z",
    });

    expect(res).not.toBe("invalidCursor");
  });

  // DATA-11
  it("inner-joins the activity author", async () => {
    (db as any).__setMockResults([[], []]);

    await listActivityTimeline(userId, tz, { limit: 10 });

    const joins = (db as any).__getJoinCalls() as Array<{
      type: string;
      table: any;
    }>;
    const userJoins = joins.filter((join) => join.table === users);
    expect(userJoins).toHaveLength(1);
    // `activity_feed.user_id` is NOT NULL with a cascading FK.
    expect(userJoins[0]!.type).toBe("inner");
  });
});
