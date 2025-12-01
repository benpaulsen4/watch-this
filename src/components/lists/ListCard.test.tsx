import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ListCard } from "./ListCard";
import type { ListListsResponse } from "@/lib/lists/types";

// Mock next/image to a plain img for test environment
vi.mock("next/image", () => ({
  default: (props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock TMDB client image helper
vi.mock("@/lib/tmdb/client", () => ({
  getImageUrl: (path: string) => `http://image.test${path}`,
}));

function makeList(
  overrides: Partial<ListListsResponse> = {}
): ListListsResponse {
  return {
    id: "l1",
    name: "Weekend Picks",
    description: null,
    listType: "mixed" as any,
    isPublic: true,
    syncWatchStatus: true,
    ownerId: "u1",
    ownerUsername: "alice" as any,
    ownerProfilePictureUrl: null as any,
    createdAt: "2024-01-01T00:00:00.000Z" as any,
    updatedAt: "2024-01-02T00:00:00.000Z" as any,
    itemCount: 3,
    collaborators: 2,
    posterPaths: ["/a.jpg", "/b.jpg", "/c.jpg"],
    ...overrides,
  } as unknown as ListListsResponse;
}

describe("ListCard", () => {
  it("renders name, type badge, posters and meta", () => {
    const list = makeList();
    render(<ListCard list={list} />);

    // Title and type badge
    expect(screen.getByText("Weekend Picks")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();

    // Posters
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBe(3);
    expect(imgs[0]).toHaveAttribute("src", expect.stringContaining("/a.jpg"));

    // Meta
    expect(screen.getByText(/Public/i)).toBeInTheDocument();
    expect(screen.getByText(/Sync/i)).toBeInTheDocument();
    expect(screen.getByText(/collaborators/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // items count visible
  });

  it("renders private state and empty posters", () => {
    const list = makeList({ isPublic: false, posterPaths: [] });
    render(<ListCard list={list} />);

    expect(screen.getByText(/Private/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing here/i)).toBeInTheDocument();
  });

  it("shows correct type labels for movies and tv", () => {
    render(<ListCard list={makeList({ listType: "movies" as any })} />);
    expect(screen.getByText(/Movies/i)).toBeInTheDocument();

    render(<ListCard list={makeList({ listType: "tv" as any })} />);
    expect(screen.getByText(/TV Shows/i)).toBeInTheDocument();
  });
});
