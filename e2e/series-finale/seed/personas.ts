// The e2e cast. Each account exists to make one or more Series Finale
// statistics observable, and the generator turns these declarative specs into
// rows. Nothing here is a timestamp written by hand except the zone edges.
//
// Constraints the numbers below are chosen against (see the Task 3 report):
// - A title has one status per user, so no key repeats within a persona, and a
//   show's episodes continue across years instead of restarting.
// - Only episodes aired by the end of the watch year are used. For 2025 that
//   caps The Bear at 38 (S1-S4), which caps every show that must rank below it
//   as someone's top show at 37 -- the reason ava's year is ~230 episodes, not
//   the ~420 first sketched.
// - Top-show ties go to the lower tmdbId, and The Bear's (136315) is higher
//   than almost every rival's, so "The Bear is top" is kept strictly ahead
//   rather than left to a tie.
// - Hacks is watched by e2e_ava alone, so nulling three of its runtimes
//   (UNKNOWN_RUNTIME_EPISODES) touches nobody else's hours; Station Eleven is
//   watched by ava alone, so deleting its cache row (`uncached`) does the same.
// - Only states the app can produce: films are planning or completed, never
//   dropped.

export interface YearSpec {
  // `uncached`: the seeder deletes this title's tmdb_cache row after warming.
  shows: { key: string; episodes: number; outcome?: "completed" | "dropped" | "watching"; outcomeOn?: string; uncached?: true }[];
  // Films are only ever completed: the app has no dropped state for a film
  // (MovieWatchStatus is planning/completed; the status API rejects the rest).
  films: { key: string; outcome: "completed"; on?: string }[];
  weekdayWeights: [number, number, number, number, number, number, number]; // Sun..Sat
  soloShare: number; // 0..1 of episodes ticked alone
  lateShareOfSolo: number; // 0..1 of solo ticks after 21:00 local
  bigDay?: { date: string; episodes: number };
  streak?: { start: string; days: number };
  extraEpisodes?: { key: string; season: number; episode: number; localDateTime: string }[]; // zone edges
}

export interface PersonaSpec {
  username: string;
  signsIn: boolean;
  timezone: "UTC" | "Australia/Brisbane";
  createdAt: string; // ISO date
  shareStatsWithCollaborators?: boolean; // default true
  years: Record<number, YearSpec>;
  planning?: { key: string; addedOn: string }[]; // ISO date, local
  lists?: { name: string; collaborators: string[]; items: string[] }[]; // owned lists
}

// Weekday weights, Sunday first.
const SUNDAY_HEAVY: YearSpec["weekdayWeights"] = [0.4, 0.07, 0.07, 0.09, 0.09, 0.13, 0.15];
const EVEN: YearSpec["weekdayWeights"] = [1, 1, 1, 1, 1, 1, 1];
const WEEKENDS: YearSpec["weekdayWeights"] = [2, 1, 1, 1, 1, 1.5, 2];
const WEEKNIGHTS: YearSpec["weekdayWeights"] = [1, 1.5, 1.5, 1.5, 1.5, 1, 0.5];

const COLLABORATORS = ["e2e_bo", "e2e_cy", "e2e_dee", "e2e_eli", "e2e_fay", "e2e_gus", "e2e_hal", "e2e_ivy", "e2e_jon"];

/**
 * Three of ava's 2025 episodes whose cached runtime the seeder nulls (keeping
 * their `tmdb_season_fetch` row), so the unknown-runtime disclosure reads
 * "3 episodes or films". Nobody else watches Hacks.
 */
export const UNKNOWN_RUNTIME_EPISODES = [
  { key: "hacks", season: 2, episode: 1 },
  { key: "hacks", season: 2, episode: 2 },
  { key: "hacks", season: 2, episode: 3 },
] as const;

/** A light, UTC collaborator: one 2025, evenly spread, a few films. */
function collaborator(
  username: string,
  shows: YearSpec["shows"],
  films: string[],
  weights: YearSpec["weekdayWeights"] = EVEN,
): PersonaSpec {
  return {
    username,
    signsIn: false,
    timezone: "UTC",
    createdAt: "2023-03-01",
    years: {
      2025: {
        shows,
        films: films.map((key) => ({ key, outcome: "completed" as const })),
        weekdayWeights: weights,
        soloShare: 0.45,
        lateShareOfSolo: 0.35,
      },
    },
  };
}

