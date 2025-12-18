import { describe, it, expect, vi, beforeEach } from "vitest";
import TrendingStrip from "./TrendingStrip";
import { tmdbClient } from "@/lib/tmdb/client";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";

// Mock dependencies
vi.mock("@/lib/tmdb/client", () => ({
  tmdbClient: {
    getTrending: vi.fn(),
  },
}));

vi.mock("@/lib/tmdb/contentUtils", () => ({
  enrichWithContentStatus: vi.fn(),
}));

// Mock ContentCard to avoid issues with its internal logic or imports
vi.mock("./ContentCard", () => ({
  ContentCard: ({ content }: { content: any }) => (
    <div data-testid="content-card" data-id={content.id}>
      {content.title || content.name}
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

  it("fetches trending content, limits items, enriches them, and renders cards", async () => {
    // Setup mocks
    (tmdbClient.getTrending as any).mockResolvedValue({
      results: mockTrendingItems,
    });
    
    (enrichWithContentStatus as any).mockImplementation((item: any) =>
      Promise.resolve({ ...item, enriched: true })
    );

    const itemsLimit = 2;
    const userId = "user-123";

    // Call the component directly
    const result = await TrendingStrip({ items: itemsLimit, userId });

    // Verify tmdbClient.getTrending call
    expect(tmdbClient.getTrending).toHaveBeenCalledWith("all", "day");

    // Verify enrichWithContentStatus calls - should be called for only 'itemsLimit' items
    expect(enrichWithContentStatus).toHaveBeenCalledTimes(itemsLimit);
    expect(enrichWithContentStatus).toHaveBeenCalledWith(
      mockTrendingItems[0],
      userId
    );
    expect(enrichWithContentStatus).toHaveBeenCalledWith(
      mockTrendingItems[1],
      userId
    );
    // Should not call for the 3rd item
    expect(enrichWithContentStatus).not.toHaveBeenCalledWith(
      mockTrendingItems[2],
      userId
    );

    // Verify the result is a React Fragment containing ContentCards
    // result is a React Element. Since it's a Fragment, props.children should be an array.
    expect(result).toBeDefined();
    expect(result.props.children).toHaveLength(itemsLimit);
    
    // Check the first child
    const firstChild = result.props.children[0];
    expect(firstChild.type).toBeDefined(); // It's the mocked ContentCard
    expect(firstChild.key).toBe("1");
    expect(firstChild.props.content).toEqual({
      ...mockTrendingItems[0],
      enriched: true,
    });

    // Check the second child
    const secondChild = result.props.children[1];
    expect(secondChild.key).toBe("2");
    expect(secondChild.props.content).toEqual({
      ...mockTrendingItems[1],
      enriched: true,
    });
  });

  it("handles empty trending results", async () => {
    (tmdbClient.getTrending as any).mockResolvedValue({
      results: [],
    });
    
    const result = await TrendingStrip({ items: 5, userId: "user-123" });

    expect(tmdbClient.getTrending).toHaveBeenCalled();
    expect(enrichWithContentStatus).not.toHaveBeenCalled();
    expect(result.props.children).toHaveLength(0);
  });
});
