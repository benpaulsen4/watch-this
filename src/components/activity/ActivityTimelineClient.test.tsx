import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityType } from "@/lib/db/schema";

// Provide a stable user without mounting AuthProvider
vi.mock("../providers/AuthProvider", () => ({
  useUser: () => ({ id: "u1", username: "alice" }),
}));

// Avoid IntersectionObserver by mocking the hook
vi.mock("@/hooks/useInfiniteScroll", () => ({
  useInfiniteScroll: () => ({ targetRef: { current: document.createElement("div") } }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityTimelineClient", () => {
  it("shows loading spinner while fetching", async () => {
    // @ts-expect-error assign to global
    global.fetch = vi.fn(() => new Promise(() => {}));
    const { ActivityTimelineClient } = await import("./ActivityTimelineClient");
    renderWithClient(<ActivityTimelineClient />);
    expect(
      screen.getByText(/Loading activities.../),
    ).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    // @ts-expect-error assign to global
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const { ActivityTimelineClient } = await import("./ActivityTimelineClient");
    renderWithClient(<ActivityTimelineClient />);
    expect(await screen.findByText(/Failed to fetch activities/)).toBeInTheDocument();
    // Retry button is present
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("renders ActivityEntry items on success", async () => {
    const page1 = {
      activities: [
        {
          id: "a1",
          activityType: ActivityType.LIST_CREATED,
          user: { id: "u1", username: "alice", profilePictureUrl: null },
          metadata: { listName: "My List" },
          isCollaborative: false,
          collaborators: [],
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: undefined,
    };
    // @ts-expect-error assign to global
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => page1 }));
    const { ActivityTimelineClient } = await import("./ActivityTimelineClient");
    renderWithClient(<ActivityTimelineClient />);

    // Activity entry appears
    expect(await screen.findByText(/created list "My List"/)).toBeInTheDocument();
  });

  it("shows 'Loading more...' when fetching next page", async () => {
    const mockUseInfiniteQuery = vi.fn().mockReturnValue({
      data: { pages: [{ activities: [{ id: "a", activityType: ActivityType.LIST_CREATED, user: { id: "u", username: "alice" }, metadata: { listName: "X" }, isCollaborative: false, collaborators: [], createdAt: new Date().toISOString() }] }] },
      isLoading: false,
      isFetchingNextPage: true,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: true,
    });

    vi.resetModules();
    await vi.doMock("@tanstack/react-query", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@tanstack/react-query")>();
      return { ...mod, useInfiniteQuery: mockUseInfiniteQuery };
    });
    const { ActivityTimelineClient: Timeline } = await import("./ActivityTimelineClient");
    renderWithClient(<Timeline />);
    expect(screen.getByText(/Loading more.../)).toBeInTheDocument();
    vi.resetModules();
  });

  it("shows end-of-feed indicator when no more pages", async () => {
    const mockUseInfiniteQuery = vi.fn().mockReturnValue({
      data: { pages: [{ activities: [{ id: "a", activityType: ActivityType.LIST_CREATED, user: { id: "u", username: "alice" }, metadata: { listName: "X" }, isCollaborative: false, collaborators: [], createdAt: new Date().toISOString() }] }] },
      isLoading: false,
      isFetchingNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    });

    vi.resetModules();
    await vi.doMock("@tanstack/react-query", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@tanstack/react-query")>();
      return { ...mod, useInfiniteQuery: mockUseInfiniteQuery };
    });
    const { ActivityTimelineClient: Timeline } = await import("./ActivityTimelineClient");
    renderWithClient(<Timeline />);
    expect(
      screen.getByText(/You\'ve reached the end of your activity timeline\./),
    ).toBeInTheDocument();
    vi.resetModules();
  });
});