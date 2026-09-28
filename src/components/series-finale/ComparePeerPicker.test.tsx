import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ComparePeerPicker, useComparePeer } from "./ComparePeerPicker";

const peer = (userId: string, username: string) => ({
  userId,
  username,
  onlyYou: 10,
  both: 5,
  onlyThem: 3,
  theyFinishedYouDropped: null,
  bothPlanningNeitherStarted: null,
});

const compare = [peer("u1", "ana"), peer("u2", "marcus"), peer("u3", "zoe")];

describe("ComparePeerPicker", () => {
  it("offers every peer, the one shown pressed", () => {
    render(
      <ComparePeerPicker peers={compare} selected="u1" onSelect={vi.fn()} />,
    );

    expect(screen.getByText("Swap in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "marcus" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "zoe" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("swaps in the peer tapped", async () => {
    const onSelect = vi.fn();
    render(
      <ComparePeerPicker peers={compare} selected="u1" onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "zoe" }));

    expect(onSelect).toHaveBeenCalledWith("u3");
  });

  it("offers nothing with nobody else to swap in", () => {
    const { container } = render(
      <ComparePeerPicker
        peers={compare.slice(0, 1)}
        selected="u1"
        onSelect={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("sets the story's chips when asked", () => {
    render(
      <ComparePeerPicker
        size="large"
        peers={compare}
        selected="u1"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "marcus" })).toHaveClass(
      "bg-white/10",
    );
  });
});

describe("useComparePeer", () => {
  it("starts on the closest peer and follows a swap", () => {
    const { result } = renderHook(() => useComparePeer(compare));
    expect(result.current[0]?.username).toBe("ana");

    act(() => result.current[1]("u2"));

    expect(result.current[0]?.username).toBe("marcus");
  });

  it("falls back to the closest peer when the one chosen is gone", () => {
    const { result, rerender } = renderHook(
      ({ peers }) => useComparePeer(peers),
      { initialProps: { peers: compare } },
    );
    act(() => result.current[1]("u3"));

    rerender({ peers: compare.slice(0, 2) });

    expect(result.current[0]?.username).toBe("ana");
  });

  it("has nobody to compare with an empty list", () => {
    const { result } = renderHook(() => useComparePeer([]));

    expect(result.current[0]).toBeUndefined();
  });
});
