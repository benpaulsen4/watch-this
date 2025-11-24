import type { WatchStatusEnum } from "@/lib/db/schema";

export interface EpisodeStatusItem {
  id: string;
  userId: string;
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListEpisodeStatusResponse {
  episodes: EpisodeStatusItem[];
}

export interface UpdateEpisodeStatusInput {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
}

export type UpdateEpisodeStatusResult = {
  episode: EpisodeStatusItem;
  newStatus: WatchStatusEnum | null;
};

export interface BatchUpdateEpisodesInputItem {
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
}

export interface BatchUpdateEpisodesResult {
  episodes: EpisodeStatusItem[];
  newStatus: WatchStatusEnum | null;
  syncedCollaboratorIds: string[];
}

export interface MarkNextEpisodeResult {
  episode: EpisodeStatusItem;
  newStatus: WatchStatusEnum | null;
  episodeDetails: {
    seasonNumber: number;
    episodeNumber: number;
    name: string;
    airDate: string;
  };
}

export type MarkNextEpisodeError = "notFound" | "noNextEpisode" | "notAired";
