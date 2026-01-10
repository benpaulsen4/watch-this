import { render, screen } from "@testing-library/react";
import { describe, expect,it } from "vitest";

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
