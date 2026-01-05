import { describe, it, expect, vi, beforeEach } from "vitest";
import TrendingStrip from "./TrendingStrip";
import { tmdbClient } from "@/lib/tmdb/client";
import { mapAllWithContentStatus } from "@/lib/content-status/service";

// Mock dependencies
vi.mock("@/lib/tmdb/client", () => ({
  tmdbClient: {
    getTrending: vi.fn(),
  },
}));

vi.mock("@/lib/content-status/service", () => ({
  mapAllWithContentStatus: vi.fn(),
}));

// Mock ContentCard to avoid issues with its internal logic or imports
vi.mock("./ContentCard", () => ({
  ContentCard: ({ content }: { content: any }) => (
    <div data-testid="content-card" data-id={content.tmdbId}>
      {content.title}
    </div>
  ),
}));

describe("TrendingStrip", () => {
  const mockTrendingItems = [
    { id: 1, title: "Movie 1" },
    { id: 2, title: "Movie 2" },
    { id: 3, title: "Movie 3" },
    { id: 4, title: "Movie 4" },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches trending content, limits items, maps them, and renders cards", async () => {
    // Setup mocks
    (tmdbClient.getTrending as any).mockResolvedValue({
      results: mockTrendingItems,
    });
    (mapAllWithContentStatus as any).mockImplementation(
      (items: any[], userIdArg: string) =>
        Promise.resolve(
          items.map((it) => ({
            tmdbId: it.id,
            contentType: "movie",
            title: it.title,
            overview: "",
            posterPath: null,
            backdropPath: null,
            releaseDate: "2024-01-01",
            voteAverage: 0,
            voteCount: 0,
            popularity: 0,
            genreIds: [],
            adult: false,
            watchStatus: null,
            statusUpdatedAt: null,
            userIdArg,
          }))
        )
    );

    const itemsLimit = 2;
    const userId = "user-123";

    // Call the component directly
    const result = await TrendingStrip({ items: itemsLimit, userId });

    // Verify tmdbClient.getTrending call
    expect(tmdbClient.getTrending).toHaveBeenCalledWith("all", "day");

    // Verify mapAllWithContentStatus called once with sliced items
    expect(mapAllWithContentStatus).toHaveBeenCalledTimes(1);
    expect(mapAllWithContentStatus).toHaveBeenCalledWith(
      mockTrendingItems.slice(0, itemsLimit),
      userId
    );

    // Verify the result is a React Fragment containing ContentCards
    // result is a React Element. Since it's a Fragment, props.children should be an array.
    expect(result).toBeDefined();
    expect(result!.props.children).toHaveLength(itemsLimit);

    // Check the first child
    const firstChild = result!.props.children[0];
    expect(firstChild.type).toBeDefined(); // It's the mocked ContentCard
    expect(firstChild.key).toBe("1");
    expect(firstChild.props.content).toEqual({
      tmdbId: 1,
      contentType: "movie",
      title: "Movie 1",
      overview: "",
      posterPath: null,
      backdropPath: null,
      releaseDate: "2024-01-01",
      voteAverage: 0,
      voteCount: 0,
      popularity: 0,
      genreIds: [],
      adult: false,
      watchStatus: null,
      statusUpdatedAt: null,
      userIdArg: userId,
    });

    // Check the second child
    const secondChild = result!.props.children[1];
    expect(secondChild.key).toBe("2");
    expect(secondChild.props.content).toEqual({
      tmdbId: 2,
      contentType: "movie",
      title: "Movie 2",
      overview: "",
      posterPath: null,
      backdropPath: null,
      releaseDate: "2024-01-01",
      voteAverage: 0,
      voteCount: 0,
      popularity: 0,
      genreIds: [],
      adult: false,
      watchStatus: null,
      statusUpdatedAt: null,
      userIdArg: userId,
    });
  });

  it("handles empty trending results", async () => {
    (tmdbClient.getTrending as any).mockResolvedValue({
      results: [],
    });

    const result = await TrendingStrip({ items: 5, userId: "user-123" });

    expect(tmdbClient.getTrending).toHaveBeenCalled();
    expect(mapAllWithContentStatus).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
