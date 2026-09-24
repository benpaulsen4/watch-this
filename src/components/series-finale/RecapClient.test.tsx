import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecapClient } from "./RecapClient";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const viewer = { username: "ben", profilePictureUrl: "", timezone: "UTC" };

const payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: {
    hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47,
    titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4,
  },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: null, niche: null, genres: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 0 })),
  soloTickTotal: 0,
  bigDay: null,
  rhythm: { archetype: null, weekdayCounts: [0, 0, 0, 0, 0, 0, 0], topWeekday: null, lateShare: null },
  shame: { dropped: [], stillPlanning: [] },
  crew: [], compare: [], thin: false,
  ...overrides,
});

const mockFetch = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
  );

const mockFetchStatus = (status: number) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }),
  );

const renderRecap = () =>
  render(<RecapClient period="2026" user={viewer} />, { wrapper });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RecapClient", () => {
  it("renders the headline hours", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  });

  it("renders the thin-year card instead of stats for a thin period", async () => {
    mockFetch({
      payload: payload({
        thin: true,
        headline: { hours: 0, minutes: 0, episodes: 9, titlesCompleted: 2, titlesDropped: 0, unknownRuntimeEpisodes: 0, percentile: null },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText(/Not much of a 2026/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Episodes watched")).not.toBeInTheDocument();
    // A reel through nine episodes is exactly what the thin card refuses.
    expect(
      screen.queryByRole("link", { name: "Play as story" }),
    ).not.toBeInTheDocument();
  });

  it("omits the percentile line when there is no cohort", async () => {
    mockFetch({
      payload: payload({
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: null },
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
  });

  it("shows the percentile line for the top half", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText("Top 4% of everyone on WatchThis"),
      ).toBeInTheDocument(),
    );
  });

  it("omits the percentile line for the lower half", async () => {
    mockFetch({
      payload: payload({
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 96 },
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
  });

  it("shows TMDB attribution", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeInTheDocument(),
    );
    expect(screen.getByAltText("TMDB")).toBeInTheDocument();
  });

  it("introduces the year with the username and its dates", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText("ben · 1 January – 31 December 2026"),
      ).toBeInTheDocument(),
    );
  });

  it("describes the year in a sentence built from the payload", async () => {
    mockFetch({
      payload: payload({
        rhythm: { archetype: null, weekdayCounts: [1, 1, 1, 1, 1, 1, 6], topWeekday: 6, lateShare: 0.7 },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(
          "1,208 episodes and 31 films, mostly on Sundays, mostly after nine. Seventeen straight days of screen, if you had done it all at once.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("discloses episodes left out of the hours for want of a runtime", async () => {
    mockFetch({
      payload: payload({
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 14, percentile: 4 },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(/Excludes 14 episodes with no runtime on TMDB/),
      ).toBeInTheDocument(),
    );
  });

  it("renders the stat row, dating the streak", async () => {
    mockFetch({
      payload: payload({
        bigDay: {
          date: "2026-03-14", episodes: 11, minutes: 500, timeline: null, soloTickCount: 0,
          streak: { days: 23, start: "2026-01-02", end: "2026-01-24" },
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Day streak, 2–24 Jan")).toBeInTheDocument(),
    );
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("1,208")).toBeInTheDocument();
    expect(screen.getByText("Episodes watched")).toBeInTheDocument();
    expect(screen.getByText("Titles completed")).toBeInTheDocument();
    expect(screen.getByText("Shows dropped")).toBeInTheDocument();
  });

  it("names the peak month on the monthly chart", async () => {
    mockFetch({
      payload: payload({
        months: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          episodes: i === 2 ? 174 : 20,
        })),
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Peak: March, 174")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("img", { name: /Peak March, 174/ }),
    ).toBeInTheDocument();
  });

  it("links back to the profile's data tab and on to the story", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Play as story" }),
      ).toHaveAttribute("href", "/series-finale/2026/story"),
    );
    expect(
      screen.getByRole("link", { name: "Back to profile" }),
    ).toHaveAttribute("href", "/profile#data");
  });

  it("says plainly when the period is not available", async () => {
    mockFetchStatus(404);
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("No Series Finale for 2026")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your profile" }),
    ).toHaveAttribute("href", "/profile#data");
  });

  it("offers a retry-later message for any other failure", async () => {
    mockFetchStatus(500);
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Series Finale for 2026"),
    ).not.toBeInTheDocument();
  });
});
