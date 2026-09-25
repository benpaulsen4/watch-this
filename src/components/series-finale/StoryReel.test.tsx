import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REEL_ORDER, StoryReel } from "./StoryReel";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
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
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: null, niche: null, genres: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
  soloTickTotal: 0,
  bigDay: null,
  rhythm: { archetype: null, weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
  shame: { dropped: [], stillPlanning: [] },
  crew: [], compare: [], thin: false,
  ...overrides,
});

/** Everything present, so every card has something to say. */
const fullPayload = () =>
  payload({
    topShow: { tmdbId: 1, title: "The Bear", posterPath: null, episodes: 38, minutes: 1002, finishedAt: null, alsoTopFor: [] },
    niche: { tmdbId: 2, title: "Ich war zuhause, aber", posterPath: null, popularity: 2.1, medianPopularity: 68, mostPopular: null, filmPopularities: [2.1, 68] },
    genres: [{ name: "Drama", percent: 40 }],
    bigDay: { date: "2026-03-14", episodes: 11, minutes: 500, timeline: null, soloTickCount: 0, streak: null },
    rhythm: { archetype: "completionist", weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
    shame: { dropped: [{ tmdbId: 1, title: "Foundation", lastEpisode: null }], stillPlanning: [] },
    crew: [{ userId: "u2", username: "ana", episodes: 1041 }],
    compare: [{ userId: "u2", username: "ana", onlyYou: 62, both: 34, onlyThem: 28, theyFinishedYouDropped: null, bothPlanningNeitherStarted: null }],
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

const renderReel = () =>
  render(<StoryReel period="2026" user={viewer} />, { wrapper });

const currentCard = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-card]")?.dataset.card;

/** Steps to the end with ArrowRight, recording each card shown. */
const walk = async (container: HTMLElement) => {
  const seen = [currentCard(container)];
  for (let step = 0; step < REEL_ORDER.length + 2; step += 1) {
    await userEvent.keyboard("{ArrowRight}");
    const card = currentCard(container);
    if (card === seen[seen.length - 1]) break;
    seen.push(card);
  }
  return seen;
};

/**
 * The first ancestor that would cut a tall card short: one that hides or clips
 * vertical overflow, or pins the card to the viewport's height. jsdom has no
 * layout, so this reads the classes that would.
 */
const clippingAncestor = (element: HTMLElement) => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (
      /(^|\s)(overflow-(y-)?(hidden|clip)|h-dvh|h-screen)(\s|$)/.test(
        node.className,
      )
    ) {
      return node.className;
    }
  }
  return null;
};

/** Steps forward until the named card is showing. */
const advanceTo = async (container: HTMLElement, card: string) => {
  for (let step = 0; step < REEL_ORDER.length; step += 1) {
    if (currentCard(container) === card) return;
    await userEvent.keyboard("{ArrowRight}");
  }
  throw new Error(`never reached ${card}`);
};

beforeEach(() => push.mockClear());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StoryReel", () => {
  it("opens on the intro card", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() =>
      expect(screen.getByText("Series Finale")).toBeInTheDocument(),
    );
  });

  it("advances on ArrowRight", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  });

  it("goes back on ArrowLeft", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowLeft}");

    await waitFor(() =>
      expect(screen.getByText("Series Finale")).toBeInTheDocument(),
    );
  });

  it("advances and goes back on the tap zones", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(screen.getByText("412")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous card" }));
    expect(screen.getByText("Series Finale")).toBeInTheDocument();
  });

  it("skips cards whose payload slice is null", async () => {
    mockFetch({ payload: payload({ topShow: null, niche: null }) });
    const { container } = renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());

    expect(screen.getAllByRole("progressbar")).toHaveLength(6);
    expect(await walk(container)).toEqual([
      "intro", "hours", "episodes", "finished", "months", "summary",
    ]);
  });

  it("plays every card, in the mock's order, when the payload has them all", async () => {
    mockFetch({ payload: fullPayload() });
    const { container } = renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());

    expect(await walk(container)).toEqual([...REEL_ORDER]);
    expect(REEL_ORDER).toEqual([
      "intro", "hours", "episodes", "finished", "topShow", "niche", "genres",
      "months", "bigDay", "rhythm", "shame", "crew", "compare", "summary",
    ]);
  });

  it("never cuts a tall card short: attribution and controls stay reachable", async () => {
    const full = fullPayload();
    mockFetch({
      payload: {
        ...full,
        compare: [
          ...full.compare,
          { userId: "u3", username: "marcus", onlyYou: 80, both: 10, onlyThem: 40, theyFinishedYouDropped: null, bothPlanningNeitherStarted: null },
        ],
      },
    });
    const { container } = renderReel();
    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());

    for (const card of ["topShow", "niche", "genres", "shame", "compare"]) {
      await advanceTo(container, card);
      expect(clippingAncestor(screen.getByAltText("TMDB"))).toBeNull();
    }
    expect(
      clippingAncestor(screen.getByRole("button", { name: "marcus" })),
    ).toBeNull();
    // The chrome still works from a grown page.
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(14);
  });

  it("stays put at either end rather than wrapping", async () => {
    mockFetch({ payload: payload() });
    const { container } = renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowLeft}");
    expect(currentCard(container)).toBe("intro");

    await walk(container);
    await userEvent.keyboard("{ArrowRight}");
    expect(currentCard(container)).toBe("summary");
  });

  it("marks the progress bars up to the current card", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowRight}");

    const values = screen
      .getAllByRole("progressbar")
      .map((bar) => bar.getAttribute("aria-valuenow"));
    expect(values).toEqual(["1", "1", "0", "0", "0", "0"]);
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar).toHaveAttribute("aria-valuemax", "1");
    }
  });

  it("exposes a close control with an accessible name", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument(),
    );
  });

  it("closes to the recap page, by button or Escape", async () => {
    mockFetch({ payload: payload() });
    renderReel();

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(push).toHaveBeenLastCalledWith("/series-finale/2026");

    push.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(push).toHaveBeenLastCalledWith("/series-finale/2026");
  });

  it("renders the thin-year card instead of the reel for a thin period", async () => {
    mockFetch({ payload: payload({ thin: true }) });
    renderReel();

    await waitFor(() =>
      expect(screen.getByText(/Not much of a 2026/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("says plainly when the period is not available", async () => {
    mockFetchStatus(404);
    renderReel();

    await waitFor(() =>
      expect(screen.getByText("No Series Finale for 2026")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("offers a retry for any other failure", async () => {
    mockFetchStatus(500);
    renderReel();

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Series Finale for 2026"),
    ).not.toBeInTheDocument();
  });
});
