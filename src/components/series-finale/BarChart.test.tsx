import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "./BarChart";

describe("BarChart", () => {
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

  it("does not render a caption when none is given", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month, peak March" />);

    expect(screen.queryByText(/Peak:/)).not.toBeInTheDocument();
  });

  it("renders an optional caption, e.g. naming the peak month", () => {
    render(
      <BarChart
        bars={bars}
        ariaLabel="Episodes by month, peak March"
        caption="Peak: March, 174"
      />,
    );

    expect(screen.getByText("Peak: March, 174")).toBeInTheDocument();
  });
});
