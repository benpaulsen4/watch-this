import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompareFacts, CompareSplit } from "./CompareSplit";

const peer = {
  userId: "u1",
  username: "ana",
  onlyYou: 62,
  both: 34,
  onlyThem: 28,
  theyFinishedYouDropped: null,
  bothPlanningNeitherStarted: null,
};

/** Every element from `element` up to (not including) `root`. */
const ancestors = (element: HTMLElement, root: HTMLElement) => {
  const chain: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = element;
    node && node !== root;
    node = node.parentElement
  ) {
    chain.push(node);
  }
  return chain;
};

describe("CompareSplit", () => {
  it("shows what only you, both, and only they finished", () => {
    render(<CompareSplit peer={peer} />);

    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("only you")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("both")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("only ana")).toBeInTheDocument();
  });

  it("sets each label under its own number, one region per third", () => {
    const { container } = render(<CompareSplit peer={peer} />);

    const regions = Array.from(
      container.querySelectorAll<HTMLElement>("[data-region]"),
    );
    expect(regions.map((region) => region.textContent)).toEqual([
      "62only you",
      "34both",
      "28only ana",
    ]);
    // Three equal columns: the left lune, the lens and the right lune.
    expect(regions[0]!.parentElement).toHaveClass("grid-cols-3");
    for (const [count, label] of [
      ["62", "only you"],
      ["34", "both"],
      ["28", "only ana"],
    ] as const) {
      // The number directly above its label, as the e2e reads it.
      expect(screen.getByText(label).previousElementSibling).toHaveTextContent(
        count,
      );
    }
  });

  it("never clips the peer's label, however long: it wraps", () => {
    const username = "e2e_flo_watches_only_films_and_has_a_long_name_WWWW";
    for (const size of ["default", "large"] as const) {
      for (const name of ["ana", username]) {
        const { container, unmount } = render(
          <CompareSplit peer={{ ...peer, username: name }} size={size} />,
        );

        const label = screen.getByText(`only ${name}`);
        expect(label).toHaveClass("[overflow-wrap:anywhere]");
        // `truncate` clipped the last glyph's ink at DPR 2 ("e2e_bo" read
        // "e2e_bc"); nothing between the label and the page may cut it.
        for (const element of ancestors(label, container)) {
          expect(element).not.toHaveClass("truncate");
          expect(element).not.toHaveClass("overflow-hidden");
        }
        // A long name is placed exactly as a short one: no length rule.
        expect(label.closest("[data-region]")).toHaveTextContent(
          `28only ${name}`,
        );
        unmount();
      }
    }
  });

  it("draws the discs as a picture the page reads as numbers", () => {
    const { container } = render(<CompareSplit peer={peer} />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("circle")).toHaveLength(2);
    expect(svg?.querySelector("path")).not.toBeNull();
  });

  it("draws the recap's size by default and the story's when asked", () => {
    const { container, unmount } = render(<CompareSplit peer={peer} />);
    expect(container.firstElementChild).toHaveClass("max-w-[25rem]");
    unmount();

    const large = render(<CompareSplit peer={peer} size="large" />);
    expect(large.container.firstElementChild).toHaveClass("max-w-[18rem]");
  });
});

describe("CompareFacts", () => {
  it("names the peer, never a pronoun", () => {
    render(
      <CompareFacts
        peer={{
          ...peer,
          theyFinishedYouDropped: "Foundation",
          bothPlanningNeitherStarted: "Dune: Part Two",
        }}
      />,
    );

    expect(screen.getByText("ana finished, you dropped")).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(
      screen.getByText("On both lists, neither started"),
    ).toBeInTheDocument();
    expect(screen.getByText("Dune: Part Two")).toBeInTheDocument();
  });

  it("renders nothing without a fact to state", () => {
    const { container } = render(<CompareFacts peer={peer} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("boxes each fact on the story's card when asked", () => {
    render(
      <CompareFacts
        size="large"
        peer={{ ...peer, theyFinishedYouDropped: "Foundation" }}
      />,
    );

    expect(
      screen.getByText("ana finished, you dropped").closest("[data-fact]"),
    ).toHaveClass("rounded-[11px]");
  });
});
