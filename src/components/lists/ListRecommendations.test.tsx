import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/webauthn";
import { getListRecommendations } from "@/lib/lists/recommendations";

import ListRecommendations from "./ListRecommendations";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/lists/recommendations", () => ({
  getListRecommendations: vi.fn(),
}));

vi.mock("./ListItemWrapper", () => ({
  ListItemWrapper: ({ content, currentListId, showWatchStatus }: any) => (
    <div
      data-testid="list-reco-item"
      data-current-list-id={currentListId}
      data-show-watch-status={String(showWatchStatus)}
    >
      {content.title}
    </div>
  ),
}));

describe("ListRecommendations", () => {
  const mockUser = { id: "user-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    (cookies as any).mockReturnValue({
      get: () => ({ value: "session-token" }),
    });
    (getCurrentUser as any).mockResolvedValue(mockUser);
  });

  it("returns null if user not found", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const result = await ListRecommendations({ listId: "list-1" });
    expect(result).toBeNull();
  });

  it("returns null if recommendations are not found", async () => {
    (getListRecommendations as any).mockResolvedValue("notFound");
    const result = await ListRecommendations({ listId: "list-1" });
    expect(result).toBeNull();
  });

  it("returns null if recommendations are empty", async () => {
    (getListRecommendations as any).mockResolvedValue([]);
    const result = await ListRecommendations({ listId: "list-1" });
    expect(result).toBeNull();
  });

  it("renders recommendations section and items when available", async () => {
    (getListRecommendations as any).mockResolvedValue([
      { tmdbId: 1, contentType: "movie", title: "Movie 1" },
      { tmdbId: 2, contentType: "tv", title: "Show 2" },
    ]);

    const result = await ListRecommendations({ listId: "list-1" });
    render(result);

    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(
      screen.getByText("Suggestions based on what’s already in this list"),
    ).toBeInTheDocument();

    const items = screen.getAllByTestId("list-reco-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Movie 1");
    expect(items[1]).toHaveTextContent("Show 2");
    expect(items[0]).toHaveAttribute("data-current-list-id", "list-1");
    expect(items[0]).toHaveAttribute("data-show-watch-status", "true");
  });

  it("passes user id and list id to getListRecommendations", async () => {
    (getListRecommendations as any).mockResolvedValue([]);
    await ListRecommendations({ listId: "list-xyz" });
    expect(getListRecommendations).toHaveBeenCalledWith("user-1", "list-xyz");
  });
});

