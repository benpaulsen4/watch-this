import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentCardSkeleton } from "./ContentCardSkeleton";

describe("ContentCardSkeleton", () => {
  it("renders loading card with accessible label", () => {
    render(<ContentCardSkeleton />);
    const card = screen.getByLabelText("Loading content");
    expect(card).toBeInTheDocument();
    // Contains placeholder artwork (Play icon container)
    expect(card.querySelector(".h-64.w-full")).toBeTruthy();
  });
});
