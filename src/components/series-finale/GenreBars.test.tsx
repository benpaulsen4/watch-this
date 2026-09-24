import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GenreBars } from "./GenreBars";

const genres = [
  { name: "Sci-Fi & Fantasy", percent: 28 },
  { name: "Drama", percent: 22 },
  { name: "Comedy", percent: 17 },
  { name: "Thriller", percent: 14 },
  { name: "Documentary", percent: 9 },
  { name: "Everything else", percent: 10 },
];

describe("GenreBars", () => {
  it("names each genre with its share", () => {
    render(<GenreBars genres={genres} />);

    expect(screen.getByText("Sci-Fi & Fantasy")).toBeInTheDocument();
    expect(screen.getByText("28%")).toBeInTheDocument();
    expect(screen.getByText("Everything else")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("sizes each bar to its share", () => {
    const { container } = render(<GenreBars genres={genres} />);

    const widths = Array.from(
      container.querySelectorAll<HTMLElement>("[data-share]"),
    ).map((bar) => bar.style.width);
    expect(widths).toEqual(["28%", "22%", "17%", "14%", "9%", "10%"]);
  });

  it("leads with the top four and quietens the rest", () => {
    const { container } = render(<GenreBars genres={genres} />);

    const leads = Array.from(
      container.querySelectorAll<HTMLElement>("[data-share]"),
    ).map((bar) => bar.dataset.share);
    expect(leads).toEqual(["lead", "lead", "lead", "lead", "rest", "rest"]);
  });

  it("renders repeated names without complaint", () => {
    render(
      <GenreBars
        genres={[
          { name: "Unknown", percent: 30 },
          { name: "Unknown", percent: 20 },
        ]}
      />,
    );

    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });

  it("sets the story's larger type when asked", () => {
    render(<GenreBars genres={genres} size="large" />);

    expect(screen.getByText("Drama")).toHaveClass("text-[17px]");
    expect(screen.getByText("22%")).toHaveClass("text-[15px]");
  });
});
