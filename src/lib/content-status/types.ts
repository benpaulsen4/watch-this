import type {
  ContentTypeEnum,
  MovieWatchStatusEnum,
  TVWatchStatusEnum,
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
