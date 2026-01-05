const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// NOTE: TMDB API types are truncated to only the parts we use. For full types, see their API docs:
// https://developers.themoviedb.org/3/getting-started/introduction

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  adult: boolean;
  popularity: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
}

// Search result types with media_type for multi-search
export interface TMDBMovieSearchResult extends TMDBMovie {
  media_type: "movie";
}

export interface TMDBTVShowSearchResult extends TMDBTVShow {
  media_type: "tv";
}

export type TMDBSearchItem = TMDBMovieSearchResult | TMDBTVShowSearchResult;

export interface TMDBSearchResult {
  page: number;
  results: (TMDBMovie | TMDBTVShow)[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMultiSearchResult {
  page: number;
  results: TMDBSearchItem[];
  total_pages: number;
  total_results: number;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBMovieDetails extends Omit<TMDBMovie, "genre_ids"> {
  genres: TMDBGenre[];
  runtime: number;
}

export interface TMDBTVShowDetails extends Omit<TMDBTVShow, "genre_ids"> {
  genres: TMDBGenre[];
  last_episode_to_air: {
    air_date: string;
    episode_number: number;
    id: number;
    name: string;
    overview: string;
    production_code: string;
    season_number: number;
    still_path: string | null;
    vote_average: number;
    vote_count: number;
  } | null;
  next_episode_to_air: {
    air_date: string;
    episode_number: number;
    id: number;
    name: string;
    overview: string;
    production_code: string;
    season_number: number;
    still_path: string | null;
    vote_average: number;
    vote_count: number;
  } | null;
  number_of_episodes: number;
  number_of_seasons: number;
  status: string;
}

export interface TMDBEpisode {
  air_date: string;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
}

export interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface TMDBContentWatchProviders {
  results: {
    [region: string]: {
      link?: string;
      flatrate?: TMDBWatchProvider[];
      rent?: TMDBWatchProvider[];
      buy?: TMDBWatchProvider[];
    };
  };
}

export interface UserStreamingProvider {
  id: number;
  name: string;
  logoPath: string | null;
  region: string;
}

export interface TMDBMovieCastMember {
  character: string;
  id: number;
  name: string;
  profile_path: string | null;
}

export interface TMDBMovieCredits {
  cast: TMDBMovieCastMember[];
}

export interface TMDBTVAggregateRole {
  character: string;
}

export interface TMDBTVAggregateCastMember {
  id: number;
  name: string;
  profile_path: string | null;
  roles: TMDBTVAggregateRole[];
}

export interface TMDBTVAggregateCredits {
  cast: TMDBTVAggregateCastMember[];
}

export interface TMDBSeason {
  episodes: TMDBEpisode[];
  name: string;
  season_number: number;
}

export type ContentType = "movie" | "tv";

class TMDBClient {
  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {},
    postProcessor?: (data: T) => T
  ): Promise<T> {
    if (!TMDB_API_KEY) {
      throw new Error("TMDB_API_KEY environment variable is required");
    }

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", TMDB_API_KEY!);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const preStart = new Date();

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 36000, // Cache for 10 hours
      },
    });

    console.info(
      `[TMDB API] Request to ${endpoint} completed in ${
        new Date().getTime() - preStart.getTime()
      }ms`
    );

    if (!response.ok) {
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    if (postProcessor) {
      return postProcessor(data);
    }
    return data;
  }

  // Watch provider regions
  async getWatchProviderRegions(): Promise<{
    results: {
      iso_3166_1: string;
      english_name: string;
      native_name: string;
    }[];
  }> {
    return this.request("/watch/providers/regions", {
      language: "en-US",
    });
  }

  // Watch providers for a region (movie/tv)
  async getWatchProviders(
    type: ContentType,
    region: string
  ): Promise<{ results: TMDBWatchProvider[] }> {
    const endpoint =
      type === "movie" ? "/watch/providers/movie" : "/watch/providers/tv";
    return this.request(endpoint, {
      watch_region: region,
      language: "en-US",
    });
  }

  // Search for movies and TV shows
  async searchMulti(
    query: string,
    page: number = 1
  ): Promise<TMDBMultiSearchResult> {
    return this.request<TMDBMultiSearchResult>(
      "/search/multi",
      {
        query: encodeURIComponent(query),
        page: page.toString(),
      },
      (data) => ({
        ...data,
        results: data.results.filter(
          (item) => (item.media_type as string) !== "person"
        ),
      })
    );
  }

  // Search for movies only
  async searchMovies(
    query: string,
    page: number = 1,
    year?: number
  ): Promise<TMDBSearchResult> {
    const queryParams: Record<string, string> = {
      query: encodeURIComponent(query),
      page: page.toString(),
    };
    if (year) queryParams.year = year.toString();
    return this.request<TMDBSearchResult>("/search/movie", queryParams);
  }

