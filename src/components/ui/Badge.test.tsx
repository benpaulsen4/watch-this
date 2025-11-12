import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";
import { describe, it, expect } from "vitest";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("merges custom class and applies variant styles", () => {
    const { container } = render(
      <Badge variant="success" className="custom-class">
        Badge
      </Badge>
    );
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass("custom-class");
    expect(badge.className).toMatch(/bg-green-600/);
  });
});
