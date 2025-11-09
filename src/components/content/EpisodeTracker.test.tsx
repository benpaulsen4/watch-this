import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EpisodeTracker } from "./EpisodeTracker";
import type { TMDBTVShowDetails } from "@/lib/tmdb/client";

function setupQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("EpisodeTracker", () => {
  const tvShowId = 5;
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);

  let seasonsData: any;

  beforeEach(() => {
    seasonsData = {
      season: {
        season_number: 1,
        name: "Season 1",
        episodes: [
          {
            episode_number: 1,
            air_date: pastDate.toISOString(),
            name: "Episode One",
            overview: "First",
            runtime: 42,
          },
          {
            episode_number: 2,
            air_date: futureDate.toISOString(),
            name: "Episode Two",
            overview: "Second",
            runtime: 44,
          },
        ],
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url === `/api/status/episodes?tmdbId=${tvShowId}`) {
        return { ok: true, json: async () => ({ episodes: [] }) } as Response;
      }
      if (url === `/api/tmdb/episodes/${tvShowId}?season=1`) {
        return { ok: true, json: async () => seasonsData } as Response;
      }
      if (url === "/api/status/episodes" && method === "POST") {
        return { ok: true, json: async () => ({ newStatus: "watching" }) } as Response;
      }
      if (url === "/api/status/episodes" && method === "PUT") {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads seasons, expands, and toggles an episode", async () => {
    const details: TMDBTVShowDetails = {
      id: tvShowId,
      name: "Track Show",
      overview: "Overview",
      poster_path: null,
      backdrop_path: null,
      first_air_date: "2023-01-01",
      vote_average: 7.2,
      vote_count: 100,
      genre_ids: [],
      original_language: "en",
      original_name: "Track Show",
      popularity: 0,
      number_of_seasons: 1,
      number_of_episodes: 2,
      genres: [],
    } as any;

    renderWithQuery(
      <EpisodeTracker tvShowId={tvShowId} tvShowDetails={details} />, 
    );

    // Wait for Episode Progress heading
    expect(await screen.findByText(/Episode Progress/i)).toBeInTheDocument();

    // Expand Season 1
    const seasonHeaderBtn = screen.getByRole("button", { name: /Season 1/i });
    const user = userEvent.setup();
    await user.click(seasonHeaderBtn);

    // Find first episode block
    const toggles = document.querySelectorAll(
      "button.w-6.h-6.rounded-full",
    ) as NodeListOf<HTMLButtonElement>;
    expect(toggles.length).toBeGreaterThan(0);
    const toggleBtn = toggles[0];
    expect(toggleBtn).not.toBeDisabled();

    // Toggle watch status
    await user.click(toggleBtn);
    await waitFor(() => expect(toggleBtn).toHaveClass("bg-green-500"));

    // Future episode should be disabled
    const futureToggle = toggles[1];
    expect(futureToggle).toBeDisabled();
  });
});