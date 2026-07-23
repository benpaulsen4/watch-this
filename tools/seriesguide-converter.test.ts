import { beforeEach, describe, expect, it, vi } from "vitest";

// LOGIC-03 round-trip test: converter output is fed straight into
// `importUserData`. Before the fix the converter emitted an `episodeWatchStatus`
// key while the importer reads `episodeStatus`, so every converted episode was
// silently dropped and the import reported success with zero imported. The
// content-status rows also omitted createdAt/updatedAt, so `new Date(undefined)`
// produced an Invalid Date and the insert threw on a NOT NULL column.

const { mockedDb } = vi.hoisted(() => ({
  mockedDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockedDb }));

vi.mock("@/lib/db/schema", () => {
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "then" ? undefined : `${name}.${String(prop)}`,
      },
    );
  return {
    lists: table("lists"),
    listItems: table("listItems"),
    userContentStatus: table("userContentStatus"),
    episodeWatchStatus: table("episodeWatchStatus"),
    showSchedules: table("showSchedules"),
    tmdbCache: table("tmdbCache"),
    activityFeed: table("activityFeed"),
    ActivityType: { PROFILE_IMPORT: "profile_import" },
  };
});

vi.mock("@/lib/tmdb/cache-utils", () => ({
  addToCache: vi.fn(async () => ({})),
}));

import { importUserData } from "@/lib/profile/data/service";

import { convertSeriesGuideToWatchThis } from "./seriesguide-converter";

const seriesGuideFixture = [
  {
    content_rating: "TV-14",
    country: "us",
    custom_release_day_offset: 0,
    custom_release_timezone: "",
    favorite: true,
    first_aired: "2016-07-15",
    hidden: false,
    imdb_id: "tt4574334",
    language: "en",
    last_watched_ms: 1_700_000_000_000,
    network: "Netflix",
    notify: true,
    poster: "",
    rating_user: 0,
    release_time: 1800,
    release_timezone: "America/New_York",
    release_weekday: 5,
    runtime: 50,
    status: "continuing",
    title: "Example Show",
    tmdb_id: 66732,
    trakt_id: 1,
    tvdb_id: 2,
    seasons: [
      {
        season: 1,
        tmdb_id: "77680",
        episodes: [
          {
            collected: true,
            episode: 1,
            first_aired: 1_468_540_800_000,
            plays: 1,
            skipped: false,
            title: "Chapter One",
            tmdb_id: 1198665,
            watched: true,
          },
          {
            collected: false,
            // No air date -- must not become an Invalid Date.
            episode: 2,
            first_aired: 0,
            plays: 0,
            skipped: false,
            title: "Chapter Two",
            tmdb_id: 1198666,
            watched: true,
          },
          {
            collected: false,
            episode: 3,
            first_aired: 1_468_713_600_000,
            plays: 0,
            skipped: false,
            title: "Chapter Three",
            tmdb_id: 1198667,
            watched: false,
          },
        ],
      },
    ],
  },
];

function setupImportMocks() {
  const valuesMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const returningMock = vi.fn().mockResolvedValue([{ id: "generated-list-1" }]);

  (mockedDb.insert as any).mockReturnValue({
    values: valuesMock.mockReturnValue({
      onConflictDoUpdate: onConflictDoUpdateMock,
      onConflictDoNothing: onConflictDoNothingMock,
      returning: returningMock,
    }),
  });

  return { valuesMock };
}

describe("SeriesGuide converter -> importUserData round trip (LOGIC-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits the key the importer actually reads", () => {
    const converted = convertSeriesGuideToWatchThis(seriesGuideFixture as any);
    expect(converted).toHaveProperty("episodeStatus");
    expect(converted).not.toHaveProperty("episodeWatchStatus");
    expect(converted.episodeStatus).toHaveLength(2);
  });

  it("never emits a client-supplied id (LOGIC-04)", () => {
    const converted = convertSeriesGuideToWatchThis(seriesGuideFixture as any);
    for (const row of [...converted.contentStatus, ...converted.episodeStatus]) {
      expect(row).not.toHaveProperty("id");
    }
  });

  it("emits valid createdAt/updatedAt on every row", () => {
    const converted = convertSeriesGuideToWatchThis(seriesGuideFixture as any);
    for (const row of [...converted.contentStatus, ...converted.episodeStatus]) {
      expect(typeof row.createdAt).toBe("string");
      expect(typeof row.updatedAt).toBe("string");
      expect(Number.isNaN(new Date(row.createdAt).getTime())).toBe(false);
      expect(Number.isNaN(new Date(row.updatedAt).getTime())).toBe(false);
    }
  });

  it("imports every converted row instead of silently dropping them", async () => {
    const { valuesMock } = setupImportMocks();
    const converted = convertSeriesGuideToWatchThis(seriesGuideFixture as any);

    const result = await importUserData(
      "user-1",
      JSON.stringify(converted),
    );

    expect(typeof result).not.toBe("string");
    if (typeof result === "string") return;

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    // One show, two watched episodes -- the old key mismatch imported 0.
    expect(result.imported.contentStatus).toBe(1);
    expect(result.imported.episodeStatus).toBe(2);

    // No insert may carry an Invalid Date into a NOT NULL timestamp column.
    const payloads = valuesMock.mock.calls.map((c) => c[0]);
    for (const payload of payloads) {
      for (const [key, value] of Object.entries(payload)) {
        if (value instanceof Date) {
          expect(
            Number.isNaN(value.getTime()),
            `${key} is an Invalid Date`,
          ).toBe(false);
        }
      }
    }
  });
});
