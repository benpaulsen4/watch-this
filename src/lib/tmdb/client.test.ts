import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTMDBHttpError,
  normaliseFilmRuntime,
  type TMDBEpisode,
  type TMDBMovieDetails,
} from "./client";

describe("TMDBEpisode", () => {
  // Catches regression if TMDBEpisode.runtime is narrowed back to number;
  // the real protection is at compile time via typecheck, not here at runtime.
  it("admits a null runtime, which TMDB returns for some episodes", () => {
    const episode: TMDBEpisode = {
      air_date: "2026-03-14",
      episode_number: 1,
      name: "Pilot",
      overview: "",
      runtime: null,
    };

    expect(episode.runtime).toBeNull();
  });
});

describe("TMDBMovieDetails", () => {
  // Same untruth as TMDBEpisode carried: TMDB returns null for films it has no
  // runtime for, and a `number`-typed field made callers store a bogus value.
  it("admits a null runtime, which TMDB returns for some films", () => {
    const details = {
      id: 1,
      title: "Untitled",
      overview: "",
      poster_path: null,
      backdrop_path: null,
      release_date: "2026-01-01",
      vote_average: 0,
      vote_count: 0,
      adult: false,
      popularity: 0,
      genres: [],
      runtime: null,
    } satisfies TMDBMovieDetails;

    expect(details.runtime).toBeNull();
  });
});

describe("normaliseFilmRuntime", () => {
  it("keeps a real runtime", () => {
    expect(normaliseFilmRuntime(164)).toBe(164);
  });

  it("maps TMDB's zero to null, so it is not counted as a known zero minutes", () => {
    expect(normaliseFilmRuntime(0)).toBeNull();
  });

  it("maps null and undefined to null", () => {
    expect(normaliseFilmRuntime(null)).toBeNull();
    expect(normaliseFilmRuntime(undefined)).toBeNull();
  });

  it("maps a negative runtime to null", () => {
    expect(normaliseFilmRuntime(-5)).toBeNull();
  });
});

describe("isTMDBHttpError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("rejects an ordinary error, which carries no status", () => {
    expect(isTMDBHttpError(new Error("socket hang up"))).toBe(false);
    expect(isTMDBHttpError("not an error")).toBe(false);
  });

  it.each([404, 429, 500])(
    "attaches the real HTTP status %i to what a failed request throws",
    async (status) => {
      vi.stubEnv("TMDB_API_KEY", "test-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("", { status })),
      );
      vi.resetModules();

      const { isTMDBHttpError: isError, tmdbClient } = await import("./client");

      const caught = await tmdbClient.getMovieDetails(1).catch((e) => e);

      // Callers have to tell a definitive 404 from a transient 429 or 5xx, and
      // the status used to exist only inside the message string.
      expect(isError(caught)).toBe(true);
      expect((caught as { status: number }).status).toBe(status);
    },
  );
});
