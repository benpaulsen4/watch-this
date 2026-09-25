import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { SummaryCard } from "./SummaryCard";

/**
 * A whole payload, other people's data included. The summary card is what
 * plan 5's share image reuses, so none of that may reach it.
 */
const payload: SeriesFinalePayload = {
  schemaVersion: 2,
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: {
    tmdbId: 1, title: "The Bear", posterPath: null, episodes: 38, minutes: 1002,
    finishedAt: "2026-04-04", alsoTopFor: ["marcus_top"],
  },
  niche: {
    tmdbId: 2, title: "Ich war zuhause, aber", posterPath: null, popularity: 2.1,
    medianPopularity: 68, mostPopular: null, filmPopularities: [2.1, 68],
  },
  genres: [],
  months: [],
  soloTickTotal: 0,
  bigDay: null,
  rhythm: { archetype: "completionist", weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
  shame: { dropped: [], stillPlanning: [] },
  crew: [{ userId: "u2", username: "ana_crew", episodes: 1041 }],
  compare: [
    {
      userId: "u3", username: "bo_compare", onlyYou: 62, both: 34, onlyThem: 28,
      theyFinishedYouDropped: "Citadel", bothPlanningNeitherStarted: "Heat",
    },
  ],
  thin: false,
};

describe("SummaryCard", () => {
  it("renders the viewer's own year", () => {
    render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
    );

    expect(screen.getByText("ben's year")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(screen.getByText("The Completionist")).toBeInTheDocument();
  });

  it("shows nothing about anyone else, even handed a payload that has it", () => {
    const { container } = render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
    );

    for (const name of ["ana_crew", "bo_compare", "marcus_top", "Citadel", "Heat"]) {
      expect(container.textContent).not.toContain(name);
    }
  });
});
