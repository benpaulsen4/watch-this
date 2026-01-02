import type {
  ContentTypeEnum,
  MovieWatchStatusEnum,
  TVWatchStatusEnum,
  WatchStatusEnum,
} from "@/lib/db/schema";

export interface ContentStatusItem {
  id: string;
  userId: string;
  tmdbId: number;
  contentType: ContentTypeEnum;
  status: MovieWatchStatusEnum | TVWatchStatusEnum;
  nextEpisodeDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TMDBContent {
  tmdbId: number;
  contentType: ContentTypeEnum;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  adult: boolean | null;

  watchStatus: WatchStatusEnum | null;
  statusUpdatedAt: string | null;
}

export interface TMDBContentSearchResult {
  page: number;
  results: TMDBContent[];
  totalPages: number;
  totalResults: number;
}

export interface GetContentStatusResponse {
  status: ContentStatusItem | null;
}

export interface CreateOrUpdateContentStatusInput {
  tmdbId: number;
  contentType: ContentTypeEnum;
  status: MovieWatchStatusEnum | TVWatchStatusEnum;
}

export type CreateOrUpdateContentStatusResult =
  | { status: ContentStatusItem }
  | "notFound";

export interface UpdateContentStatusInput {
  tmdbId: number;
  contentType: ContentTypeEnum;
  status?: MovieWatchStatusEnum | TVWatchStatusEnum;
}

export type UpdateContentStatusResult =
  | { status: ContentStatusItem }
  | "notFound";

export interface DeleteContentStatusResult {
  message: string;
}
