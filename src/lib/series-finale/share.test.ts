import { describe, expect, it } from "vitest";

import { stripCrossUserData } from "./share";
import type { SeriesFinalePayload } from "./types";

const payload = (): SeriesFinalePayload => ({
  schemaVersion: 2,
  period: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2027-01-01T00:00:00.000Z",
    label: "2026",
  },
  headline: {
    hours: 412,
    minutes: 24720,
    episodes: 1208,
    titlesCompleted: 47,
    titlesDropped: 6,
    unknownRuntimeEpisodes: 0,
    percentile: 4,
  },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: {
    tmdbId: 1,
    title: "The Bear",
    posterPath: "/bear-poster.jpg",
    episodes: 38,
    minutes: 1002,
    finishedAt: "2026-04-04",
    alsoTopFor: ["marcus"],
  },
  niche: {
    tmdbId: 2,
    title: "Ich war zuhause, aber",
    posterPath: null,
    popularity: 2.1,
    medianPopularity: 68,
    mostPopular: null,
    filmPopularities: [],
  },
  genres: [{ name: "Drama", percent: 22 }],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
  soloTickTotal: 1041,
  bigDay: null,
  rhythm: {
    archetype: "weekday-marathoner",
    weekdayCounts: [1, 1, 1, 1, 1, 1, 6],
    topWeekday: 6,
    lateShare: 0.41,
  },
  shame: { dropped: [], stillPlanning: [] },
  crew: [{ userId: "u1", username: "ana", episodes: 1041 }],
  compare: [
    {
      userId: "u1",
      username: "ana",
      onlyYou: 62,
      both: 34,
      onlyThem: 28,
      theyFinishedYouDropped: null,
      bothPlanningNeitherStarted: null,
    },
  ],
  thin: false,
});

describe("stripCrossUserData", () => {
  it("removes the crew list entirely, rather than emptying it", () => {
    const result = stripCrossUserData(payload());

    expect("crew" in result).toBe(false);
  });

  it("removes the comparison list entirely", () => {
    const result = stripCrossUserData(payload());

    expect("compare" in result).toBe(false);
  });

  it("carries no alsoTopFor key at all, not even an empty one", () => {
    const result = stripCrossUserData(payload());

    expect(result.topShow).not.toBeNull();
    expect(result.topShow && "alsoTopFor" in result.topShow).toBe(false);
  });

  it("keeps the viewer's own statistics", () => {
    const result = stripCrossUserData(payload());

    expect(result.headline.hours).toBe(412);
    expect(result.topShow?.title).toBe("The Bear");
    expect(result.niche?.title).toBe("Ich war zuhause, aber");
    expect(result.rhythm.archetype).toBe("weekday-marathoner");
  });

  it("keeps the top show's poster, which is the show's own artwork", () => {
    const result = stripCrossUserData(payload());

    expect(result.topShow?.posterPath).toBe("/bear-poster.jpg");
  });

  it("contains no other username anywhere in its serialised form", () => {
    const serialised = JSON.stringify(stripCrossUserData(payload()));

    expect(serialised).not.toContain("ana");
    expect(serialised).not.toContain("marcus");
  });

  it("handles a null topShow", () => {
    const source = { ...payload(), topShow: null };

    expect(stripCrossUserData(source).topShow).toBeNull();
  });

  it("handles a null niche", () => {
    const source = { ...payload(), niche: null };

    expect(stripCrossUserData(source).niche).toBeNull();
  });

  it("exposes exactly the allowlisted top-level keys, so a new payload field needs a deliberate edit here", () => {
    const result = stripCrossUserData(payload());

    expect(Object.keys(result).sort()).toEqual(
      ["headline", "niche", "period", "rhythm", "topShow"].sort(),
    );
  });

  it("exposes exactly the allowlisted keys on each nested object", () => {
    const result = stripCrossUserData(payload());

    expect(Object.keys(result.period).sort()).toEqual(["label"]);
    expect(Object.keys(result.headline).sort()).toEqual(
      ["episodes", "hours", "titlesCompleted", "titlesDropped"].sort(),
    );
    expect(Object.keys(result.rhythm).sort()).toEqual(
      ["archetype", "topWeekday"].sort(),
    );
    expect(result.topShow && Object.keys(result.topShow).sort()).toEqual(
      ["posterPath", "title"].sort(),
    );
    expect(result.niche && Object.keys(result.niche).sort()).toEqual([
      "title",
    ]);
  });
});
