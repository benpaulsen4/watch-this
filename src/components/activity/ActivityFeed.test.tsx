import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,describe, expect, it, vi } from "vitest";

import { ActivityType } from "@/lib/db/schema";

import { ActivityFeed } from "./ActivityFeed";

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Avoid heavy modal internals requiring AuthProvider by mocking
vi.mock("../content/ContentDetailsModal", () => ({
  ContentDetailsModal: () => null,
}));

// Simple render helper with React Query client
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  // Mock matchMedia used for mdUp detection
  mockMatchMedia(false);
});

describe("ActivityFeed", () => {
  it("shows loading spinner while fetching", () => {
    // Never-resolving fetch keeps isLoading true
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(screen.getByText(/Loading activities.../)).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(
      await screen.findByText(/Failed to fetch activities/),
    ).toBeInTheDocument();
  });

  it("renders upcoming and activity sections on success", async () => {
    const response = {
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
      upcoming: [{ tmdbId: 101, title: "The Show", posterPath: "/poster.jpg" }],
      hasMore: false,
    };
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);

    // Header and View All button
    expect(await screen.findByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("View All")).toBeInTheDocument();

    // Upcoming card shows show name (wait for data render)
    expect(await screen.findByText("The Show")).toBeInTheDocument();

    // Activity entry shows description from metadata
    expect(screen.getByText(/created list "My List"/)).toBeInTheDocument();
  });

  // UI-10: the request limit was derived from `mdUp`, which starts false and is
  // corrected by an effect, and `mdUp` was part of the query key - so a desktop
  // load fetched limit=5 under one key and then limit=10 under another.
  describe("viewport handling", () => {
    const manyActivities = Array.from({ length: 10 }).map((_, i) => ({
      id: `a${i + 1}`,
      activityType: ActivityType.LIST_CREATED,
      user: { id: "u1", username: "alice", profilePictureUrl: null },
      metadata: { listName: `List ${i + 1}` },
      isCollaborative: false,
      collaborators: [],
      createdAt: new Date().toISOString(),
    }));

    function mockFeed() {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
        ok: true,
        json: async () => ({
          activities: manyActivities,
          upcoming: [],
          hasMore: false,
        }),
      }));
      // @ts-expect-error allow assigning to global
      global.fetch = fetchMock;
      return fetchMock;
    }

    it("fetches once with a fixed limit on a narrow viewport", async () => {
      mockMatchMedia(false);
      const fetchMock = mockFeed();

      renderWithClient(<ActivityFeed currentUsername="alice" />);
      await screen.findByText(/created list "List 1"/);

      // Let the media-query effect settle, which is what used to refetch.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/activity?limit=10");
      // Narrow viewport draws one column, so it shows half the entries.
      expect(screen.queryByText(/created list "List 5"/)).toBeInTheDocument();
      expect(screen.queryByText(/created list "List 6"/)).toBeNull();
    });

    it("fetches once and shows the full page on a wide viewport", async () => {
      mockMatchMedia(true);
      const fetchMock = mockFeed();

      renderWithClient(<ActivityFeed currentUsername="alice" />);
      await screen.findByText(/created list "List 1"/);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/created list "List 10"/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no upcoming and no activities", async () => {
    const response = { activities: [], upcoming: [], hasMore: false };
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(
      await screen.findByText(
        /No recent activity\. Start watching content or managing your lists to see activity here\./,
      ),
    ).toBeInTheDocument();
    // CTA links/buttons exist
    expect(screen.getByText("Discover Content")).toBeInTheDocument();
    expect(screen.getByText("Create List")).toBeInTheDocument();
  });

  it("opens create list modal from empty state CTA", async () => {
    const response = { activities: [], upcoming: [], hasMore: false };
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(await screen.findByText(/No recent activity/)).toBeInTheDocument();
    // Click Create List
    const btn = screen.getByRole("button", { name: /Create List/i });
    const user = userEvent.setup();
    await user.click(btn);
    // Modal title appears
    expect(await screen.findByText(/Create New List/i)).toBeInTheDocument();
  });
});
