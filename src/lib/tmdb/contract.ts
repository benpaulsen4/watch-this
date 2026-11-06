import { defineContract, schemas, type } from "../api/contract";
import type {
  TMDBEpisode,
  TMDBGenre,
  TMDBMovieDetails,
  TMDBSeason,
  TMDBTVShowDetails,
} from "./client";
import type {
  getContentDetailsSchemas,
  getCreditsSchemas,
  getGenresSchemas,
  getSeasonOrEpisodeSchemas,
} from "./schemas";
import type { CastMember } from "./types";

export const getContentDetails = defineContract({
  method: "GET",
  path: "/api/tmdb/details",
  label: "Get content details",
  schemas: schemas<typeof getContentDetailsSchemas>(),
  response: type<TMDBMovieDetails | TMDBTVShowDetails>(),
  errors: { notFound: { status: 404, message: "Content not found" } },
});

export const getCredits = defineContract({
  method: "GET",
  path: "/api/tmdb/credits",
  label: "tmdb/credits",
  schemas: schemas<typeof getCreditsSchemas>(),
  response: type<{ cast: CastMember[] }>(),
});

export const getGenres = defineContract({
  method: "GET",
  path: "/api/tmdb/genres",
  label: "TMDB genres",
  schemas: schemas<typeof getGenresSchemas>(),
  response: type<{ genres: TMDBGenre[] }>(),
});

export const getSeasonOrEpisode = defineContract({
  method: "GET",
  path: "/api/tmdb/episodes/[id]",
  label: "Get TV episodes",
  schemas: schemas<typeof getSeasonOrEpisodeSchemas>(),
  response: type<{ episode: TMDBEpisode } | { season: TMDBSeason }>(),
  errors: {
    episodeNotFound: { status: 404, message: "Episode not found" },
    seasonNotFound: { status: 404, message: "Season not found" },
  },
});
