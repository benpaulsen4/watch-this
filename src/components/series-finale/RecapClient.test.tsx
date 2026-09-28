import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecapClient } from "./RecapClient";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const viewer = { username: "ben", profilePictureUrl: "" };

const payload = (overrides: Record<string, unknown> = {}) => ({
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
    titlesDropped: 0,
    unknownRuntimeEpisodes: 0,
    percentile: 4,
  },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: null,
  niche: null,
  genres: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 0 })),
  soloTickTotal: 0,
  bigDay: null,
  rhythm: {
    archetype: null,
    weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
    topWeekday: null,
    lateShare: null,
    hourCounts: null,
    sharedListShare: null,
  },
  shame: { dropped: [], stillPlanning: [] },
  crew: [],
  compare: [],
  thin: false,
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

/** A phone-width (or desktop) viewport, as `usePhoneViewport` reads it. */
const mockViewport = (phone: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: phone,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );

beforeEach(() => replace.mockClear());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RecapClient on a phone", () => {
  it("sends a story not yet gone through to the story, recap unseen", async () => {
    mockViewport(true);
    mockFetch({ payload: payload(), storyCompletedAt: null });
    renderRecap();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/series-finale/2026/story"),
    );
    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("412")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    // The header's title and way back only: nothing of the year, and no
    // Share to prefetch a card for a page that is being left.
    expect(
      screen.getByRole("heading", { name: "Series Finale 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Play as story" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("shows nothing of the recap while the year is still loading", async () => {
    mockViewport(true);
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderRecap();

    expect(screen.getByText("Putting your year together")).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Series Finale 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Play as story" }),
    ).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the recap once the story has been gone through", async () => {
    mockViewport(true);
    mockFetch({
      payload: payload(),
      storyCompletedAt: "2027-01-02T10:00:00.000Z",
    });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a thin year's recap, which has no story to finish", async () => {
    mockViewport(true);
    mockFetch({ payload: payload({ thin: true }), storyCompletedAt: null });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("Not much of a 2026")).toBeInTheDocument(),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("says when the period is unavailable rather than sending it on", async () => {
    mockViewport(true);
    mockFetchStatus(404);
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("No Series Finale for 2026")).toBeInTheDocument(),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("still sends the story on once a failed load is retried", async () => {
    mockViewport(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ payload: payload(), storyCompletedAt: null }),
        }),
    );
    renderRecap();

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/series-finale/2026/story"),
    );
    expect(screen.queryByText("412")).not.toBeInTheDocument();
  });

  it("keeps a recap it has shown, even if the completion is rolled back", async () => {
    mockViewport(true);
    mockFetch({
      payload: payload(),
      storyCompletedAt: "2027-01-02T10:00:00.000Z",
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RecapClient period="2026" user={viewer} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());

    // What `useCompleteStory` does when its POST fails.
    act(() => {
      client.setQueryData(["series-finale", "2026"], {
        payload: payload(),
        storyCompletedAt: null,
      });
    });

    expect(screen.getByText("412")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("RecapClient on a desktop", () => {
  it("carries its header from the first render, before the viewport is known", () => {
    // The server (and hydration) render has no viewport: a full page load
    // spends that render waiting, and must not do it header-less (G1).
    const client = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={client}>
        <RecapClient period="2026" user={viewer} />
      </QueryClientProvider>,
    );

    expect(html).toContain("Series Finale 2026");
    expect(html).toContain('aria-label="Back to profile"');
    expect(html).toContain("Putting your year together");
    expect(html).not.toContain("<main");
  });

  it("never sends anyone to the story", async () => {
    mockViewport(false);
    mockFetch({ payload: payload(), storyCompletedAt: null });
    renderRecap();

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
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
        headline: {
          hours: 0,
          minutes: 0,
          episodes: 9,
          titlesCompleted: 2,
          titlesDropped: 0,
          unknownRuntimeEpisodes: 0,
          percentile: null,
        },
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
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("omits the percentile line when there is no cohort", async () => {
    mockFetch({
      payload: payload({
        headline: {
          hours: 412,
          minutes: 24720,
          episodes: 1208,
          titlesCompleted: 47,
          titlesDropped: 0,
          unknownRuntimeEpisodes: 0,
          percentile: null,
        },
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
        headline: {
          hours: 412,
          minutes: 24720,
          episodes: 1208,
          titlesCompleted: 47,
          titlesDropped: 0,
          unknownRuntimeEpisodes: 0,
          percentile: 96,
        },
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
      expect(
        screen.getByText(/not endorsed or certified by TMDB/),
      ).toBeInTheDocument(),
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

  it("wraps a long username in the hero rather than letting it run off", async () => {
    mockFetch({ payload: payload() });
    render(
      <RecapClient
        period="2026"
        user={{
          username: "e2e_flo_watches_only_films_and_has_a_long_name",
          profilePictureUrl: "",
        }}
      />,
      { wrapper },
    );

    expect(
      await screen.findByText(/^e2e_flo_watches_only_films_and_has_a_long_name ·/),
    ).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("names each month by its initial below sm, where three letters do not fit", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await screen.findByRole("img", { name: /by month/ });
    const july = screen.getByText("Jul");
    expect(july).toHaveClass("hidden", "sm:inline");
    expect(july.previousElementSibling).toHaveTextContent("J");
    expect(july.previousElementSibling).toHaveClass("sm:hidden");
  });

  it("dates the year from its label, not from the snapshot's instants", async () => {
    mockFetch({
      payload: payload({
        // Bounds localised to Auckland at generation: read in UTC they would
        // start on 31 December.
        period: {
          start: "2025-12-31T11:00:00.000Z",
          end: "2026-12-31T11:00:00.000Z",
          label: "2026",
          timezone: "Pacific/Auckland",
        },
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
        rhythm: {
          archetype: null,
          weekdayCounts: [1, 1, 1, 1, 1, 1, 6],
          topWeekday: 6,
          lateShare: 0.7,
          hourCounts: null,
          sharedListShare: null,
        },
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
        headline: {
          hours: 412,
          minutes: 24720,
          episodes: 1208,
          titlesCompleted: 47,
          titlesDropped: 0,
          unknownRuntimeEpisodes: 14,
          percentile: 4,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(
        screen.getByText(
          /Excludes 14 episodes or films with no runtime on TMDB/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it("renders the stat row, dating the streak", async () => {
    mockFetch({
      payload: payload({
        bigDay: {
          date: "2026-03-14",
          episodes: 11,
          minutes: 500,
          timeline: null,
          soloTickCount: 0,
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

  it("offers to share the card beside Play as story", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument(),
    );
  });

  it("folds the header's actions to icons below sm, so the title fits beside them", async () => {
    mockFetch({ payload: payload() });
    renderRecap();

    const story = await screen.findByRole("link", { name: "Play as story" });
    expect(screen.getByText("Play as story")).toHaveClass(
      "sr-only",
      "sm:not-sr-only",
    );
    expect(story.querySelector("svg")).toHaveClass("sm:hidden");
    expect(screen.getByText("Share")).toHaveClass("sr-only", "sm:not-sr-only");
  });

  it("says a card could not be made below the header, not inside it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/card")
            ? { ok: false, status: 500 }
            : { ok: true, json: async () => ({ payload: payload() }) },
        ),
      ),
    );
    renderRecap();

    await userEvent.click(
      await screen.findByRole("button", { name: "Share" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "That card could not be made. Try again in a moment.",
    );
    expect(screen.getByRole("banner")).not.toContainElement(alert);
    // The Share button stays where it was.
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("button", { name: "Share" }),
    );
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

  it("offers a retry for any other failure, and retrying loads the recap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ payload: payload() }),
      });
    vi.stubGlobal("fetch", fetchMock);
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Series Finale for 2026"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    // The Share button mounts once the retry succeeds and prefetches its own
    // card on a separate endpoint, so this counts the payload fetch alone.
    const payloadCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/series-finale/2026",
    );
    expect(payloadCalls).toHaveLength(2);
  });

  it("renders the archetype with the user's actual top weekday", async () => {
    mockFetch({
      payload: payload({
        rhythm: {
          archetype: "weekday-marathoner",
          weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
          topWeekday: 6,
          lateShare: 0.41,
          hourCounts: null,
          sharedListShare: null,
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
            tmdbId: i,
            title: `Show ${i + 1}`,
            lastEpisode: "S1E02",
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
            tmdbId: 100 + i,
            title: `Film ${i + 1}`,
            days: 1104 - i,
            runtime: 120,
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
          stillPlanning: [
            { tmdbId: 7, title: "Stalker", days: 892, runtime: 161 },
          ],
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
          tmdbId: 1,
          title: "The Bear",
          posterPath: "/bear.jpg",
          episodes: 38,
          minutes: 1002,
          finishedAt: null,
          alsoTopFor: ["ana", "marcus"],
        },
        niche: {
          tmdbId: 2,
          title: "Ich war zuhause, aber",
          posterPath: null,
          popularity: 2.1,
          medianPopularity: 68,
          mostPopular: null,
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
    // The poster is decorative beside its visible title, so it is not read
    // out twice.
    expect(screen.queryByAltText("The Bear")).not.toBeInTheDocument();
    expect(
      screen.getByText("The Bear").closest("div")?.querySelector('img[alt=""]'),
    ).not.toBeNull();
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(screen.getByText("popularity 2.1")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your most obscure watch — median for your other 30 films was 68",
      ),
    ).toBeInTheDocument();
  });

  it("holds the posters to 7rem from lg, so their card is no taller than Genres", async () => {
    mockFetch({
      payload: payload({
        niche: {
          tmdbId: 2,
          title: "Heat",
          posterPath: "/heat.jpg",
          popularity: 2.1,
          medianPopularity: 68,
          mostPopular: null,
          filmPopularities: [2.1, 68],
        },
      }),
    });
    renderRecap();

    const poster = (await screen.findByText("Heat"))
      .closest("div")
      ?.querySelector('img[alt=""]')
      ?.closest(".aspect-\\[2\\/3\\]");
    expect(poster).toHaveClass("lg:w-28");
  });

  it("dates the top show's last episode watched", async () => {
    mockFetch({
      payload: payload({
        topShow: {
          tmdbId: 1,
          title: "The Bear",
          posterPath: null,
          episodes: 38,
          minutes: 1002,
          finishedAt: "2026-04-04",
          alsoTopFor: [],
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
          tmdbId: 1,
          title: "The Bear",
          posterPath: null,
          episodes: 38,
          minutes: 0,
          finishedAt: null,
          alsoTopFor: [],
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
          date: "2026-03-14",
          episodes: 11,
          minutes: 500,
          timeline: null,
          soloTickCount: 0,
          streak: null,
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
          date: "2026-03-14",
          episodes: 11,
          minutes: 500,
          timeline: [
            { at: "2026-03-14T10:00:00.000Z", title: "The Bear", episode: "S2E01" },
            { at: "2026-03-14T14:50:00.000Z", title: "The Bear", episode: "S2E02" },
            { at: "2026-03-14T19:40:00.000Z", title: "The Bear", episode: "S2E03" },
          ],
          soloTickCount: 3,
          streak: null,
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
    expect(
      screen.queryByText(/too few to put on a clock/),
    ).not.toBeInTheDocument();
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
            userId: "u1",
            username: "ana",
            onlyYou: 62,
            both: 34,
            onlyThem: 28,
            theyFinishedYouDropped: null,
            bothPlanningNeitherStarted: null,
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
            userId: "u1",
            username: "ana",
            onlyYou: 62,
            both: 34,
            onlyThem: 28,
            theyFinishedYouDropped: "Foundation",
            bothPlanningNeitherStarted: null,
          },
          {
            userId: "u2",
            username: "marcus",
            onlyYou: 90,
            both: 6,
            onlyThem: 12,
            theyFinishedYouDropped: null,
            bothPlanningNeitherStarted: null,
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
          date: "2026-03-14",
          episodes: 11,
          minutes: 500,
          timeline: null,
          soloTickCount: 0,
          streak: null,
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
      // One explicit, shrinkable column: a wide chart cannot widen the page.
      expect(row).toHaveClass("grid-cols-1");
      expect(row?.className).not.toMatch(/lg:grid-cols/);
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
          hourCounts: null,
          sharedListShare: null,
        },
      }),
    });
    renderRecap();

    await waitFor(() =>
      expect(screen.getByText("The Completionist")).toBeInTheDocument(),
    );
    const row = screen.getByText("Watched by month").closest(".grid");
    expect(row?.children).toHaveLength(2);
    // One column below lg; from lg, the mock's 1.55 : 1 in columns that may
    // shrink below their content's width (F1).
    expect(row).toHaveClass(
      "grid-cols-1",
      "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]",
    );
  });

  it("gives every row of panels one shrinkable column below lg", async () => {
    mockFetch({
      payload: payload({
        genres: [{ name: "Drama", percent: 100 }],
        niche: {
          tmdbId: 1,
          title: "Heat",
          posterPath: null,
          popularity: 1.2,
          medianPopularity: 20,
          mostPopular: null,
          filmPopularities: [1.2, 20, 30],
        },
        crew: [{ userId: "u2", username: "ana", episodes: 10 }],
        compare: [
          {
            userId: "u2",
            username: "ana",
            onlyYou: 1,
            both: 1,
            onlyThem: 1,
            theyFinishedYouDropped: null,
            bothPlanningNeitherStarted: null,
          },
        ],
      }),
    });
    renderRecap();

    for (const title of ["Least known", "The crew"]) {
      const row = (await screen.findByText(title)).closest(".grid");
      expect(row).toHaveClass("grid-cols-1", "lg:grid-cols-2");
    }
  });
});
