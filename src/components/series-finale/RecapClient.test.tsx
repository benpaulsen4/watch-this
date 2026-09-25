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

const viewer = { username: "ben", profilePictureUrl: "" };

const payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: {
    hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47,
    titlesDropped: 0, unknownRuntimeEpisodes: 0, percentile: 4,
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

/** The default headline with its dropped count replaced. */
const droppedCount = (titlesDropped: number) => ({
  headline: { ...payload().headline, titlesDropped },
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
    expect(screen.getByText("hours")).toBeInTheDocument();
  });

  it("says one hour, not one hours", async () => {
    mockFetch({
      payload: payload({
        headline: { ...payload().headline, hours: 1, minutes: 70 },
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("hour")).toBeInTheDocument());
    expect(screen.queryByText("hours")).not.toBeInTheDocument();
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
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 0, unknownRuntimeEpisodes: 0, percentile: null },
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
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 0, unknownRuntimeEpisodes: 0, percentile: 96 },
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

  it("dates the year from its label, not from the snapshot's instants", async () => {
    mockFetch({
      payload: payload({
        // Bounds localised to Auckland at generation: read in UTC they would
        // start on 31 December.
        period: { start: "2025-12-31T11:00:00.000Z", end: "2026-12-31T11:00:00.000Z", label: "2026" },
      }),
    });
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
          "1,208 episodes, most often on Sundays, and 31 films. Seventeen straight days of screen, if you had done it all at once.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("discloses episodes left out of the hours for want of a runtime", async () => {
    mockFetch({
      payload: payload({
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 0, unknownRuntimeEpisodes: 14, percentile: 4 },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(/Excludes 14 episodes or films with no runtime on TMDB/),
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

  it("renders the archetype with the user's actual top weekday", async () => {
    mockFetch({
      payload: payload({
        rhythm: {
          archetype: "weekday-marathoner",
          weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
          topWeekday: 6,
          lateShare: 0.41,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("The Sunday Marathoner")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "One day a week does most of the work. 50% of your episodes landed on a Sunday. 41% of the episodes you ticked one at a time came after 21:00.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Episodes by weekday. Peak Sunday." }),
    ).toBeInTheDocument();
  });

  it("omits the archetype section when there is none", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/Marathoner/)).not.toBeInTheDocument();
    expect(screen.queryByText("Your type")).not.toBeInTheDocument();
  });

  it("lists dropped shows with the episode that tipped it", async () => {
    mockFetch({
      payload: payload({
        ...droppedCount(1),
        shame: {
          dropped: [{ tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" }],
          stillPlanning: [],
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText(/Foundation/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Foundation · S2E03")).toBeInTheDocument();
    expect(
      screen.getByText(
        "One show marked dropped. This episode was what tipped you over the edge.",
      ),
    ).toBeInTheDocument();
  });

  it("states the stat tile's dropped count, and counts the shows it could not name", async () => {
    // `shame.dropped` leaves out titles with no cached metadata. The panel
    // takes its count from the headline, like the tile beside it, and covers
    // the one it cannot name.
    mockFetch({
      payload: payload({
        ...droppedCount(6),
        shame: {
          dropped: Array.from({ length: 5 }, (_, i) => ({
            tmdbId: i, title: `Show ${i + 1}`, lastEpisode: "S1E02",
          })),
          stillPlanning: [],
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(
          "Six shows marked dropped. These episodes were what tipped you over the edge.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Show 5 · S1E02")).toBeInTheDocument();
    expect(screen.getByText("And one more.")).toBeInTheDocument();
  });

  it("follows the dropped shows with the films still waiting", async () => {
    mockFetch({
      payload: payload({
        ...droppedCount(1),
        shame: {
          dropped: [{ tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" }],
          stillPlanning: Array.from({ length: 7 }, (_, i) => ({
            tmdbId: 100 + i, title: `Film ${i + 1}`, days: 1104 - i, runtime: 120,
          })),
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(
          "And even after giving up on that one, you still didn't find time for these.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Film 1 · 1,104 days")).toBeInTheDocument();
    expect(screen.getByText("Film 5 · 1,100 days")).toBeInTheDocument();
    expect(screen.queryByText(/Film 6/)).not.toBeInTheDocument();
  });

  it("does not claim a dropped show when only films are waiting", async () => {
    mockFetch({
      payload: payload({
        shame: {
          dropped: [],
          stillPlanning: [{ tmdbId: 7, title: "Stalker", days: 892, runtime: 161 }],
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Stalker · 892 days")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/marked dropped/)).not.toBeInTheDocument();
    expect(screen.queryByText(/giving up on those/)).not.toBeInTheDocument();
  });

  it("omits the abandonment panel when nothing was dropped or left waiting", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText("Walked out on")).not.toBeInTheDocument();
  });

  it("omits the niche panel when no films were completed", async () => {
    mockFetch({ payload: payload({ niche: null }) });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/most obscure/i)).not.toBeInTheDocument();
  });

  it("shows the most watched show and the least known film", async () => {
    mockFetch({
      payload: payload({
        topShow: {
          tmdbId: 1, title: "The Bear", posterPath: "/bear.jpg", episodes: 38,
          minutes: 1002, finishedAt: null, alsoTopFor: ["ana", "marcus"],
        },
        niche: {
          tmdbId: 2, title: "Ich war zuhause, aber", posterPath: null,
          popularity: 2.1, medianPopularity: 68, mostPopular: null,
          filmPopularities: Array.from({ length: 31 }, () => 50),
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText("Most watched, and least known"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("38 episodes · 16h 42m")).toBeInTheDocument();
    expect(
      screen.getByText("Also number one for ana and marcus."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(screen.getByText("popularity 2.1")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your most obscure watch — median for your other 30 films was 68",
      ),
    ).toBeInTheDocument();
  });

  it("dates the top show's last episode watched", async () => {
    mockFetch({
      payload: payload({
        topShow: {
          tmdbId: 1, title: "The Bear", posterPath: null, episodes: 38,
          minutes: 1002, finishedAt: "2026-04-04", alsoTopFor: [],
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText("38 episodes · 16h 42m · last watched 4 April"),
      ).toBeInTheDocument(),
    );
  });

  it("titles the panel for whichever half it has", async () => {
    mockFetch({
      payload: payload({
        topShow: {
          tmdbId: 1, title: "The Bear", posterPath: null, episodes: 38,
          minutes: 0, finishedAt: null, alsoTopFor: [],
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Most watched")).toBeInTheDocument(),
    );
    expect(screen.getByText("38 episodes")).toBeInTheDocument();
    expect(screen.queryByText(/Also number one/)).not.toBeInTheDocument();
  });

  it("shows the genre split", async () => {
    mockFetch({
      payload: payload({
        genres: [
          { name: "Drama", percent: 40 },
          { name: "Comedy", percent: 35 },
        ],
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("Genres")).toBeInTheDocument());
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();
  });

  it("describes the biggest day, and why there is no timeline", async () => {
    mockFetch({
      payload: payload({
        soloTickTotal: 12,
        bigDay: {
          date: "2026-03-14", episodes: 11, minutes: 500, timeline: null,
          soloTickCount: 0, streak: null,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText("Saturday 14 March · 11 episodes · 8h 20m"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "Only 12 episodes this year were ticked one at a time — too few to put on a clock.",
      ),
    ).toBeInTheDocument();
  });

  it("spreads the biggest day's solo ticks from first to last", async () => {
    mockFetch({
      payload: payload({
        bigDay: {
          date: "2026-03-14", episodes: 11, minutes: 500,
          timeline: [
            { at: "2026-03-14T10:00:00.000Z" },
            { at: "2026-03-14T14:50:00.000Z" },
            { at: "2026-03-14T19:40:00.000Z" },
          ],
          soloTickCount: 3, streak: null,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(
          "3 of these were ticked one at a time, 9h 40m from first to last.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/too few to put on a clock/)).not.toBeInTheDocument();
  });

  it("ranks the crew by episodes, with the viewer's row from the headline", async () => {
    mockFetch({
      payload: payload({
        crew: [
          { userId: "u1", username: "ana", episodes: 1041 },
          { userId: "u2", username: "marcus", episodes: 760 },
        ],
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("ana")).toBeInTheDocument());
    expect(screen.getByText("marcus")).toBeInTheDocument();
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.getByText("1,208 episodes")).toBeInTheDocument();
    expect(screen.getByText("1,041 episodes")).toBeInTheDocument();
    expect(
      screen.getByText(
        "People you share a list with. Nobody asked to be ranked.",
      ),
    ).toBeInTheDocument();
  });

  it("omits the crew panel when nobody is sharing", async () => {
    mockFetch({ payload: payload({ crew: [] }) });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/The crew/)).not.toBeInTheDocument();
  });

  it("renders the overlap split for a peer", async () => {
    mockFetch({
      payload: payload({
        compare: [
          {
            userId: "u1", username: "ana", onlyYou: 62, both: 34, onlyThem: 28,
            theyFinishedYouDropped: null, bothPlanningNeitherStarted: null,
          },
        ],
      }),
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("34")).toBeInTheDocument());
    expect(screen.getByText("You & ana")).toBeInTheDocument();
    expect(
      screen.getByText("34 titles in common out of 124. A 27% overlap."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/finished, you dropped/)).not.toBeInTheDocument();
  });

  it("compares with the closest peer only, and states the facts it has", async () => {
    mockFetch({
      payload: payload({
        compare: [
          {
            userId: "u1", username: "ana", onlyYou: 62, both: 34, onlyThem: 28,
            theyFinishedYouDropped: "Foundation", bothPlanningNeitherStarted: null,
          },
          {
            userId: "u2", username: "marcus", onlyYou: 90, both: 6, onlyThem: 12,
            theyFinishedYouDropped: null, bothPlanningNeitherStarted: null,
          },
        ],
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("ana finished, you dropped")).toBeInTheDocument(),
    );
    expect(screen.queryByText("You & marcus")).not.toBeInTheDocument();
    expect(screen.queryByText(/On both lists/)).not.toBeInTheDocument();
  });

  it("omits the comparison when there is nobody to compare with", async () => {
    mockFetch({ payload: payload({ compare: [] }) });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/^You &/)).not.toBeInTheDocument();
  });

  it("gives a panel the full row when its partner has nothing to show", async () => {
    mockFetch({
      payload: payload({
        bigDay: {
          date: "2026-03-14", episodes: 11, minutes: 500, timeline: null,
          soloTickCount: 0, streak: null,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Biggest day")).toBeInTheDocument(),
    );
    // No archetype beside the monthly chart, no abandonment beside the big day.
    for (const title of ["Watched by month", "Biggest day"]) {
      const row = screen.getByText(title).closest(".grid");
      expect(row?.children).toHaveLength(1);
      expect(row?.className).not.toMatch(/grid-cols/);
    }
  });

  it("sets two panels side by side when both have something to show", async () => {
    mockFetch({
      payload: payload({
        rhythm: {
          archetype: "completionist",
          weekdayCounts: [1, 1, 1, 1, 1, 1, 1],
          topWeekday: 0,
          lateShare: null,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("The Completionist")).toBeInTheDocument(),
    );
    const row = screen.getByText("Watched by month").closest(".grid");
    expect(row?.children).toHaveLength(2);
    expect(row?.className).toMatch(/lg:grid-cols-\[1\.55fr_1fr\]/);
  });
});
