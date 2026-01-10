import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { beforeEach,describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/webauthn";
import { getListItems } from "@/lib/lists/service";

import ListItems from "./ListItems";

// Mock dependencies
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/lists/service", () => ({
  getListItems: vi.fn(),
}));

vi.mock("./ListItemWrapper", () => ({
  ListItemWrapper: ({ content }: any) => (
    <div data-testid="list-item">{content.title}</div>
  ),
}));

describe("ListItems", () => {
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
    const result = await ListItems({ listId: "list-1" });
    expect(result).toBeNull();
  });

  it("renders error message if getListItems returns notFound", async () => {
    (getListItems as any).mockResolvedValue("notFound");

    // Call component function directly or render result
    const result = await ListItems({ listId: "list-1" });
    render(result);

    expect(screen.getByText("Error loading items")).toBeInTheDocument();
  });

  it("renders empty state when no items", async () => {
    (getListItems as any).mockResolvedValue({ items: [] });

    const result = await ListItems({ listId: "list-1" });
    render(result);

    expect(screen.getByText("No content found")).toBeInTheDocument();
    expect(screen.getByText("Add Content")).toBeInTheDocument();
  });

  it("renders items when found", async () => {
    const items = [
      {
        listItemId: "item-1",
        createdAt: "2023-01-01",
        id: 100,
        title: "Movie 1",
        contentType: "movie",
      },
      {
        listItemId: "item-2",
        createdAt: "2023-01-02",
        id: 101,
        title: "Show 1",
        contentType: "tv",
      },
    ];
    (getListItems as any).mockResolvedValue({ items });

    const result = await ListItems({ listId: "list-1" });
    render(result);

    const renderedItems = screen.getAllByTestId("list-item");
    expect(renderedItems).toHaveLength(2);
    expect(renderedItems[0]).toHaveTextContent("Movie 1");
    expect(renderedItems[1]).toHaveTextContent("Show 1");
  });

  it("passes filters to getListItems", async () => {
    (getListItems as any).mockResolvedValue({ items: [] });

    await ListItems({
      listId: "list-1",
      watchStatus: ["planning"],
      sortOrder: "descending",
    });

    expect(getListItems).toHaveBeenCalledWith(
      "user-1",
      "list-1",
      ["planning"],
      "descending"
    );
  });
});
