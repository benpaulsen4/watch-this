import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivityFeed } from "./ActivityFeed";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityType } from "@/lib/db/schema";

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

beforeEach(() => {
  // Mock matchMedia used for mdUp detection
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("ActivityFeed", () => {
  it("shows loading spinner while fetching", () => {
    // Never-resolving fetch keeps isLoading true
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(
      screen.getByText(/Loading activities.../),
    ).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(await screen.findByText(/Failed to fetch activities/)).toBeInTheDocument();
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
      upcoming: [
        { id: 101, name: "The Show", poster_path: "/poster.jpg" },
      ],
      hasMore: false,
    };
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => response }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);

    // Header and View All button
    expect(await screen.findByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("View All")).toBeInTheDocument();

    // Upcoming card shows show name (wait for data render)
    expect(await screen.findByText("The Show")).toBeInTheDocument();

    // Activity entry shows description from metadata
    expect(screen.getByText(/created list "My List"/)).toBeInTheDocument();
  });

  it("shows empty state when no upcoming and no activities", async () => {
    const response = { activities: [], upcoming: [], hasMore: false };
    // @ts-expect-error allow assigning to global
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => response }));
    renderWithClient(<ActivityFeed currentUsername="alice" />);
    expect(
      await screen.findByText(
        /No recent activity\. Start watching content or managing your lists to see activity here\./,
      ),
    ).toBeInTheDocument();
    // CTA links exist
    expect(screen.getByText("Discover Content")).toBeInTheDocument();
    expect(screen.getByText("Create List")).toBeInTheDocument();
  });
});