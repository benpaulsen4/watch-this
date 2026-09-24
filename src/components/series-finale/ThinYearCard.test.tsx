import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThinYearCard } from "./ThinYearCard";

describe("ThinYearCard", () => {
  it("states what is missing rather than showing an empty story", () => {
    render(<ThinYearCard label="2026" episodes={9} titles={2} />);

    expect(screen.getByText(/9 episodes/)).toBeInTheDocument();
    expect(screen.getByText(/2 titles/)).toBeInTheDocument();
  });

  it("uses no exclamation marks, per the voice guide", () => {
    const { container } = render(
      <ThinYearCard label="2026" episodes={9} titles={2} />,
    );

    expect(container.textContent).not.toContain("!");
  });

  it("pluralizes a single episode and title correctly", () => {
    render(<ThinYearCard label="2026" episodes={1} titles={1} />);

    expect(screen.getByText(/1 episode\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 title\b/)).toBeInTheDocument();
    expect(screen.queryByText(/1 episodes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 titles/)).not.toBeInTheDocument();
  });
});
