import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "../requireUser";
import DashboardPage from "./page";

vi.mock("../requireUser", () => ({ requireUser: vi.fn() }));
vi.mock("@/components/content/TrendingStrip", () => ({ default: () => null }));
vi.mock("@/components/activity/ActivityFeed", () => ({
  ActivityFeed: () => null,
}));

/**
 * Emulates the sub-640px layout. Tailwind's `hidden` is display:none, which is
 * what drops the labels out of the accessibility tree; applying it inline is the
 * jsdom equivalent, and unlike a stylesheet it does not outlive the render.
 */
function hideLabelsBelowSmBreakpoint() {
  document
    .querySelectorAll<HTMLElement>(".hidden")
    .forEach((el) => (el.style.display = "none"));
}

describe("DashboardPage header actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireUser as any).mockResolvedValue({
      id: "u1",
      username: "alice",
      profilePictureUrl: null,
    });
  });

  // UI-04: these three are icon-only below sm, and their labels live in
  // `hidden sm:block` spans, so at that width they had no accessible name at all.
  it("names each action when its visible label is hidden", async () => {
    render(await DashboardPage());
    hideLabelsBelowSmBreakpoint();

    expect(screen.getByRole("link", { name: "My Lists" })).toHaveAttribute(
      "href",
      "/lists",
    );
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "href",
      "/search",
    );
    expect(
      screen.getByRole("link", { name: "Profile for alice" }),
    ).toHaveAttribute("href", "/profile");
  });
});
