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
});
