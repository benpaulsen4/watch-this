import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BigDayTimeline } from "./BigDayTimeline";

const bigDay = (
  timeline: { at: string }[] | null,
  soloTickCount = timeline?.length ?? 0,
) => ({ timeline, soloTickCount });

describe("BigDayTimeline", () => {
  it("places the solo ticks by elapsed time, with no clock times", () => {
    const { container } = render(
      <BigDayTimeline
        soloTickTotal={120}
        bigDay={bigDay([
          { at: "2026-03-14T10:00:00.000Z" },
          { at: "2026-03-14T14:50:00.000Z" },
          { at: "2026-03-14T19:40:00.000Z" },
        ])}
      />,
    );

    const offsets = Array.from(
      container.querySelectorAll<HTMLElement>("[data-tick]"),
    ).map((tick) => tick.style.left);
    expect(offsets).toEqual(["0%", "50%", "100%"]);
    expect(
      screen.getByText(
        "3 of these were ticked one at a time, 9h 40m from first to last.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("quotes the year's solo ticks when there is no timeline", () => {
    render(<BigDayTimeline soloTickTotal={12} bigDay={bigDay(null, 3)} />);

    expect(
      screen.getByText(
        "Only 12 episodes this year were ticked one at a time — too few to put on a clock.",
      ),
    ).toBeInTheDocument();
  });

  it("does not imply a session from a timeline that spans no time", () => {
    render(
      <BigDayTimeline
        soloTickTotal={80}
        bigDay={bigDay([{ at: "2026-03-14T10:00:00.000Z" }])}
      />,
    );

    expect(
      screen.getByText(
        "Too few of these were ticked one at a time to say how the day went.",
      ),
    ).toBeInTheDocument();
  });

  it("sets the story's larger type when asked", () => {
    render(
      <BigDayTimeline
        size="large"
        soloTickTotal={12}
        bigDay={bigDay(null)}
      />,
    );

    expect(screen.getByText(/Only 12 episodes/)).toHaveClass("text-sm");
  });
});
