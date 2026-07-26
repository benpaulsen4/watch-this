import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppError from "./error";

describe("app error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a recovery affordance and calls reset when it is used", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<AppError error={new Error("db is down")} reset={reset} />);

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the server digest so a report can be tied to a log line", () => {
    render(
      <AppError
        error={Object.assign(new Error("boom"), { digest: "abc123" })}
        reset={() => {}}
      />,
    );

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("offers a way out that does not depend on the failing route", () => {
    render(<AppError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByRole("link", { name: /Back to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("does not leak the raw message into the page", () => {
    render(<AppError error={new Error("connect ECONNREFUSED 10.0.0.1:5432")} reset={() => {}} />);

    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });
});
