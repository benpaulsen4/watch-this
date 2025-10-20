import { WatchStatusEnum } from "../db";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

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
  original_language: string;
  original_title: string;
  popularity: number;
  video: boolean;

  //enriched from proxy API
  watchStatus?: WatchStatusEnum;
  statusUpdatedAt?: string;
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
  origin_country: string[];
  original_language: string;
  original_name: string;
  popularity: number;

  //enriched from proxy API
  watchStatus?: WatchStatusEnum;
  statusUpdatedAt?: string;
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

export interface TMDBMovieDetails extends TMDBMovie {
  budget: number;
  genres: TMDBGenre[];
  homepage: string;
  imdb_id: string;
  production_companies: {
    id: number;
    logo_path: string | null;
    name: string;
    origin_country: string;
  }[];
  production_countries: {
    iso_3166_1: string;
    name: string;
  }[];
  revenue: number;
  runtime: number;
  spoken_languages: {
    english_name: string;
    iso_639_1: string;
    name: string;
  }[];
  status: string;
  tagline: string;
}

export interface TMDBTVShowDetails extends TMDBTVShow {
  created_by: {
    id: number;
    credit_id: string;
    name: string;
    gender: number;
    profile_path: string | null;
  }[];
  episode_run_time: number[];
  genres: TMDBGenre[];
  homepage: string;
  in_production: boolean;
  languages: string[];
  last_air_date: string;
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
  networks: {
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }[];
  number_of_episodes: number;
  number_of_seasons: number;
  production_companies: {
    id: number;
    logo_path: string | null;
    name: string;
    origin_country: string;
  }[];
  production_countries: {
    iso_3166_1: string;
    name: string;
  }[];
  seasons: {
    air_date: string;
    episode_count: number;
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    season_number: number;
  }[];
  spoken_languages: {
    english_name: string;
    iso_639_1: string;
    name: string;
  }[];
  status: string;
  tagline: string;
  type: string;
}

export interface TMDBEpisode {
  air_date: string;
  episode_number: number;
  id: number;
  name: string;
  overview: string;
  production_code: string;
  runtime: number;
  season_number: number;
  show_id: number;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  crew: {
    id: number;
    credit_id: string;
    name: string;
    department: string;
    job: string;
    profile_path: string | null;
  }[];
  guest_stars: {
    id: number;
    name: string;
    credit_id: string;
    character: string;
    order: number;
    profile_path: string | null;
  }[];
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

export interface TMDBSeason {
  _id: string;
  air_date: string;
  episodes: TMDBEpisode[];
  name: string;
  overview: string;
  id: number;
  poster_path: string | null;
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

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 3600, // Cache for 1 hour
      },
    });

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
}

// Utility functions for image URLs
export function getImageUrl(
  path: string | null,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export function getBackdropUrl(
  path: string | null,
  size: "w300" | "w780" | "w1280" | "original" = "w1280"
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// Helper function to determine if content is a movie or TV show
export function isMovie(content: TMDBMovie | TMDBTVShow): content is TMDBMovie {
  return "title" in content;
}

export function isTVShow(
  content: TMDBMovie | TMDBTVShow
): content is TMDBTVShow {
  return "name" in content;
}

// Helper function to get content title
export function getContentTitle(content: TMDBMovie | TMDBTVShow): string {
  return isMovie(content) ? content.title : content.name;
}

// Helper function to get content release date
export function getContentReleaseDate(content: TMDBMovie | TMDBTVShow): string {
  return isMovie(content) ? content.release_date : content.first_air_date;
}

// Helper function to get content type
export function getContentType(content: TMDBMovie | TMDBTVShow): ContentType {
  return isMovie(content) ? "movie" : "tv";
}

// Create and export the TMDB client instance
export const tmdbClient = new TMDBClient();
