import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ArchetypeId,
  SeriesFinalePayload,
} from "@/lib/series-finale/types";

import { ArchetypeVisual } from "./ArchetypeVisual";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Payload = SeriesFinalePayload;

const hours = (entries: Record<number, number>) =>
  Array.from({ length: 24 }, (_, hour) => entries[hour] ?? 0);

const months = (counts: number[]) =>
  counts.map((episodes, index) => ({ month: index + 1, episodes }));

const niche = {
  tmdbId: 2,
  title: "Ich war zuhause, aber",
  posterPath: null,
  popularity: 2.1,
  medianPopularity: 12,
  mostPopular: null,
  filmPopularities: [2.1, 12, 30, 8],
};

const payload = (
  archetype: ArchetypeId | null,
  overrides: {
    rhythm?: Partial<Payload["rhythm"]>;
    headline?: Partial<Payload["headline"]>;
  } & Partial<Omit<Payload, "rhythm" | "headline">> = {},
): Payload => {
  const { rhythm, headline, ...rest } = overrides;
  return {
    schemaVersion: 3,
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
      titlesCompleted: 42,
      titlesDropped: 3,
      unknownRuntimeEpisodes: 0,
      percentile: null,
      ...headline,
    },
    episodes: { total: 1208, perDay: 3.3 },
    finished: { films: 30, shows: 12, total: 42 },
    topShow: null,
    niche,
    genres: [
      { name: "Drama", percent: 38 },
      { name: "Comedy", percent: 20 },
    ],
    months: months([0, 0, 40, 0, 0, 0, 0, 20, 19, 0, 0, 1]),
    soloTickTotal: 60,
    bigDay: null,
    rhythm: {
      archetype,
      weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
      topWeekday: 6,
      lateShare: 0.5,
      hourCounts: hours({ 21: 5, 22: 30, 23: 10, 1: 5, 12: 10 }),
      sharedListShare: 0.625,
      topGenreName: "Drama",
      topGenreShare: 0.64,
      ...rhythm,
    },
    shame: { dropped: [], stillPlanning: [] },
    crew: [],
    compare: [],
    thin: false,
    ...rest,
  };
};

const renderVisual = (value: Payload, size: "default" | "large" = "default") =>
  render(<ArchetypeVisual payload={value} size={size} />);

