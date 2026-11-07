// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";
import { tmdbError } from "@/test/tmdb-error";

const tmdb = {
  getMovieCredits: vi.fn(),
  getMovieDetails: vi.fn(),
  getMovieGenres: vi.fn(),
  getTVAggregateCredits: vi.fn(),
  getTVEpisodeDetails: vi.fn(),
  getTVGenres: vi.fn(),
  getTVSeasonDetails: vi.fn(),
  getTVShowDetails: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

const details = await import("./route");
const credits = await import("../credits/route");
const genres = await import("../genres/route");
const episodes = await import("../episodes/[id]/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/tmdb/${path}`, { headers });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/tmdb/details", () => {
  it("returns movie details", async () => {
    tmdb.getMovieDetails.mockResolvedValue({ id: 550, title: "Fight Club" });
    const response = await details.GET(get("details?type=movie&id=550"));
    expect(response.status).toBe(200);
    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(550);
  });

  it("maps a TMDB 404 to notFound", async () => {
    tmdb.getTVShowDetails.mockRejectedValue(tmdbError(404));
    const response = await details.GET(get("details?type=tv&id=9"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Content not found",
      code: "notFound",
    });
  });

  it("maps other TMDB failures to 503", async () => {
    tmdb.getTVShowDetails.mockRejectedValue(tmdbError(500));
    const response = await details.GET(get("details?type=tv&id=9"));
    expect(response.status).toBe(503);
  });

  it("does not read an unrelated error that mentions 404 as not found", async () => {
    tmdb.getMovieDetails.mockRejectedValue(new Error("pool 404 timeout"));
    const response = await details.GET(get("details?type=movie&id=9"));
    expect(response.status).toBe(500);
  });

  it.each([
    ["details?type=movie&id=550abc", "Invalid content ID"],
    ["details?type=book&id=550", 'Type must be either "movie" or "tv"'],
  ])("rejects %s", async (path, error) => {
    const response = await details.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/tmdb/credits", () => {
  it("trims TV cast to the first role's character", async () => {
    tmdb.getTVAggregateCredits.mockResolvedValue({
      cast: [
        { id: 1, name: "A", profile_path: null, roles: [{ character: "X" }] },
        { id: 2, name: "B", profile_path: "/b.jpg", roles: [] },
      ],
    });
    const response = await credits.GET(get("credits?type=tv&id=1399"));
    await expect(response.json()).resolves.toEqual({
      cast: [
        { id: 1, name: "A", character: "X", profile_path: null },
        { id: 2, name: "B", character: null, profile_path: "/b.jpg" },
      ],
    });
  });

  it("rejects a missing id", async () => {
    const response = await credits.GET(get("credits?type=movie"));
    expect(response.status).toBe(400);
    expect(tmdb.getMovieCredits).not.toHaveBeenCalled();
  });
});

describe("GET /api/tmdb/genres", () => {
  it("merges, de-duplicates and sorts both lists by default", async () => {
    tmdb.getMovieGenres.mockResolvedValue({
      genres: [
        { id: 2, name: "Drama" },
        { id: 1, name: "Action" },
      ],
    });
    tmdb.getTVGenres.mockResolvedValue({ genres: [{ id: 2, name: "Drama" }] });
    const response = await genres.GET(get("genres"));
    await expect(response.json()).resolves.toEqual({
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Drama" },
      ],
    });
  });

  it("rejects an unknown type", async () => {
    const response = await genres.GET(get("genres?type=books"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/tmdb/episodes/[id]", () => {
  const getEpisodes = (search: string, id = "1399") =>
    episodes.GET(get(`episodes/${id}?${search}`), routeContext({ id }));

  it("returns a season, including season 0", async () => {
    tmdb.getTVSeasonDetails.mockResolvedValue({ episodes: [] });
    const response = await getEpisodes("season=0");
    await expect(response.json()).resolves.toEqual({
      season: { episodes: [] },
    });
    expect(tmdb.getTVSeasonDetails).toHaveBeenCalledWith(1399, 0);
  });

  it("returns one episode, including episode 0", async () => {
    tmdb.getTVEpisodeDetails.mockResolvedValue({ name: "Pilot" });
    const response = await getEpisodes("season=1&episode=0");
    await expect(response.json()).resolves.toEqual({
      episode: { name: "Pilot" },
    });
    expect(tmdb.getTVEpisodeDetails).toHaveBeenCalledWith(1399, 1, 0);
  });

  it.each([
    ["getTVSeasonDetails", "season=9", "Season not found", "seasonNotFound"],
    [
      "getTVEpisodeDetails",
      "season=1&episode=99",
      "Episode not found",
      "episodeNotFound",
    ],
  ] as const)(
    "maps a TMDB 404 from %s",
    async (method, search, error, code) => {
      tmdb[method].mockRejectedValue(tmdbError(404));
      const response = await getEpisodes(search);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error, code });
    },
  );

  it("rethrows an unrelated error that mentions 404", async () => {
    tmdb.getTVSeasonDetails.mockRejectedValue(new Error("socket 404"));
    const response = await getEpisodes("season=1");
    expect(response.status).toBe(500);
  });

  it.each([
    ["season=1", "abc", "Invalid TV show ID"],
    ["", "1399", "Invalid season number"],
    ["season=-1", "1399", "Invalid season number"],
  ])("rejects %s for id %s", async (search, id, error) => {
    const response = await getEpisodes(search, id);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});
