/**
 * The Series Finale payload is the single contract between the aggregation
 * engine and every consumer -- the story, the desktop recap, and the share
 * image are three renderings of one object, not three query paths.
 *
 * Every optional-looking field is explicitly nullable rather than absent, so a
 * consumer can distinguish "computed, and there is nothing to say" from "this
 * payload predates the field". `schemaVersion` covers the second case.
 */

export const SERIES_FINALE_SCHEMA_VERSION = 1;

/**
 * Minimum individually-ticked episodes before any intra-day statistic is
 * reported. Below this, a handful of ticks would be presented as a habit.
 */
export const SOLO_TICK_FLOOR = 50;

/** Below both of these, the period is too thin to render as a story. */
export const THIN_YEAR_EPISODES = 10;
export const THIN_YEAR_TITLES = 5;

export type ArchetypeId =
  | "serial-abandoner"
  | "completionist"
  | "weekday-marathoner"
  | "feast-or-famine"
  | "nightly-ritualist"
  | "one-genre-only"
  | "deep-cut-hunter"
  | "group-watcher";

// ---------------------------------------------------------------------------
// Input rows -- what the service loads and hands to the engine
// ---------------------------------------------------------------------------

export interface WatchedEpisodeRow {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: Date;
}

export interface ContentStatusRow {
  tmdbId: number;
  contentType: "movie" | "tv";
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TitleMeta {
  tmdbId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genreIds: number[];
  popularity: number;
  runtime: number | null;
}

export interface CrewMemberTotals {
  userId: string;
  username: string;
  episodes: number;
  hours: number;
  /**
   * Their most-watched show for the period, used to fill `topShow.alsoTopFor`.
   * Crew data, so it is stripped along with the rest before any share render.
   */
  topShowTmdbId: number | null;
}

export interface ComparePeer {
  userId: string;
  username: string;
  completedKeys: string[];
  planningKeys: string[];
  droppedKeys: string[];
}

export interface AggregationInput {
  period: { start: Date; end: Date; label: string };
  timeZone: string;
  episodes: WatchedEpisodeRow[];
  statuses: ContentStatusRow[];
  titles: Map<string, TitleMeta>;
  genreNames: Map<number, string>;
  episodeMinutes: { minutes: number; unknownCount: number };
  filmMinutes: { minutes: number; unknownCount: number };
  episodeRuntimeLookup: Map<string, number | null>;
  collaborativeCompletedKeys: Set<string>;
  crew: CrewMemberTotals[];
  peers: ComparePeer[];
  percentile: number | null;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface SeriesFinalePayload {
  schemaVersion: number;
  period: { start: string; end: string; label: string };

  headline: {
    hours: number;
    minutes: number;
    episodes: number;
    titlesCompleted: number;
    titlesDropped: number;
    unknownRuntimeEpisodes: number;
    percentile: number | null;
  };

  episodes: { total: number; perDay: number };
  finished: { films: number; shows: number; total: number };

  topShow: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    episodes: number;
    minutes: number;
    finishedAt: string | null;
    alsoTopFor: string[];
  } | null;

  niche: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    popularity: number;
    medianPopularity: number;
    mostPopular: { tmdbId: number; title: string; popularity: number } | null;
    filmPopularities: number[];
  } | null;

  genres: { name: string; percent: number }[];
  months: { month: number; episodes: number }[];

  bigDay: {
    date: string;
    episodes: number;
    minutes: number;
    timeline: { at: string }[] | null;
    soloTickCount: number;
    streak: { days: number; start: string; end: string } | null;
  } | null;

  rhythm: {
    archetype: ArchetypeId | null;
    weekdayCounts: number[];
    topWeekday: number | null;
    lateShare: number | null;
  };

  shame: {
    dropped: { tmdbId: number; title: string; lastEpisode: string | null }[];
    stillPlanning: {
      tmdbId: number;
      title: string;
      days: number;
      runtime: number | null;
    }[];
  };

  crew: CrewMemberTotals[];

  compare: {
    userId: string;
    username: string;
    onlyYou: number;
    both: number;
    onlyThem: number;
    theyFinishedYouDropped: string | null;
    bothPlanningNeitherStarted: string | null;
  }[];

  thin: boolean;
}

/** Stable key for a title across both content types. */
export function titleKey(tmdbId: number, contentType: "movie" | "tv"): string {
  return `${contentType}:${tmdbId}`;
}
