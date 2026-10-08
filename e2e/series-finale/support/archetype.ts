// The archetype's picture (ArchetypeVisual: `[data-archetype-visual]` around
// one `role="img"`), in the recap's "Your type" panel and the story's rhythm
// card, and the sentence its aria-label must be for an oracle year. The
// wording is the app's (format.ts, ArchetypeVisual.tsx, RhythmCharts.tsx);
// every number in it comes from the oracle.
import type { Locator } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { capitalise, percent, weekdayName, words } from "./pages";

/**
 * The archetype each persona's 2025 is classified as in this cast (the seeded
 * statistics; ava's is pinned in generate.test.ts, the rest were read off the
 * seeded app in plan 6 Task 6). The classifier itself is the engine's and is
 * not re-derived; what is checked is that each type draws its own picture
 * with the oracle's numbers.
 */
export const SEEDED_ARCHETYPES: Record<string, string> = {
  e2e_ava: "weekday-marathoner",
  e2e_bo: "one-genre-only",
  e2e_bat: "one-genre-only",
  e2e_flo_watches_only_films_and_has_a_long_name: "completionist",
};

export interface ArchetypeVisualShown {
  archetype: string | null;
  label: string | null;
}

/** The picture inside `container`: its archetype id and its image's accessible name (nulls when absent). */
export async function readArchetypeVisual(container: Locator): Promise<ArchetypeVisualShown> {
  const visual = container.locator("[data-archetype-visual]");
  if ((await visual.count()) === 0) return { archetype: null, label: null };
  return {
    archetype: await visual.first().getAttribute("data-archetype-visual"),
    label: await visual.first().getByRole("img").first().getAttribute("aria-label"),
  };
}

/** format.ts smallRatio: the exact ratio with a denominator up to five, else the simplest within 10%, else the closest. */
function smallRatio(larger: number, smaller: number): { p: number; q: number; exact: boolean } {
  const ratio = larger / smaller;
  const candidates = [1, 2, 3, 4, 5].map((q) => {
    const p = Math.max(1, Math.round(ratio * q));
    return { p, q, error: Math.abs(p / q - ratio) };
  });
  const exact = candidates.find(({ p, q }) => larger * q === p * smaller);
  const close = candidates.find(({ error }) => error <= ratio * 0.1);
  const closest = candidates.reduce((best, candidate) => (candidate.error < best.error ? candidate : best));
  const { p, q } = exact ?? close ?? closest;
  return { p, q, exact: exact !== undefined };
}

/** format.ts finishedDroppedLine. */
function finishedDroppedLine(completed: number, dropped: number): string | null {
  if (completed <= 0 && dropped <= 0) return null;
  if (dropped <= 0) return "Nothing dropped.";
  if (completed <= 0) return "Nothing finished.";
  const finishedLeads = completed >= dropped;
  const { p, q, exact } = finishedLeads ? smallRatio(completed, dropped) : smallRatio(dropped, completed);
  const [lead, trail] = finishedLeads ? ["finished", "dropped"] : ["dropped", "finished"];
  const phrase = `${words(p)} ${lead} for every ${words(q)} ${trail}.`;
  return exact ? capitalise(phrase) : `About ${phrase}`;
}

const hourLabel = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

/**
 * The picture's aria-label for `archetype` with `oracle`'s numbers, or
 * undefined for a type whose numbers the oracle does not compute
 * (deep-cut-hunter's popularities, feast-or-famine's months are computed but
 * the type is unseeded -- see the report's "not automated"). Null where the
 * type would draw nothing.
 */
export function expectedArchetypeLabel(archetype: string, oracle: OracleYear): string | null | undefined {
  switch (archetype) {
    case "weekday-marathoner":
      return oracle.weekdayCounts.some((count) => count > 0)
        ? oracle.topWeekday === null
          ? "Episodes by weekday."
          : `Episodes by weekday. Peak ${weekdayName(oracle.topWeekday)}.`
        : null;
    case "one-genre-only":
      // A tie at the top is decided by query order in the app, so the name is
      // the oracle's only when the oracle has one.
      return oracle.topGenre && oracle.topGenre.names.length === 1
        ? `${oracle.topGenre.names[0]!}: ${percent(oracle.topGenre.share, 1)}% of what you finished.`
        : oracle.topGenre
          ? undefined
          : null;
    case "completionist":
    case "serial-abandoner": {
      const ratio = finishedDroppedLine(oracle.titlesCompleted, oracle.titlesDropped);
      return ratio
        ? `Titles finished against titles dropped: ${oracle.titlesCompleted.toLocaleString("en-GB")} finished, ${oracle.titlesDropped.toLocaleString("en-GB")} dropped. ${ratio}`
        : null;
    }
    case "group-watcher":
      return oracle.sharedListShare === null ? null : `${percent(oracle.sharedListShare, 1)}% of what you finished was on a shared list.`;
    case "nightly-ritualist": {
      const hours = oracle.hourCounts;
      const window = oracle.busiestWindow;
      const total = hours ? hours.reduce((sum, count) => sum + count, 0) : 0;
      if (!hours || !window || total === 0) return null;
      const span = `${hourLabel(window.start)}–${hourLabel(window.start + 3)}`;
      return `Episodes ticked one at a time, by hour of the day. Busiest three hours ${span}: ${percent(window.count, total)}% of them.`;
    }
    default:
      return undefined;
  }
}
