import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

describe("global error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a retry that calls reset", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<GlobalError error={new Error("layout blew up")} reset={reset} />);

    expect(
      screen.getByText(/WatchThis hit an unexpected error/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
