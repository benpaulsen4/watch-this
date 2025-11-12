import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@/components/ui/Switch";
import { describe, it, expect, vi } from "vitest";

describe("Switch", () => {
  it("renders with label and fires change on toggle", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Enable notifications" onChange={onChange} />);
    const switchEl = screen.getByRole("switch", {
      name: /enable notifications/i,
    });
    await user.click(switchEl);
    expect(onChange).toHaveBeenCalled();
  });

  it("shows error text when provided", () => {
    render(<Switch label="Enable" error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
