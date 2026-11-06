import type { TMDBContentWatchProviders, TMDBWatchProvider } from "./client";

/** One cast member, trimmed to what the cast tab shows. */
export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
}

export interface ContentWatchProvidersResponse {
  region: string;
  providers: TMDBContentWatchProviders["results"][string] | null;
}

export interface RegionWatchProvidersResponse {
  results: TMDBWatchProvider[];
}

export interface WatchProviderRegion {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}
