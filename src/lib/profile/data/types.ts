import { ContentTypeEnum, ListTypeEnum, WatchStatusEnum } from "@/lib/db";

export type ExportFormat = "json" | "csv";

export interface ExportResponse {
  data: string;
  filename: string;
  mimetype: string;
}

/** Mapped from `lists` table */
export interface ListExportRow {
  id: string;
  name: string;
  description: string | null;
  listType: ListTypeEnum;
  isPublic: boolean;
  isArchived: boolean;
  syncWatchStatus: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Mapped from `list_items` table, with `title` and `releaseDate` joined from the `tmdb_cache` table (if available) */
export interface ListItemExportRow {
  id: string;
  listId: string;
  tmdbId: number;
  contentType: ContentTypeEnum;
  title: string;
  releaseDate: string;
  createdAt: string;
}

/** Mapped from `user_content_status` table */
export interface ContentStatusExportRow {
  id: string;
  tmdbId: number;
  contentType: ContentTypeEnum;
  status: WatchStatusEnum;
  createdAt: string;
  updatedAt: string;
}

/** Mapped from `episode_watch_status` table */
export interface EpisodeStatusExportRow {
  id: string;
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mapped from `show_schedules` table */
export interface TVShowSchedules {
  id: string;
  tmdbId: number;
  dayOfWeek: number;
  createdAt: string;
  updatedAt: string;
}

/** Export produced as a large JSON document following this model */
export interface JSONExportModel {
  lists: (ListExportRow & { items: ListItemExportRow[] })[];
  contentStatus: ContentStatusExportRow[];
  episodeStatus: EpisodeStatusExportRow[];
  tvShowSchedules: TVShowSchedules[];
}

/** Export produced as a ZIP of CSV files (one for each table in this model) */
export interface CSVExportModel {
  lists: ListExportRow[];
  listItems: ListItemExportRow[];
  contentStatus: ContentStatusExportRow[];
  episodeStatus: EpisodeStatusExportRow[];
  tvShowSchedules: TVShowSchedules[];
}

export interface ImportResult {
  success: boolean;
  imported: {
    lists: number;
    listItems: number;
    contentStatus: number;
    episodeStatus: number;
    tvShowSchedules: number;
  };
  errors: string[];
}

export type ListImportRow = ListExportRow;
export type ListItemImportRow = Omit<
  ListItemExportRow,
  "title" | "releaseDate"
>;
export type ContentStatusImportRow = ContentStatusExportRow;
export type EpisodeStatusImportRow = EpisodeStatusExportRow;
export type TVShowSchedulesImportRow = TVShowSchedules;

export interface JSONImportModel {
  lists: (ListImportRow & { items: ListItemImportRow[] })[];
  contentStatus: ContentStatusImportRow[];
  episodeStatus: EpisodeStatusImportRow[];
  tvShowSchedules: TVShowSchedulesImportRow[];
}
