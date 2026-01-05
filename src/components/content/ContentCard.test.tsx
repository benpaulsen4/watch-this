import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentCard } from "./ContentCard";
import type { TMDBContent } from "@/lib/content-status/types";

// Mock next/image to a simple img for jsdom
vi.mock("next/image", () => ({
  default: (props: any) => {
    const { src, alt, ...rest } = props;
    return <img src={typeof src === "string" ? src : ""} alt={alt} {...rest} />;
  },
}));

// Mock useStreamingPreferences for nested modal usage
vi.mock("@/components/providers/AuthProvider", () => {
  return {
    useStreamingPreferences: () => ({
      streamingPreferences: { country: "US", providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    }),
  };
});

function setupQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ContentCard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url.startsWith("/api/status/content") && method === "POST") {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url.startsWith("/api/status/episodes/next") && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            newStatus: "watching",
            episodeDetails: {
              seasonNumber: 1,
              episodeNumber: 1,
              name: "Pilot",
            },
          }),
        } as Response;
      }
      if (url.startsWith("/api/tmdb/details")) {
        // minimal details to satisfy modal
        return {
          ok: true,
          json: async () => ({ runtime: 120, genres: [] }),
        } as Response;
      }
      if (url.startsWith("/api/watch/content")) {
        return {
          ok: true,
          json: async () => ({ providers: null }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders movie card with title, badges, and rating", () => {
    const movie: TMDBContent = {
      tmdbId: 1,
      contentType: "movie",
      title: "Test Movie",
      overview: "A great movie",
      posterPath: "/poster.jpg",
      backdropPath: null,
      releaseDate: "2024-01-01",
      voteAverage: 8.3,
      voteCount: 1200,
      genreIds: [],
      popularity: 0,
      adult: false,
      watchStatus: "planning",
      statusUpdatedAt: null,
    };

    renderWithQuery(<ContentCard content={movie} />);
    expect(screen.getByText(/Test Movie/i)).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
    const genreLabels = screen.getAllByText(/Movie/i);
    expect(genreLabels.length).toBeGreaterThan(0);
    expect(screen.getByText("83%")).toBeInTheDocument();
  });

  it("single click calls onContentClick when provided", async () => {
    const user = userEvent.setup();
    const movie: TMDBContent = {
      tmdbId: 11,
      contentType: "movie",
      title: "Clickable Movie",
      overview: "Overview",
      posterPath: null,
      backdropPath: null,
      releaseDate: "2024-01-01",
      voteAverage: 6.5,
      voteCount: 100,
      genreIds: [],
      popularity: 0,
      adult: false,
      watchStatus: "planning",
      statusUpdatedAt: null,
    };
    const onClick = vi.fn();
    renderWithQuery(<ContentCard content={movie} onContentClick={onClick} />);
    await user.click(screen.getByText(/Clickable Movie/i));
    await waitFor(() => expect(onClick).toHaveBeenCalledWith(movie));
  });

  it("single click opens details modal when no onContentClick", async () => {
    const user = userEvent.setup();
    const tv: TMDBContent = {
      tmdbId: 22,
      contentType: "tv",
      title: "Show",
      overview: "Overview",
      posterPath: null,
      backdropPath: null,
      releaseDate: "2023-01-01",
      voteAverage: 7.1,
      voteCount: 200,
      genreIds: [],
      popularity: 0,
      adult: null,
      watchStatus: "watching",
      statusUpdatedAt: null,
    };
    renderWithQuery(<ContentCard content={tv} />);
    await user.click(screen.getByRole("heading", { name: /Show/i }));
    // Modal shows Overview tab heading
    expect(
      await screen.findByRole("tab", { name: /Overview/i }),
    ).toBeInTheDocument();
  });

  it("double click triggers quick-complete overlay and updates status", async () => {
    const user = userEvent.setup();
    const movie: TMDBContent = {
      tmdbId: 33,
      contentType: "movie",
      title: "Complete Movie",
      overview: "Overview",
      posterPath: null,
      backdropPath: null,
      releaseDate: "2024-01-01",
      voteAverage: 7.0,
      voteCount: 300,
      genreIds: [],
      popularity: 0,
      adult: false,
      watchStatus: "planning",
      statusUpdatedAt: null,
    };
    renderWithQuery(<ContentCard content={movie} />);
    const cardTitle = screen.getByText(/Complete Movie/i);
    await user.dblClick(cardTitle);
    // Overlay message appears
    expect(
      await screen.findByText(/Movie marked as watched!/i),
    ).toBeInTheDocument();
    // Status badge should reflect Completed
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    // Overlay disappears after timeout
    await waitFor(
      () => expect(screen.queryByText(/Movie marked as watched!/i)).toBeNull(),
      { timeout: 3500 },
    );
  });
});