describe("ArchetypeVisual", () => {
  it("draws nothing without an archetype", () => {
    const { container } = renderVisual(payload(null));
    expect(container).toBeEmptyDOMElement();
  });

  describe("weekday marathoner", () => {
    it("draws the weekday strip, larger, with the top day highlighted", () => {
      const { container } = renderVisual(payload("weekday-marathoner"));

      const strip = screen.getByRole("img", {
        name: "Episodes by weekday. Peak Sunday.",
      });
      expect(strip.parentElement).toHaveClass("h-28");
      expect(
        container.querySelector("[data-archetype-visual]"),
      ).toHaveAttribute("data-archetype-visual", "weekday-marathoner");
      const bars = container.querySelectorAll<HTMLElement>("[data-bar]");
      expect(bars).toHaveLength(7);
      expect(bars[6]?.className).toContain("from-red-600");
    });

    it("draws nothing with no episodes to spread over the week", () => {
      const { container } = renderVisual(
        payload("weekday-marathoner", {
          rhythm: { weekdayCounts: [0, 0, 0, 0, 0, 0, 0], topWeekday: null },
        }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("nightly ritualist", () => {
    it("draws 24 hours with the busiest three highlighted", () => {
      const { container } = renderVisual(payload("nightly-ritualist"));

      expect(
        screen.getByRole("img", {
          name: "Episodes ticked one at a time, by hour of the day. Busiest three hours 21:00–00:00: 75% of them.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "21:00–00:00: 75% of the episodes you ticked one at a time",
        ),
      ).toBeInTheDocument();

      const bars = Array.from(
        container.querySelectorAll<HTMLElement>("[data-hour]"),
      );
      expect(bars).toHaveLength(24);
      const highlighted = bars
        .filter((bar) => bar.dataset.busiest === "true")
        .map((bar) => Number(bar.dataset.hour));
      expect(highlighted).toEqual([21, 22, 23]);
      expect(bars[21]?.className).toContain("from-red-600");
      expect(bars[1]?.className).not.toContain("from-red-600");
      // The busiest hour is the full height.
      expect(bars[22]?.style.height).toBe("100%");
      expect(bars[12]?.style.height).toBe("33.3%");
    });

    it("labels the axis in local hours", () => {
      renderVisual(payload("nightly-ritualist"));
      for (const tick of ["00:00", "06:00", "12:00", "18:00"]) {
        expect(screen.getByText(tick)).toBeInTheDocument();
      }
    });

    it("draws nothing below the solo-tick floor", () => {
      const { container } = renderVisual(
        payload("nightly-ritualist", { rhythm: { hourCounts: null } }),
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("draws nothing when no hour has a tick", () => {
      const { container } = renderVisual(
        payload("nightly-ritualist", { rhythm: { hourCounts: hours({}) } }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("one genre only", () => {
    it("draws the title share the type was classified on, not the tag share", () => {
      const { container } = renderVisual(payload("one-genre-only"));

      // genres[0] is Drama at 38% of genre tags; the type is 64% of titles.
      expect(
        screen.getByRole("img", {
          name: "Drama: 64% of what you finished.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Drama: 64% of what you finished"),
      ).toBeInTheDocument();
      expect(
        container.querySelector<HTMLElement>("[data-share-fill]")?.style.width,
      ).toBe("64%");
    });

    it("draws nothing without a top genre", () => {
      const { container } = renderVisual(
        payload("one-genre-only", {
          rhythm: { topGenreName: null, topGenreShare: null },
        }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("deep cut hunter", () => {
    it("draws the film-popularity strip, the niche film first", () => {
      const { container } = renderVisual(payload("deep-cut-hunter"));

      expect(
        screen.getByRole("img", {
          name: "Your 4 films by TMDB popularity, from 2.1 to 30.",
        }),
      ).toBeInTheDocument();
      const bars = container.querySelectorAll<HTMLElement>("[data-popularity]");
      expect(bars[0]?.dataset.popularity).toBe("niche");
      expect(bars[1]?.className).toContain("bg-gray-600");
    });

    it("draws nothing without a niche film", () => {
      const { container } = renderVisual(
        payload("deep-cut-hunter", { niche: null }),
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("draws nothing with too few films to line up", () => {
      const { container } = renderVisual(
        payload("deep-cut-hunter", {
          niche: { ...niche, filmPopularities: [2.1, 40] },
        }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("completionist and serial abandoner", () => {
    it("draws finished against dropped, finished highlighted", () => {
      const { container } = renderVisual(payload("completionist"));

      expect(
        screen.getByRole("img", {
          name: "Titles finished against titles dropped: 42 finished, 3 dropped. Fourteen finished for every one dropped.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("42 finished")).toBeInTheDocument();
      expect(screen.getByText("3 dropped")).toBeInTheDocument();
      expect(
        screen.getByText("Fourteen finished for every one dropped."),
      ).toBeInTheDocument();

      const finished = container.querySelector<HTMLElement>(
        '[data-segment="finished"]',
      );
      const dropped = container.querySelector<HTMLElement>(
        '[data-segment="dropped"]',
      );
      expect(finished?.className).toContain("from-red-600");
      expect(dropped?.className).not.toContain("from-red-600");
      expect(finished?.style.flexGrow).toBe("42");
      expect(dropped?.style.flexGrow).toBe("3");
    });

    it("highlights the dropped side for the serial abandoner", () => {
      const { container } = renderVisual(
        payload("serial-abandoner", {
          headline: { titlesCompleted: 4, titlesDropped: 6 },
        }),
      );

      expect(
        screen.getByText("Three dropped for every two finished."),
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-segment="dropped"]')?.className,
      ).toContain("from-red-600");
      expect(
        container.querySelector('[data-segment="finished"]')?.className,
      ).not.toContain("from-red-600");
    });

    it("leaves out an empty side", () => {
      const { container } = renderVisual(
        payload("completionist", {
          headline: { titlesCompleted: 20, titlesDropped: 0 },
        }),
      );
      expect(screen.getByText("Nothing dropped.")).toBeInTheDocument();
      expect(container.querySelector('[data-segment="dropped"]')).toBeNull();
    });

    it("draws nothing with nothing finished or dropped", () => {
      const { container } = renderVisual(
        payload("completionist", {
          headline: { titlesCompleted: 0, titlesDropped: 0 },
        }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("feast or famine", () => {
    it("draws the months with the feast months highlighted", () => {
      const { container } = renderVisual(payload("feast-or-famine"));

      expect(
        screen.getByRole("img", {
          name: "Episodes and films by month. March and August: 75% of the year's episodes and films.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "March and August: 75% of the year's episodes and films.",
        ),
      ).toBeInTheDocument();
      const highlighted = Array.from(
        container.querySelectorAll<HTMLElement>("[data-bar]"),
      ).flatMap((bar, index) =>
        bar.className.includes("from-red-600") ? [index + 1] : [],
      );
      expect(highlighted).toEqual([3, 8]);
    });

    it("draws nothing with nothing logged", () => {
      const { container } = renderVisual(
        payload("feast-or-famine", {
          months: months(Array.from({ length: 12 }, () => 0)),
        }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("group watcher", () => {
    it("draws the shared-list share as one bar", () => {
      const { container } = renderVisual(payload("group-watcher"));

      expect(
        screen.getByRole("img", {
          name: "63% of what you finished was on a shared list.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("63% of what you finished was on a shared list"),
      ).toBeInTheDocument();
      expect(
        container.querySelector<HTMLElement>("[data-share-fill]")?.style.width,
      ).toBe("63%");
    });

    it("draws nothing when nothing was finished", () => {
      const { container } = renderVisual(
        payload("group-watcher", { rhythm: { sharedListShare: null } }),
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("draws the story's tones at the large size", () => {
    const { container } = renderVisual(payload("deep-cut-hunter"), "large");
    const bars = container.querySelectorAll<HTMLElement>("[data-popularity]");
    expect(bars[1]?.className).toContain("bg-white/30");
  });

  it("puts the caller's spacing on the visual, and only when there is one", () => {
    const { container, rerender } = render(
      <ArchetypeVisual payload={payload("group-watcher")} className="mt-9" />,
    );
    expect(container.firstElementChild).toHaveClass("mt-9");

    rerender(
      <ArchetypeVisual
        payload={payload("group-watcher", {
          rhythm: { sharedListShare: null },
        })}
        className="mt-9"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
