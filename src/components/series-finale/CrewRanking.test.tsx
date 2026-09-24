import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrewRanking } from "./CrewRanking";

const crew = [
  {
    userId: "u1",
    username: "ana",
    episodes: 1041,
    hours: 358,
    topShowTmdbId: null,
  },
  {
    userId: "u2",
    username: "marcus",
    episodes: 760,
    hours: 241,
    topShowTmdbId: null,
  },
];

const names = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("[data-name]")?.textContent);

describe("CrewRanking", () => {
  it("ranks the viewer among the crew by hours", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", hours: 300 }}
        crew={crew}
      />,
    );

    expect(names()).toEqual(["ana", "you", "marcus"]);
    expect(screen.getByText("358h")).toBeInTheDocument();
    expect(screen.getByText("300h")).toBeInTheDocument();
  });

  it("puts the viewer first on a tie", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", hours: 358 }}
        crew={crew}
      />,
    );

    expect(names()).toEqual(["you", "ana", "marcus"]);
  });

  it("sizes each bar against the leader", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", hours: 400 }}
        crew={[
          {
            userId: "u1",
            username: "ana",
            episodes: 10,
            hours: 100,
            topShowTmdbId: null,
          },
        ]}
      />,
    );

    const widths = Array.from(
      container.querySelectorAll<HTMLElement>("[data-hours-bar]"),
    ).map((bar) => bar.style.width);
    expect(widths).toEqual(["100%", "25%"]);
  });

  it("draws empty bars rather than dividing by zero", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", hours: 0 }}
        crew={[
          {
            userId: "u1",
            username: "ana",
            episodes: 0,
            hours: 0,
            topShowTmdbId: null,
          },
        ]}
      />,
    );

    const widths = Array.from(
      container.querySelectorAll<HTMLElement>("[data-hours-bar]"),
    ).map((bar) => bar.style.width);
    expect(widths).toEqual(["0%", "0%"]);
  });
});
