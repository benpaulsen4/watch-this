import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders children when not loading", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("shows loading state and disables button", () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("renders child element when asChild is true", () => {
    render(
      <Button asChild>
        <span data-testid="child">Inner</span>
      </Button>,
    );
    const child = screen.getByTestId("child");
    expect(child.tagName.toLowerCase()).toBe("span");
    // Base classes applied to child via Slot
    expect(child.className).toMatch(/inline-flex/);
  });

  it("calls onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
