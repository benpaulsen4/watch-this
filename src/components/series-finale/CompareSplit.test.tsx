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

  it("never clips the peer's label: it wraps instead of truncating", () => {
    for (const size of ["default", "large"] as const) {
      const { unmount } = render(<CompareSplit peer={peer} size={size} />);

      const label = screen.getByText("only ana");
      // `truncate` clipped the last glyph's ink at DPR 2 ("e2e_bo" read "e2e_bc").
      expect(label).not.toHaveClass("truncate");
      expect(label).not.toHaveClass("overflow-hidden");
      expect(label).toHaveClass("[overflow-wrap:anywhere]");
      unmount();
    }
  });

  it("sets a name too long for its disc beneath the disc, whole", () => {
    const username = "e2e_flo_watches_only_films_and_has_a_long_name";
    for (const size of ["default", "large"] as const) {
      const { unmount } = render(
        <CompareSplit peer={{ ...peer, username }} size={size} />,
      );

      const label = screen.getByText(`only ${username}`);
      expect(label.closest("[data-disc]")).toBeNull();
      expect(label).toHaveClass("[overflow-wrap:anywhere]");
      // The count stays in its disc.
      expect(screen.getByText("28").closest("[data-disc]")).not.toBeNull();
      unmount();
    }
  });

  it("keeps a short name inside its disc", () => {
    render(<CompareSplit peer={peer} />);

    expect(screen.getByText("only ana").closest("[data-disc]")).not.toBeNull();
  });

  it("draws the recap's discs by default", () => {
    render(<CompareSplit peer={peer} />);

    expect(screen.getByText("62").closest("[data-disc]")).toHaveClass(
      "h-[108px]",
    );
    expect(screen.getByText("34").closest("[data-disc]")).toHaveClass(
      "h-[72px]",
    );
  });

  it("draws the story's larger discs when asked", () => {
    render(<CompareSplit peer={peer} size="large" />);

    expect(screen.getByText("62").closest("[data-disc]")).toHaveClass("h-32");
    expect(screen.getByText("34").closest("[data-disc]")).toHaveClass(
      "h-[88px]",
    );
    expect(screen.getByText("28").closest("[data-disc]")).toHaveClass("h-32");
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
