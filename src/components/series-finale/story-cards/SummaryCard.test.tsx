import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { SummaryCard } from "./SummaryCard";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const COMPLETE_URL = "/api/series-finale/2026/story-complete";

/**
 * The period GET and the completion POST, as the server answers them: a
 * completion that succeeds is remembered, so later GETs carry its timestamp.
 * `completeOk` answers each POST in turn, the last answer repeating.
 */
const mockServer = ({
  storyCompletedAt = null as string | null,
  completeOk = [true],
} = {}) => {
  let completed = storyCompletedAt;
  let posts = 0;
  const fetchMock = vi.fn((url: string) => {
    if (url === COMPLETE_URL) {
      const ok = completeOk[Math.min(posts, completeOk.length - 1)] ?? true;
      posts += 1;
      if (ok) completed ??= "2027-01-02T10:00:00.000Z";
      return Promise.resolve({ ok, status: ok ? 200 : 500 });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ payload, storyCompletedAt: completed }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    posts: () =>
      fetchMock.mock.calls.filter(([url]) => url === COMPLETE_URL).length,
  };
};

beforeEach(() => {
  mockServer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * A whole payload, other people's data included. The summary card is what
 * plan 5's share image reuses, so none of that may reach it.
 */
const payload: SeriesFinalePayload = {
  schemaVersion: 2,
  period: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2027-01-01T00:00:00.000Z",
    label: "2026",
    timezone: "UTC",
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
    posterPath: null,
    episodes: 38,
    minutes: 1002,
    finishedAt: "2026-04-04",
    alsoTopFor: ["marcus_top"],
  },
  niche: {
    tmdbId: 2,
    title: "Ich war zuhause, aber",
    posterPath: null,
    popularity: 2.1,
    medianPopularity: 68,
    mostPopular: null,
    filmPopularities: [2.1, 68],
  },
  genres: [],
  months: [],
  soloTickTotal: 0,
  bigDay: null,
  rhythm: {
    archetype: "completionist",
    weekdayCounts: [1, 1, 1, 1, 1, 1, 1],
    topWeekday: 0,
    lateShare: null,
    hourCounts: null,
    sharedListShare: null,
  },
  shame: { dropped: [], stillPlanning: [] },
  crew: [{ userId: "u2", username: "ana_crew", episodes: 1041 }],
  compare: [
    {
      userId: "u3",
      username: "bo_compare",
      onlyYou: 62,
      both: 34,
      onlyThem: 28,
      theyFinishedYouDropped: "Citadel",
      bothPlanningNeitherStarted: "Heat",
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
      { wrapper },
    );

    expect(screen.getByText("ben's year")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(screen.getByText("The Completionist")).toBeInTheDocument();
  });

  it("offers to share the card", () => {
    render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
      { wrapper },
    );

    expect(
      screen.getByRole("button", { name: "Share your card" }),
    ).toBeInTheDocument();
  });

  it("shows nothing about anyone else, even handed a payload that has it", () => {
    const { container } = render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
      { wrapper },
    );

    for (const name of [
      "ana_crew",
      "bo_compare",
      "marcus_top",
      "Citadel",
      "Heat",
    ]) {
      expect(container.textContent).not.toContain(name);
    }
  });

  it("offers the full recap beneath Share", async () => {
    render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
      { wrapper },
    );

    expect(
      await screen.findByRole("link", { name: "See the full recap" }),
    ).toHaveAttribute("href", "/series-finale/2026");
  });

  it("records the story as gone through, once", async () => {
    const server = mockServer();
    const viewer = { username: "ben", profilePictureUrl: "" };
    const { rerender } = render(
      <SummaryCard summary={payload} viewer={viewer} />,
      { wrapper },
    );

    await waitFor(() => expect(server.posts()).toBe(1));
    rerender(<SummaryCard summary={payload} viewer={viewer} />);
    await screen.findByRole("link", { name: "See the full recap" });
    expect(server.posts()).toBe(1);
  });

  it("records nothing for a story already gone through", async () => {
    const server = mockServer({ storyCompletedAt: "2027-01-02T10:00:00.000Z" });
    render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
      { wrapper },
    );

    await screen.findByRole("link", { name: "See the full recap" });
    // Give a stray POST the chance to go out.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(server.posts()).toBe(0);
  });

  it("offers a retry, not the recap, when that cannot be saved", async () => {
    const server = mockServer({ completeOk: [false, true] });
    render(
      <SummaryCard
        summary={payload}
        viewer={{ username: "ben", profilePictureUrl: "" }}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save that you finished.",
    );
    expect(
      screen.queryByRole("link", { name: "See the full recap" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("link", { name: "See the full recap" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(server.posts()).toBe(2);
  });
});
