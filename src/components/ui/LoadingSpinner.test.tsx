import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { describe, it, expect } from "vitest";

describe("LoadingSpinner", () => {
  it("renders default spinner with status role", () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole("status", { name: "Loading" });
    expect(spinner).toBeInTheDocument();
  });

  it("renders with text and centered container", () => {
    render(<LoadingSpinner text="Loading data..." centered />);
    expect(screen.getByText("Loading data...")).toBeInTheDocument();
    const textEl = screen.getByText("Loading data...");
    expect(textEl.parentElement?.className).toMatch(/justify-center/);
  });
});
