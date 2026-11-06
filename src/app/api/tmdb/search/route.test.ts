// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const tmdb = {
  discoverMovies: vi.fn(),
  discoverTVShows: vi.fn(),
  getTrending: vi.fn(),
  searchMovies: vi.fn(),
  searchMulti: vi.fn(),
  searchTVShows: vi.fn(),
};
const mapAllWithContentStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

vi.mock("@/lib/content-status/service", () => ({
  mapAllWithContentStatus: (...args: unknown[]) =>
    mapAllWithContentStatus(...args),
}));

const search = await import("./route");
const discover = await import("../discover/route");
const trending = await import("../trending/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/tmdb/${path}`, { headers });

const page = (results: unknown[] = []) => ({
  page: 1,
  results,
  total_pages: 2,
  total_results: 30,
});

describe("GET /api/tmdb/search", () => {
  it("searches everything by default and enriches results", async () => {
    tmdb.searchMulti.mockResolvedValue(page([{ id: 1 }]));
    mapAllWithContentStatus.mockResolvedValue([{ tmdbId: 1 }]);
    const response = await search.GET(get("search?q=%20dune%20"));
    expect(tmdb.searchMulti).toHaveBeenCalledWith("dune", 1);
    expect(mapAllWithContentStatus).toHaveBeenCalledWith([{ id: 1 }], "user-1");
    await expect(response.json()).resolves.toEqual({
      page: 1,
      results: [{ tmdbId: 1 }],
      totalPages: 2,
      totalResults: 30,
    });
  });

  it("passes year and page to a typed search", async () => {
    tmdb.searchMovies.mockResolvedValue(page());
    await search.GET(get("search?q=dune&type=movie&year=2021&page=2"));
    expect(tmdb.searchMovies).toHaveBeenCalledWith("dune", 2, 2021);
    expect(mapAllWithContentStatus).not.toHaveBeenCalled();
  });

  it("treats an unknown type as all", async () => {
    tmdb.searchMulti.mockResolvedValue(page());
    const response = await search.GET(get("search?q=dune&type=books"));
    expect(response.status).toBe(200);
    expect(tmdb.searchMulti).toHaveBeenCalled();
  });

  it.each([
    ["search?q=%20%20", "Search query is required"],
    ["search?q=dune&year=2021", "Year cannot be used with multi search"],
    ["search?q=dune&type=tv&year=1899", "Year must be between 1900 and next 5 years"],
    ["search?q=dune&type=tv&year=3000", "Year must be between 1900 and next 5 years"],
    ["search?q=dune&page=0", "Page must be between 1 and 1000"],
    ["search?q=dune&page=1001", "Page must be between 1 and 1000"],
  ])("rejects %s", async (path, error) => {
    const response = await search.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/tmdb/discover", () => {
  it("passes valid filters through", async () => {
    tmdb.discoverMovies.mockResolvedValue(page());
    await discover.GET(
      get("discover?type=movie&genre=18&year=1999&sort_by=vote_average.desc&page=3"),
    );
    expect(tmdb.discoverMovies).toHaveBeenCalledWith({
      page: 3,
      genre: 18,
      year: 1999,
      sortBy: "vote_average.desc",
    });
  });

  it("drops invalid filters instead of rejecting them", async () => {
    tmdb.discoverTVShows.mockResolvedValue(page());
    const response = await discover.GET(
      get("discover?type=tv&genre=abc&year=1800&sort_by=title.asc"),
    );
    expect(response.status).toBe(200);
    expect(tmdb.discoverTVShows).toHaveBeenCalledWith({
      page: 1,
      genre: undefined,
      year: undefined,
      sortBy: undefined,
    });
  });

  it("merges both types by popularity when no type is given", async () => {
    tmdb.discoverMovies.mockResolvedValue({
      ...page([{ id: 1, popularity: 1 }]),
      total_pages: 2,
    });
    tmdb.discoverTVShows.mockResolvedValue({
      ...page([{ id: 2, popularity: 5 }]),
      total_pages: 3,
    });
    mapAllWithContentStatus.mockImplementation(async (items) => items);
    const response = await discover.GET(get("discover"));
    const body = await response.json();
    expect(body.results.map((r: { id: number }) => r.id)).toEqual([2, 1]);
    expect(body.totalPages).toBe(5);
  });

  it("still rejects an unknown type", async () => {
    const response = await discover.GET(get("discover?type=books"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/tmdb/trending", () => {
  it("defaults to all and week", async () => {
    tmdb.getTrending.mockResolvedValue(page());
    await trending.GET(get("trending"));
    expect(tmdb.getTrending).toHaveBeenCalledWith("all", "week");
  });

  it.each([
    ["trending?media_type=books", 'Media type must be "all", "movie", or "tv"'],
    ["trending?time_window=month", 'Time window must be "day" or "week"'],
  ])("rejects %s", async (path, error) => {
    const response = await trending.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});
