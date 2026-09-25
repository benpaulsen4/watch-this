import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrewRanking } from "./CrewRanking";

const member = (username: string, episodes: number) => ({
  userId: `id-${username}`,
  username,
  episodes,
});

const crew = [member("ana", 1041), member("marcus", 760)];

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

  it("puts the viewer first on a tie", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 1041 }}
        crew={crew}
      />,
    );

    expect(names()).toEqual(["you", "ana", "marcus"]);
  });

  it("gives a tie one rank and skips the next, so the viewer is not above anyone they tied", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 1041 }}
        crew={[member("ana", 1041), member("marcus", 760), member("bo", 760)]}
        size="large"
      />,
    );

    expect(names()).toEqual(["you", "ana", "marcus", "bo"]);
    const ranks = Array.from(container.querySelectorAll("[data-rank]")).map(
      (rank) => rank.textContent,
    );
    expect(ranks).toEqual(["1", "1", "3", "3"]);
  });

  it("sizes each bar against the leader", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 400 }}
        crew={[member("ana", 100)]}
      />,
    );

    expect(barWidths(container)).toEqual(["100%", "25%"]);
  });

  it("draws empty bars rather than dividing by zero", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 0 }}
        crew={[member("ana", 0)]}
      />,
    );

    expect(barWidths(container)).toEqual(["0%", "0%"]);
  });

  it("draws the story's numbered rows without bars when asked", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 900 }}
        crew={crew}
        size="large"
      />,
    );

    expect(names()).toEqual(["ana", "you", "marcus"]);
    const ranks = Array.from(container.querySelectorAll("[data-rank]")).map(
      (rank) => rank.textContent,
    );
    expect(ranks).toEqual(["1", "2", "3"]);
    expect(barWidths(container)).toEqual([]);
    expect(screen.getByText("900 episodes")).toBeInTheDocument();
  });

  it("lists the top rows plus the viewer when limited, counting the rest", () => {
    const { container } = render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 10 }}
        crew={[
          member("a1", 900), member("a2", 800), member("a3", 700),
          member("a4", 600), member("a5", 500), member("a6", 400),
          member("a7", 300),
        ]}
        size="large"
        limit={5}
      />,
    );

    expect(names()).toEqual(["a1", "a2", "a3", "a4", "a5", "you"]);
    const ranks = Array.from(container.querySelectorAll("[data-rank]")).map(
      (rank) => rank.textContent,
    );
    expect(ranks).toEqual(["1", "2", "3", "4", "5", "8"]);
    expect(screen.getByText("And two more.")).toBeInTheDocument();
  });

  it("needs no extra row when the viewer is already in the top rows", () => {
    render(
      <CrewRanking
        viewer={{ username: "ben", profilePictureUrl: "", episodes: 1000 }}
        crew={[
          member("a1", 900), member("a2", 800), member("a3", 700),
          member("a4", 600), member("a5", 500),
        ]}
        limit={5}
      />,
    );

    expect(names()).toEqual(["you", "a1", "a2", "a3", "a4"]);
    expect(screen.getByText("And one more.")).toBeInTheDocument();
  });
});