/** A percentile-cohort member: a non-thin 2025, shared with nobody. */
function cohort(n: number, shows: YearSpec["shows"], films: string[], weights: YearSpec["weekdayWeights"]): PersonaSpec {
  return {
    username: `e2e_pop${String(n).padStart(2, "0")}`,
    signsIn: false,
    timezone: "UTC",
    createdAt: "2023-01-15",
    years: {
      2025: {
        shows,
        films: films.map((key) => ({ key, outcome: "completed" as const })),
        weekdayWeights: weights,
        soloShare: 0.4,
        lateShareOfSolo: 0.3,
      },
    },
  };
}

export const PERSONAS: PersonaSpec[] = [
  // The main viewer. Rich 2025, moderate 2024, thin 2023; owns the shared list.
  {
    username: "e2e_ava",
    signsIn: true,
    timezone: "Australia/Brisbane",
    createdAt: "2023-02-01",
    years: {
      2023: {
        shows: [{ key: "fleabag", episodes: 6 }],
        films: [
          { key: "florida-project", outcome: "completed" },
          { key: "minari", outcome: "completed" },
        ],
        weekdayWeights: SUNDAY_HEAVY,
        soloShare: 0.5,
        lateShareOfSolo: 0.4,
      },
      2024: {
        shows: [
          { key: "taskmaster", episodes: 36 },
          { key: "succession", episodes: 10 },
          { key: "andor", episodes: 12 },
          { key: "last-of-us", episodes: 9 },
          { key: "ted-lasso", episodes: 34, outcome: "completed" },
          { key: "res-dogs", episodes: 28, outcome: "completed" },
          { key: "slow-horses", episodes: 24 },
          { key: "fleabag", episodes: 6, outcome: "completed" },
        ],
        films: ["parasite", "portrait", "moonlight", "lady-bird", "roma", "worst-person", "banshees", "godzilla-minus-one"].map(
          (key) => ({ key, outcome: "completed" as const }),
        ),
        weekdayWeights: SUNDAY_HEAVY,
        soloShare: 0.5,
        lateShareOfSolo: 0.4,
      },
      2025: {
        shows: [
          { key: "bear", episodes: 38, outcome: "completed" }, // top show: S1-S4, all of it by 2025
          { key: "taskmaster", episodes: 27 },
          { key: "office", episodes: 36 }, // + the 2025-01-01 zone-edge episode = 37
          { key: "succession", episodes: 29, outcome: "completed" },
          { key: "severance", episodes: 19, outcome: "completed" },
          { key: "shogun", episodes: 10, outcome: "completed" },
          // Dropped as of the last episode watched. bo finishes Mr. Robot in 2025.
          // Five dropped against 26 completed keeps rule 2 (completionist,
          // >= 0.9) well out of reach: 26/31 = 0.839.
          { key: "mr-robot", episodes: 30, outcome: "dropped" },
          { key: "hacks", episodes: 30, outcome: "dropped" },
          { key: "last-of-us", episodes: 3, outcome: "dropped" }, // S2, after S1 in 2024
          { key: "andor", episodes: 4, outcome: "dropped" }, // S2, after S1 in 2024
          // Left out of tmdb_cache by the seeder: the headline dropped count (5)
          // exceeds the named dropped titles (4) -> "And one more."
          { key: "station-eleven", episodes: 3, outcome: "dropped", uncached: true },
        ],
        films: [
          "dune-2", "oppenheimer", "poor-things", "eeaao", "substance", "brutalist", "furiosa", "anora",
          "perfect-days", "challengers", "past-lives", "aftersun", "anatomy", "conclave", "holdovers", "flow",
          "real-pain", "zone-of-interest", "tv-glow", "monster", "evil", "ich-war-zuhause",
        ].map((key) => ({ key, outcome: "completed" as const })),
        weekdayWeights: SUNDAY_HEAVY,
        soloShare: 0.55,
        lateShareOfSolo: 0.45,
        bigDay: { date: "2025-03-15", episodes: 14 },
        streak: { start: "2025-07-04", days: 17 },
        extraEpisodes: [
          // 2024-12-31 19:00 UTC: counts in ava's 2025.
          { key: "office", season: 1, episode: 1, localDateTime: "2025-01-01T05:00" },
          // 2025-12-31 22:00 UTC: does not.
          { key: "office", season: 3, episode: 10, localDateTime: "2026-01-01T08:00" },
        ],
      },
    },
    planning: [
      { key: "nickel-boys", addedOn: "2024-03-18" },
      { key: "fallen-leaves", addedOn: "2024-09-07" }, // on bo's planning list too
      { key: "petite-maman", addedOn: "2025-06-14" },
      { key: "columbus", addedOn: "2026-02-10" }, // after 2025 ended: not "still waiting" in 2025
    ],
    lists: [
      {
        name: "Couch Crew",
        collaborators: COLLABORATORS,
        items: ["bear", "severance", "office", "dune-2", "perfect-days", "fallen-leaves"],
      },
    ],
  },

  // Out-watches ava in 2025 with the same top show; finished the show ava
  // dropped; plans the film ava plans; 10 finished titles in common.
  {
    username: "e2e_bo",
    signsIn: true,
    timezone: "UTC",
    createdAt: "2023-03-01",
    years: {
      2024: {
        shows: [
          { key: "mr-robot", episodes: 20 },
          { key: "fleabag", episodes: 12, outcome: "completed" },
        ],
        films: ["parasite", "moonlight", "roma", "lady-bird"].map((key) => ({ key, outcome: "completed" as const })),
        weekdayWeights: WEEKENDS,
        soloShare: 0.45,
        lateShareOfSolo: 0.3,
      },
      2025: {
        shows: [
          { key: "bear", episodes: 38, outcome: "completed" },
          { key: "mr-robot", episodes: 25, outcome: "completed" },
          { key: "office", episodes: 37 },
          { key: "taskmaster", episodes: 37 },
          { key: "severance", episodes: 19, outcome: "completed" },
          { key: "shogun", episodes: 10, outcome: "completed" },
          { key: "ted-lasso", episodes: 34, outcome: "completed" },
          { key: "slow-horses", episodes: 30 },
          { key: "last-of-us", episodes: 16 },
          { key: "andor", episodes: 24 },
          { key: "rehearsal", episodes: 12 },
        ],
        films: ["dune-2", "oppenheimer", "poor-things", "past-lives", "anora", "conclave", "challengers", "paterson", "nomadland"].map(
          (key) => ({ key, outcome: "completed" as const }),
        ),
        weekdayWeights: WEEKENDS,
        soloShare: 0.45,
        lateShareOfSolo: 0.3,
      },
    },
    planning: [
      { key: "fallen-leaves", addedOn: "2024-05-02" },
      { key: "jeanne-dielman", addedOn: "2025-08-20" },
    ],
  },

  // Light collaborator whose top show is also The Bear; opts out mid-suite.
  {
    ...collaborator(
      "e2e_cy",
      [
        { key: "bear", episodes: 20 },
        { key: "fleabag", episodes: 12, outcome: "completed" },
        { key: "rehearsal", episodes: 6 },
      ],
      ["dune-2", "flow", "perfect-days"],
    ),
    signsIn: true,
  },

  // Exactly ava's 2025 episode count (230 in ava's window) -> a tied crew rank.
  collaborator(
    "e2e_dee",
    [
      { key: "taskmaster", episodes: 80 },
      { key: "office", episodes: 70 },
      { key: "slow-horses", episodes: 30 },
      { key: "res-dogs", episodes: 28, outcome: "completed" },
      { key: "andor", episodes: 22 },
    ],
    ["oppenheimer", "past-lives"],
  ),
  collaborator(
    "e2e_eli",
    [
      { key: "taskmaster", episodes: 70 },
      { key: "office", episodes: 50 },
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "severance", episodes: 19, outcome: "completed" },
      { key: "last-of-us", episodes: 7 },
    ],
    ["dune-2", "anora", "conclave"],
    WEEKNIGHTS,
  ),
  collaborator(
    "e2e_fay",
    [
      { key: "office", episodes: 60 },
      { key: "ted-lasso", episodes: 34, outcome: "completed" },
      { key: "andor", episodes: 24, outcome: "completed" },
      { key: "fleabag", episodes: 12, outcome: "completed" },
      { key: "rehearsal", episodes: 10 },
    ],
    ["holdovers", "challengers"],
    WEEKENDS,
  ),
  collaborator(
    "e2e_gus",
    [
      { key: "mr-robot", episodes: 45, outcome: "completed" },
      { key: "slow-horses", episodes: 30 },
      { key: "shogun", episodes: 10, outcome: "completed" },
      { key: "last-of-us", episodes: 10 },
    ],
    ["furiosa", "substance"],
  ),
  collaborator(
    "e2e_hal",
    [
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "fleabag", episodes: 12, outcome: "completed" },
      { key: "rehearsal", episodes: 9 },
    ],
    ["zone-of-interest"],
    WEEKNIGHTS,
  ),
  collaborator(
    "e2e_ivy",
    [
      { key: "res-dogs", episodes: 28, outcome: "completed" },
      { key: "fleabag", episodes: 12, outcome: "completed" },
    ],
    ["aftersun"],
  ),
  // On the list, but nothing at all in 2025.
  {
    username: "e2e_jon",
    signsIn: false,
    timezone: "UTC",
    createdAt: "2023-03-01",
    years: {
      2024: {
        shows: [{ key: "ted-lasso", episodes: 20 }],
        films: [{ key: "paterson", outcome: "completed" }],
        weekdayWeights: EVEN,
        soloShare: 0.45,
        lateShareOfSolo: 0.35,
      },
    },
  },

  // Thin 2025 (7 episodes, 2 films) after a real 2024.
  {
    username: "e2e_tia",
    signsIn: true,
    timezone: "UTC",
    createdAt: "2024-01-10",
    years: {
      2024: {
        shows: [
          { key: "last-of-us", episodes: 9 },
          { key: "andor", episodes: 12 },
        ],
        films: [{ key: "past-lives", outcome: "completed" }],
        weekdayWeights: EVEN,
        soloShare: 0.5,
        lateShareOfSolo: 0.3,
      },
      2025: {
        shows: [{ key: "fleabag", episodes: 7 }],
        films: [
          { key: "flow", outcome: "completed" },
          { key: "anora", outcome: "completed" },
        ],
        weekdayWeights: EVEN,
        soloShare: 0.5,
        lateShareOfSolo: 0.3,
      },
    },
  },

  // Joined in 2026: no completed year at all.
  {
    username: "e2e_neo",
    signsIn: true,
    timezone: "UTC",
    createdAt: "2026-05-01",
    years: {},
    planning: [{ key: "nomadland", addedOn: "2026-05-03" }],
  },

  // Batch ticker: every 2025 episode shares its timestamp with another, so no
  // intra-day statistic can be shown.
  {
    username: "e2e_bat",
    signsIn: true,
    timezone: "UTC",
    createdAt: "2023-06-01",
    years: {
      2025: {
        shows: [
          { key: "office", episodes: 90 },
          { key: "taskmaster", episodes: 90 },
          { key: "ted-lasso", episodes: 34, outcome: "completed" },
          { key: "andor", episodes: 6 },
        ],
        films: [
          { key: "godzilla-minus-one", outcome: "completed" },
          { key: "dune-2", outcome: "completed" },
        ],
        weekdayWeights: EVEN,
        soloShare: 0,
        lateShareOfSolo: 0,
      },
    },
  },

  // Films only in 2025, and the longest username the share card has to fit.
  {
    username: "e2e_flo_watches_only_films_and_has_a_long_name",
    signsIn: true,
    timezone: "UTC",
    createdAt: "2023-06-01",
    years: {
      2025: {
        shows: [],
        films: [
          "jeanne-dielman", "dune-2", "past-lives", "aftersun", "perfect-days", "anatomy", "zone-of-interest",
          "poor-things", "oppenheimer", "eeaao", "paterson", "columbus", "drive-my-car", "petite-maman", "holdovers",
          "challengers", "conclave", "brutalist", "flow", "anora", "substance", "real-pain", "nickel-boys", "tv-glow",
          "evil", "fallen-leaves", "monster", "ich-war-zuhause",
        ].map((key) => ({ key, outcome: "completed" as const })),
        weekdayWeights: WEEKENDS,
        soloShare: 0.5,
        lateShareOfSolo: 0.5,
      },
    },
  },

  // The percentile cohort, heaviest first. pop01 and pop02 sit above ava's
  // hours, the rest below; pop12 is the lightest non-thin year.
  cohort(
    1,
    [
      { key: "office", episodes: 186, outcome: "completed" },
      { key: "taskmaster", episodes: 150 },
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "mr-robot", episodes: 45, outcome: "completed" },
      { key: "ted-lasso", episodes: 34, outcome: "completed" },
      { key: "slow-horses", episodes: 30 },
      { key: "andor", episodes: 24, outcome: "completed" },
      { key: "severance", episodes: 19, outcome: "completed" },
    ],
    ["dune-2", "oppenheimer", "brutalist", "anatomy", "poor-things", "eeaao", "substance", "furiosa", "conclave", "anora"],
    EVEN,
  ),
  cohort(
    2,
    [
      { key: "taskmaster", episodes: 120 },
      { key: "office", episodes: 120 },
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "mr-robot", episodes: 45, outcome: "completed" },
      { key: "last-of-us", episodes: 16 },
      { key: "shogun", episodes: 10, outcome: "completed" },
      { key: "andor", episodes: 24, outcome: "completed" },
    ],
    ["dune-2", "oppenheimer", "brutalist", "drive-my-car", "challengers", "holdovers"],
    WEEKENDS,
  ),
  cohort(
    3,
    [
      { key: "taskmaster", episodes: 100 },
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "ted-lasso", episodes: 34, outcome: "completed" },
      { key: "slow-horses", episodes: 30 },
    ],
    ["oppenheimer", "poor-things", "anora", "conclave"],
    WEEKNIGHTS,
  ),
  cohort(
    4,
    [
      { key: "office", episodes: 150 },
      { key: "mr-robot", episodes: 45, outcome: "completed" },
      { key: "andor", episodes: 24, outcome: "completed" },
      { key: "severance", episodes: 19, outcome: "completed" },
    ],
    ["dune-2", "furiosa", "substance", "flow"],
    EVEN,
  ),
  cohort(
    5,
    [
      { key: "taskmaster", episodes: 80 },
      { key: "succession", episodes: 39, outcome: "completed" },
      { key: "fleabag", episodes: 12, outcome: "completed" },
      { key: "shogun", episodes: 10, outcome: "completed" },
    ],
    ["past-lives", "aftersun", "perfect-days"],
    WEEKENDS,
  ),
  cohort(
    6,
    [
      { key: "office", episodes: 100 },
      { key: "ted-lasso", episodes: 34, outcome: "completed" },
      { key: "last-of-us", episodes: 16 },
      { key: "andor", episodes: 24, outcome: "completed" },
    ],
    ["holdovers", "real-pain"],
    WEEKNIGHTS,
  ),
  cohort(
    7,
    [
      { key: "taskmaster", episodes: 60 },
      { key: "slow-horses", episodes: 30 },
      { key: "res-dogs", episodes: 28, outcome: "completed" },
    ],
    ["challengers"],
    EVEN,
  ),
  cohort(
    8,
    [
      { key: "office", episodes: 90 },
      { key: "mr-robot", episodes: 30 },
      { key: "fleabag", episodes: 12, outcome: "completed" },
    ],
    ["conclave"],
    WEEKENDS,
  ),
  cohort(
    9,
    [
      { key: "succession", episodes: 30 },
      { key: "severance", episodes: 19, outcome: "completed" },
      { key: "rehearsal", episodes: 12, outcome: "completed" },
    ],
    [],
    WEEKNIGHTS,
  ),
  cohort(
    10,
    [
      { key: "taskmaster", episodes: 40 },
      { key: "res-dogs", episodes: 28, outcome: "completed" },
    ],
    [],
    EVEN,
  ),
  cohort(
    11,
    [
      { key: "office", episodes: 60 },
      { key: "fleabag", episodes: 12, outcome: "completed" },
      { key: "shogun", episodes: 8 },
    ],
    [],
    WEEKENDS,
  ),
  cohort(
    12,
    [
      { key: "office", episodes: 50 },
      { key: "rehearsal", episodes: 12, outcome: "completed" },
    ],
    ["flow"],
    EVEN,
  ),
];
