import { render, screen } from "@testing-library/react";
import { describe, expect,it } from "vitest";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
