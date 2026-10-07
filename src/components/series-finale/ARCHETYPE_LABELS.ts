import type { ArchetypeId } from "@/lib/series-finale/types";

/**
 * Display copy for each archetype. The weekday marathoner's name is a template:
 * `{weekday}` is the user's actual top weekday, filled in by `archetypeName`
 * in `./format` -- read names through that helper, not from here directly.
 */
export const ARCHETYPE_LABELS: Record<
  ArchetypeId,
  { name: string; blurb: string }
> = {
  "serial-abandoner": {
    name: "The Serial Abandoner",
    blurb: "You start a lot of things. You finish rather fewer of them.",
  },
  completionist: {
    name: "The Completionist",
    blurb: "Once you start something you see it through, whatever it costs.",
  },
  "weekday-marathoner": {
    name: "The {weekday} Marathoner",
    blurb: "One day a week does most of the work.",
  },
  "feast-or-famine": {
    name: "Feast or Famine",
    blurb: "Months of nothing, then a fortnight where you watch everything.",
  },
  "nightly-ritualist": {
    name: "The Nightly Ritualist",
    blurb: "Same window, most nights. It is a routine at this point.",
  },
  "one-genre-only": {
    name: "One Genre Only",
    blurb: "You know what you like, and you have stopped pretending otherwise.",
  },
  "deep-cut-hunter": {
    name: "The Deep Cut Hunter",
    blurb: "Most of what you finished, nobody else has heard of.",
  },
  "group-watcher": {
    name: "The Group Watcher",
    blurb: "Half your year happened on somebody else's list.",
  },
};
