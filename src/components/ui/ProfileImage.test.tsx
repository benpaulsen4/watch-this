import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileImage } from "@/components/ui/ProfileImage";
import { describe, it, expect } from "vitest";

describe("ProfileImage", () => {
  it("renders fallback letter when no src", () => {
    render(<ProfileImage username="alice" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows image after load", () => {
    render(<ProfileImage username="alice" src="https://example.com/a.jpg" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "alice's profile picture");
    // simulate image load
    fireEvent.load(img);
    expect(img.className).toMatch(/opacity-100/);
  });

  it("shows fallback when image errors", () => {
    render(<ProfileImage username="bob" src="https://example.com/b.jpg" />);
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
