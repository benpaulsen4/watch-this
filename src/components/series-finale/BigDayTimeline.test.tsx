import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BigDayTimeline } from "./BigDayTimeline";

type Point = { at: string; title?: string | null };

const bigDay = (
  timeline: Point[] | null,
  soloTickCount = timeline?.length ?? 0,
) => ({
  timeline:
    timeline?.map((point, index) => ({
      at: point.at,
      title: point.title === undefined ? "The Bear" : point.title,
      episode: `S2E${String(index + 1).padStart(2, "0")}`,
    })) ?? null,
  soloTickCount,
});

/** Each point's position along the axis, as a number of percent. */
const lefts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-point]")).map(
    (point) => Number.parseFloat(point.style.left),
  );

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-point]")).map(
    (point) => point.dataset.row,
  );

const tickLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-tick-label]")).map(
    (label) => label.textContent,
  );

const evening = [
  { at: "2026-03-14T13:05:00.000Z" },
  { at: "2026-03-14T18:20:00.000Z" },
  { at: "2026-03-14T23:35:00.000Z" },
];

describe("BigDayTimeline", () => {
  it("puts the solo ticks on an hour axis from the hour before the first to the hour after the last", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={120}
        timeZone="UTC"
        bigDay={bigDay(evening)}
      />,
    );

    expect(tickLabels(container)).toEqual([
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
      "23:00",
      "00:00",
    ]);
    // 13:00 to 00:00 is 660 minutes.
    const [first, middle, last] = lefts(container);
    expect(first).toBeCloseTo((5 / 660) * 100, 2);
    expect(middle).toBeCloseTo((320 / 660) * 100, 2);
    expect(last).toBeCloseTo((635 / 660) * 100, 2);
    expect(
      screen.getByText(
        "First at 13:05, last at 23:35 · 3 episodes ticked one at a time",
      ),
    ).toBeInTheDocument();
  });

  it("reads the clock in the snapshot's zone, not the browser's", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={120}
        timeZone="Asia/Kolkata"
        bigDay={bigDay(evening)}
      />,
    );

    // +05:30: the first tick is 18:35 there, so the axis opens at 18:00.
    expect(tickLabels(container)[0]).toBe("18:00");
    expect(lefts(container)[0]).toBeCloseTo((35 / 720) * 100, 2);
    expect(
      screen.getByText(
        "First at 18:35, last at 05:05 · 3 episodes ticked one at a time",
      ),
    ).toBeInTheDocument();
  });

  it("names each point by its time, show and episode, spoken and on hover", () => {
    render(
      <BigDayTimeline
        soloTickTotal={120}
        timeZone="UTC"
        bigDay={bigDay([
          evening[0]!,
          { ...evening[1]!, title: null },
          evening[2]!,
        ])}
      />,
    );

    const first = screen.getByRole("img", { name: "13:05 · The Bear S2E01" });
    expect(first).toHaveAttribute("title", "13:05 · The Bear S2E01");
    // No cached title: the time and episode alone, never "Unknown".
    expect(screen.getByRole("img", { name: "18:20 · S2E02" })).toHaveAttribute(
      "title",
      "18:20 · S2E02",
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("img")).toHaveLength(
      3,
    );
  });

  it("stacks points too close to sit side by side", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={120}
        timeZone="UTC"
        bigDay={bigDay([
          { at: "2026-03-14T13:05:00.000Z" },
          { at: "2026-03-14T13:07:00.000Z" },
          { at: "2026-03-14T13:09:00.000Z" },
          { at: "2026-03-14T20:00:00.000Z" },
        ])}
      />,
    );

    expect(rows(container)).toEqual(["0", "1", "2", "0"]);
  });

  it("labels every hour on a wide panel and fewer on a narrow one", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={120}
        timeZone="UTC"
        bigDay={bigDay(evening)}
      />,
    );

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-tick-label]"),
    );
    // Eleven hours: every other label gives way below `lg`.
    expect(
      labels.filter((label) => label.classList.contains("hidden")),
    ).toHaveLength(6);
    expect(labels[0]).not.toHaveClass("hidden");
    expect(labels[1]).toHaveClass("hidden", "lg:block");
  });

  it("gives the story's card only the labels its width holds", () => {
    const { container } = render(
      <BigDayTimeline
        size="large"
        soloTickTotal={120}
        timeZone="UTC"
        bigDay={bigDay(evening)}
      />,
    );

    expect(tickLabels(container)).toEqual([
      "13:00",
      "15:00",
      "17:00",
      "19:00",
      "21:00",
      "23:00",
    ]);
  });

  it("lists the times and episodes when there are too few for an axis", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={80}
        timeZone="UTC"
        bigDay={bigDay([evening[0]!, { ...evening[2]!, title: null }])}
      />,
    );

    expect(screen.getByText("13:05 · The Bear S2E01")).toBeInTheDocument();
    expect(screen.getByText("23:35 · S2E02")).toBeInTheDocument();
    expect(container.querySelector("[data-point]")).toBeNull();
    expect(
      screen.getByText(
        "Too few of these were ticked one at a time to say how the day went.",
      ),
    ).toBeInTheDocument();
  });

  it("says so, and lists nothing, when the day had no solo ticks", () => {
    render(
      <BigDayTimeline soloTickTotal={80} timeZone="UTC" bigDay={bigDay([])} />,
    );

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Too few of these were ticked one at a time to say how the day went.",
      ),
    ).toBeInTheDocument();
  });

  it("quotes the year's solo ticks when there is no timeline", () => {
    render(
      <BigDayTimeline
        soloTickTotal={12}
        timeZone="UTC"
        bigDay={bigDay(null, 3)}
      />,
    );

    expect(
      screen.getByText(
        "Only 12 episodes this year were ticked one at a time — too few to put on a clock.",
      ),
    ).toBeInTheDocument();
  });

  it("sets the story's larger type when asked", () => {
    render(
      <BigDayTimeline
        size="large"
        soloTickTotal={12}
        timeZone="UTC"
        bigDay={bigDay(null)}
      />,
    );

    expect(screen.getByText(/Only 12 episodes/)).toHaveClass("text-sm");
  });
});
