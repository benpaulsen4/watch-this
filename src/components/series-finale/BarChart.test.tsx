import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarChart } from "./BarChart";

describe("BarChart", () => {
  afterEach(() => vi.restoreAllMocks());

  const bars = [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 84 },
    { label: "Mar", value: 174, highlight: true },
  ];

  it("renders one bar per entry with its label", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month, peak March" />);

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Mar")).toBeInTheDocument();
  });

  it("carries a text alternative for the chart as a whole", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month, peak March" />);

    expect(
      screen.getByLabelText("Episodes by month, peak March"),
    ).toBeInTheDocument();
  });

  it("renders without dividing by zero when every value is zero", () => {
    render(
      <BarChart
        bars={[{ label: "Jan", value: 0 }]}
        ariaLabel="Episodes by month"
      />,
    );

    expect(screen.getByText("Jan")).toBeInTheDocument();
  });

  it("renders bars that share a label, such as weekday initials", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <BarChart
        bars={["M", "T", "W", "T", "F", "S", "S"].map((label) => ({
          label,
          value: 1,
        }))}
        ariaLabel="Episodes by weekday"
      />,
    );

    expect(screen.getAllByText("T")).toHaveLength(2);
    expect(screen.getAllByText("S")).toHaveLength(2);
    // React reports duplicate keys through console.error.
    expect(errors).not.toHaveBeenCalled();
  });

  it("draws no axis unless asked", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month" />);

    expect(screen.queryByText("200")).not.toBeInTheDocument();
  });

  it("draws a y-axis rounded up from the peak when asked", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month" axis />);

    for (const tick of ["200", "150", "100", "50", "0"]) {
      expect(screen.getByText(tick)).toBeInTheDocument();
    }
  });

  it("scales bars against the axis top rather than the peak", () => {
    const { container } = render(
      <BarChart bars={bars} ariaLabel="Episodes by month" axis />,
    );

    const heights = Array.from(
      container.querySelectorAll<HTMLElement>("[data-bar]"),
    ).map((bar) => bar.style.height);
    expect(heights).toEqual(["60%", "42%", "87%"]);
  });

  it("keeps a sensible axis when every value is zero", () => {
    render(
      <BarChart
        bars={[{ label: "Jan", value: 0 }]}
        ariaLabel="Episodes by month"
        axis
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
