import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentDetailsModal } from "./ContentDetailsModal";
import type { TMDBTVShow, TMDBTVShowDetails } from "@/lib/tmdb/client";

// Mock next/image to a simple img for jsdom
vi.mock("next/image", () => ({
  default: (props: any) => {
    const { src, alt, ...rest } = props;
    return <img src={typeof src === "string" ? src : ""} alt={alt} {...rest} />;
  },
}));

// Mock useStreamingPreferences to provide a region
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
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ContentDetailsModal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/tmdb/details?type=tv")) {
        const data: Partial<TMDBTVShowDetails> = {
          id: 2,
          name: "Test Show",
          overview: "Show overview",
          poster_path: null,
          backdrop_path: null,
          first_air_date: "2023-01-01",
          vote_average: 7.2,
          vote_count: 500,
          genre_ids: [],
          original_language: "en",
          original_name: "Test Show",
          popularity: 0,
          number_of_seasons: 2,
          number_of_episodes: 20,
          genres: [{ id: 1, name: "Drama" }],
        } as any;
        return {
          ok: true,
          json: async () => data,
        } as Response;
      }
      if (url.startsWith("/api/watch/content?type=tv")) {
        const data = {
          providers: {
            flatrate: [
              { provider_id: 8, provider_name: "Netflix", logo_path: null },
            ],
          },
        };
        return { ok: true, json: async () => data } as Response;
      }
      if (url.startsWith("/api/status/content") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ status: "completed" }),
        } as Response;
      }
      // Default empty
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders tabs for TV content when open", async () => {
    const tv: TMDBTVShow = {
      id: 2,
      name: "Test Show",
      overview: "Overview",
      poster_path: null,
      backdrop_path: null,
      first_air_date: "2023-01-01",
      vote_average: 7.2,
      vote_count: 500,
      genre_ids: [],
      origin_country: ["US"],
      original_language: "en",
      original_name: "Test Show",
      popularity: 0,
      watchStatus: "watching",
    };

    renderWithQuery(
      <ContentDetailsModal content={tv} isOpen={true} onClose={() => {}} />,
    );

    // Tabs
    expect(
      await screen.findByRole("tab", { name: /Overview/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Episodes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Lists/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Schedule/i })).toBeInTheDocument();
    // Streaming provider chip appears
    await waitFor(() =>
      expect(screen.getByText(/Netflix/i)).toBeInTheDocument(),
    );
  });

  it("updates watch status via segmented selector", async () => {
    const user = userEvent.setup();
    const tv: TMDBTVShow = {
      id: 3,
      name: "Another Show",
      overview: "Overview",
      poster_path: null,
      backdrop_path: null,
      first_air_date: "2023-01-01",
      vote_average: 8.1,
      vote_count: 100,
      genre_ids: [],
      origin_country: ["US"],
      original_language: "en",
      original_name: "Another Show",
      popularity: 0,
      watchStatus: "planning",
    };
    const onChanged = vi.fn();

    renderWithQuery(
      <ContentDetailsModal
        content={tv}
        isOpen={true}
        onClose={() => {}}
        onShowStatusChanged={onChanged}
      />,
    );

    const completed = await screen.findByRole("radio", { name: /completed/i });
    await user.click(completed);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("completed"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/status/content",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // Note: Close button has no accessible label; skip click-close test.
});
