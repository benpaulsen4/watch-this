import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadFailedNotice, UnavailableNotice } from "./SeriesFinaleNotices";

describe("UnavailableNotice", () => {
  it("says the period has no Series Finale and offers a way back", () => {
    render(<UnavailableNotice period="2026" />);

    expect(screen.getByText("No Series Finale for 2026")).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your profile" }),
    ).toHaveAttribute("href", "/profile#data");
  });
});

describe("LoadFailedNotice", () => {
  it("asks for a retry, since this failure may pass", () => {
    render(<LoadFailedNotice />);

    expect(
      screen.getByText("That recap could not be loaded. Try again in a moment."),
    ).toBeInTheDocument();
  });
});