  // Search for TV shows only
  async searchTVShows(
    query: string,
    page: number = 1,
    year?: number
  ): Promise<TMDBSearchResult> {
    const queryParams: Record<string, string> = {
      query: encodeURIComponent(query),
      page: page.toString(),
    };
    if (year) queryParams.year = year.toString();
    return this.request<TMDBSearchResult>("/search/tv", queryParams);
  }

  // Get movie details
  async getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
    return this.request<TMDBMovieDetails>(`/movie/${movieId}`);
  }

  // Get TV show details
  async getTVShowDetails(tvId: number): Promise<TMDBTVShowDetails> {
    return this.request<TMDBTVShowDetails>(`/tv/${tvId}`);
  }

  // Get trending content
  async getTrending(
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week"
  ): Promise<TMDBMultiSearchResult> {
    return this.request<TMDBMultiSearchResult>(
      `/trending/${mediaType}/${timeWindow}`,
      {},
      (data) => ({
        ...data,
        results: data.results.filter(
          (item) => (item.media_type as string) !== "person"
        ),
      })
    );
  }

  // Get popular movies
  async getPopularMovies(page: number = 1): Promise<TMDBSearchResult> {
    return this.request<TMDBSearchResult>("/movie/popular", {
      page: page.toString(),
    });
  }

  // Get popular TV shows
  async getPopularTVShows(page: number = 1): Promise<TMDBSearchResult> {
    return this.request<TMDBSearchResult>("/tv/popular", {
      page: page.toString(),
    });
  }

  // Get movie genres
  async getMovieGenres(): Promise<{ genres: TMDBGenre[] }> {
    return this.request<{ genres: TMDBGenre[] }>("/genre/movie/list");
  }

  // Get TV genres
  async getTVGenres(): Promise<{ genres: TMDBGenre[] }> {
    return this.request<{ genres: TMDBGenre[] }>("/genre/tv/list");
  }

  // Discover movies with filters
  async discoverMovies(
    params: {
      page?: number;
      genre?: number;
      year?: number;
      sortBy?: string;
    } = {}
  ): Promise<TMDBSearchResult> {
    const queryParams: Record<string, string> = {
      page: (params.page || 1).toString(),
      sort_by: params.sortBy || "popularity.desc",
    };

    if (params.genre) {
      queryParams.with_genres = params.genre.toString();
    }

    if (params.year) {
      queryParams.year = params.year.toString();
    }

    return this.request<TMDBSearchResult>("/discover/movie", queryParams);
  }

  // Discover TV shows with filters
  async discoverTVShows(
    params: {
      page?: number;
      genre?: number;
      year?: number;
      sortBy?: string;
    } = {}
  ): Promise<TMDBSearchResult> {
    const queryParams: Record<string, string> = {
      page: (params.page || 1).toString(),
      sort_by: params.sortBy || "popularity.desc",
    };

    if (params.genre) {
      queryParams.with_genres = params.genre.toString();
    }

    if (params.year) {
      queryParams.first_air_date_year = params.year.toString();
    }

    return this.request<TMDBSearchResult>("/discover/tv", queryParams);
  }

  // Get TV show season details with episodes
  async getTVSeasonDetails(
    tvId: number,
    seasonNumber: number
  ): Promise<TMDBSeason> {
    return this.request<TMDBSeason>(`/tv/${tvId}/season/${seasonNumber}`);
  }

  // Get specific episode details
  async getTVEpisodeDetails(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<TMDBEpisode> {
    return this.request<TMDBEpisode>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`
    );
  }
  // Get content-specific watch providers (per region)
  async getContentWatchProviders(
    type: "movie" | "tv",
    id: number
  ): Promise<TMDBContentWatchProviders> {
    const path =
      type === "movie"
        ? `/movie/${id}/watch/providers`
        : `/tv/${id}/watch/providers`;
    return this.request<TMDBContentWatchProviders>(path);
  }

  async getMovieCredits(movieId: number): Promise<TMDBMovieCredits> {
    return this.request<TMDBMovieCredits>(`/movie/${movieId}/credits`);
  }

  async getTVAggregateCredits(tvId: number): Promise<TMDBTVAggregateCredits> {
    return this.request<TMDBTVAggregateCredits>(
      `/tv/${tvId}/aggregate_credits`
    );
  }
}

// Utility functions for image URLs
export function getImageUrl(
  path: string | null,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// Create and export the TMDB client instance
export const tmdbClient = new TMDBClient();
