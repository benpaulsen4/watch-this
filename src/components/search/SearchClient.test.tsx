import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchClient } from "./SearchClient";
vi.mock("../content/ContentDetailsModal", () => ({
  ContentDetailsModal: () => null,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const genres = [
  { id: 1, name: "Action" },
  { id: 2, name: "Drama" },
];

const trending = [
  {
    id: 900,
    title: "Trending Movie",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "2024-01-01",
    vote_average: 7.5,
    vote_count: 100,
    genre_ids: [],
    adult: false,
    original_language: "en",
    original_title: "Trending Movie",
    popularity: 0,
    video: false,
  } as any,
];

describe("SearchClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/tmdb/discover")) {
        const qs = url.split("?")[1] || "";
        const params = new URLSearchParams(qs);
        const page = Number(params.get("page") || "1");
        const type = params.get("type") || "all";
        const isMovie = type === "movie" || type === "all";
        const result = isMovie
          ? {
              id: page === 1 ? 101 : 102,
              title: page === 1 ? "Discover Movie 1" : "Discover Movie 2",
              overview: "",
              poster_path: null,
              backdrop_path: null,
              release_date: "2024-01-01",
              vote_average: 7,
              vote_count: 10,
              genre_ids: [],
              adult: false,
              original_language: "en",
              original_title: "",
              popularity: 0,
              video: false,
            }
          : {
              id: page === 1 ? 201 : 202,
              name: page === 1 ? "Discover Show 1" : "Discover Show 2",
              overview: "",
              poster_path: null,
              backdrop_path: null,
              first_air_date: "2023-01-01",
              vote_average: 7,
              vote_count: 10,
              genre_ids: [],
              origin_country: ["US"],
              original_language: "en",
              original_name: "",
              popularity: 0,
            };
        return {
          ok: true,
          json: async () => ({ results: [result], total_pages: 2 }),
        } as any;
      }
      if (url.startsWith("/api/tmdb/search")) {
        const qs = url.split("?")[1] || "";
        const params = new URLSearchParams(qs);
        const q = params.get("q") || "";
        if (q.toLowerCase() === "nothing") {
          return { ok: true, json: async () => ({ results: [] }) } as any;
        }
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 301,
                title: `${q} Movie`,
                overview: "",
                poster_path: null,
                backdrop_path: null,
                release_date: "2024-01-01",
                vote_average: 8,
                vote_count: 50,
                genre_ids: [],
                adult: false,
                original_language: "en",
                original_title: `${q} Movie`,
                popularity: 0,
                video: false,
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows trending and discover results and loads more", async () => {
    renderWithProviders(
      <SearchClient genres={genres}>
        <div>Mock Trending Content</div>
        {trending.map((t) => (
          <div key={t.id}>{t.title}</div>
        ))}
      </SearchClient>
    );

    expect(screen.getByText(/Discover Content/i)).toBeInTheDocument();
    expect(screen.getByText(/Trending Today/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock Trending Content/i)).toBeInTheDocument();

    await screen.findByText(/Discover Movie 1/i);
    expect(
      screen.getByRole("button", { name: /Load More/i })
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Load More/i }));
    await screen.findByText(/Discover Movie 2/i);
  });

  it("opens filters and clears to default params", async () => {
    renderWithProviders(<SearchClient genres={genres}>{null}</SearchClient>);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filters/i }));
    await screen.findByText(/Content Type/i);

    const contentTypeSection = screen
      .getByText(/Content Type/i)
      .closest("div")!;
    const trigger = contentTypeSection.querySelector(
      'button[aria-haspopup="listbox"]'
    ) as HTMLButtonElement;
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /Movies/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some(
          (u) => u.includes("/api/tmdb/discover") && u.includes("type=movie")
        )
      ).toBe(true);
    });

    const clearBtn = screen.getByRole("button", { name: /Clear Filters/i });
    await user.click(clearBtn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      const lastDiscover = calls
        .reverse()
        .find((u) => u.includes("/api/tmdb/discover"))!;
      expect(lastDiscover.includes("sort_by=popularity.desc")).toBe(true);
      expect(lastDiscover.includes("type=")).toBe(false);
      expect(lastDiscover.includes("with_genres=")).toBe(false);
      expect(lastDiscover.includes("year=")).toBe(false);
    });
  });

  it("searches when typing and hides trending and load more", async () => {
    renderWithProviders(
      <SearchClient genres={genres}>
        <div>Mock Trending Content</div>
      </SearchClient>
    );

    const input = screen.getByPlaceholderText(/Search movies and TV shows/i);
    const user = userEvent.setup();
    await user.type(input, "Star");

    await screen.findByText(/Search Results for "Star"/i);
    expect(screen.queryByText(/Trending Today/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Mock Trending Content/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Load More/i })
    ).not.toBeInTheDocument();
    await screen.findByText(/Star Movie/i);
  });

  it("shows empty state when no search results", async () => {
    renderWithProviders(<SearchClient genres={genres}>{null}</SearchClient>);

    const input = screen.getByPlaceholderText(/Search movies and TV shows/i);
    const user = userEvent.setup();
    await user.type(input, "Nothing");

    expect(
      await screen.findByText(/No results found for "Nothing"/i)
    ).toBeInTheDocument();
  });
});
