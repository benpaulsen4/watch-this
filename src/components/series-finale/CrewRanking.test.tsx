import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrewRanking } from "./CrewRanking";

const member = (username: string, episodes: number, hours: number) => ({
  userId: `id-${username}`,
  username,
  episodes,
  hours,
  topShowTmdbId: null,
});

const crew = [member("ana", 1041, 358), member("marcus", 760, 241)];

const names = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("[data-name]")?.textContent);

const barWidths = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>("[data-episodes-bar]"),
  ).map((bar) => bar.style.width);

describe("CrewRanking", () => {
  it("ranks the viewer among the crew by episodes", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 900 }}
        crew={crew}
      />,
    );

    expect(names()).toEqual(["ana", "you", "marcus"]);
    expect(screen.getByText("1,041 episodes")).toBeInTheDocument();
    expect(screen.getByText("900 episodes")).toBeInTheDocument();
  });

  it("ranks by episodes even where hours would disagree", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 100 }}
        crew={[member("tom", 50, 900), member("ana", 80, 20)]}
      />,
    );

    expect(names()).toEqual(["you", "ana", "tom"]);
  });

  it("puts the viewer first on a tie", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 1041 }}
        crew={crew}
      />,
    );

    expect(names()).toEqual(["you", "ana", "marcus"]);
  });

  it("sizes each bar against the leader", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 400 }}
        crew={[member("ana", 100, 10)]}
      />,
    );

    expect(barWidths(container)).toEqual(["100%", "25%"]);
  });

  it("draws empty bars rather than dividing by zero", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 0 }}
        crew={[member("ana", 0, 0)]}
      />,
    );

    expect(barWidths(container)).toEqual(["0%", "0%"]);
  });
});
