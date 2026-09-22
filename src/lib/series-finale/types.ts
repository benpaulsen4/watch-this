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

/**
 * What the loader hands the engine.
 *
 * The two row arrays are deliberately scoped differently, and nothing in the
 * types can enforce it -- see the notes on each. Getting either wrong produces
 * a plausible-looking recap rather than an error.
 */
export interface AggregationInput {
  period: { start: Date; end: Date; label: string };
  timeZone: string;
  /**
   * Episodes watched **inside the period**, and only those.
   *
   * Nothing downstream re-filters them: `headline.episodes`, `episodes.total`,
   * `episodes.perDay`, `topShow`, `bigDay`, `rhythm`, `months` and the
   * archetype's solo-tick inputs all consume this array whole. Hand it a
   * user's entire history and every one of those silently describes their
   * lifetime instead of their year -- a bigger `bigDay` than the year held, a
   * streak that never happened, and a `perDay` computed over the wrong
   * numerator. Nothing throws.
   */
  episodes: WatchedEpisodeRow[];
  /**
   * Status rows for **every title the user has**, all-time, not scoped to the
   * period.
   *
   * The aggregators that want the period apply their own `isWithin` on
   * `updatedAt` (`countFinished`, `countDropped`, `buildNiche`, `buildGenres`,
   * `buildShame`'s dropped list, the paused count), so pre-filtering buys them
   * nothing. One consumer deliberately wants everything: `buildShame`'s
   * `stillPlanning`, which is there to name the film added three years ago and
   * never watched. A period-scoped array keeps only the rows touched this
   * year, so exactly the worst offenders vanish and the list comes back short
   * but well-formed -- again without throwing.
   */
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
    /**
     * Individually-ticked episodes on `date`, in time order, or null when the
     * period as a whole has too few of them to describe a time of day.
     *
     * The floor is a period-level gate, not a per-day one, so a non-null
     * timeline may still hold very few points -- one is possible, for a user
     * who ticks episodes individually all year but happened to bulk-mark their
     * biggest day. Renderers should check the length before drawing anything
     * that implies a session, rather than assuming non-null means chartable.
     */
    timeline: { at: string }[] | null;
    /**
     * Solo ticks on `date` only. Not the period-wide count that gates
     * `timeline` and feeds `ArchetypeInput.soloTickCount` -- same name, and
     * deliberately different denominators.
     */
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
    dropped: {
      tmdbId: number;
      title: string;
      /**
       * Furthest episode reached, in season/episode order, **drawn only from
       * `AggregationInput.episodes`** -- which is period-scoped. A show
       * dropped in the period but last actually watched in an earlier one
       * therefore reports null rather than the episode the user stopped on.
       * Accepted: the alternative is loading an all-time episode map for a
       * single line of copy. A caller that wants it can supply one.
       */
      lastEpisode: string | null;
    }[];
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
