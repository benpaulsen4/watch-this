// The biggest day's clock (BigDayTimeline, in the recap's panel and the
// story's card) read back, and what it must show for an oracle year: an hour
// axis in the snapshot's zone from the first point's hour to the hour after
// the last, labelled every `step` hours (fewer labels where the axis is
// narrow), one labelled dot per solo tick, and the day's episodes listed
// underneath.
import type { Locator } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { pluralise, words } from "./pages";

/** BigDayTimeline.tsx: NARROW_LABELS, WIDE_LABELS, LABEL_STEPS, LISTED, AXIS_MIN_POINTS. */
const NARROW_LABELS = 7;
const WIDE_LABELS = 13;
const LABEL_STEPS = [1, 2, 3, 4, 6, 12];
const LISTED = 16;
const AXIS_MIN_POINTS = 3;

/** BigDayTimeline.tsx labelStep: every `step`th hour, with as few steps as `most` labels allow. */
function labelStep(hours: number, most: number): number {
  return LABEL_STEPS.find((step) => Math.floor(hours / step) + 1 <= most) ?? 12;
}

const hourClock = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

export interface BigDayShown {
  /** The hour labels on screen (display:none ones left out), left to right. */
  ticks: string[];
  /** Every dot's accessible name, in DOM (time) order: "13:05 · The Bear S2E03". */
  points: string[];
  /** The listed rows as "13:05 The Bear · S2E03". */
  rows: string[];
  /** "And N more." under the list, or null. */
  more: string | null;
  /** "First at 13:05, last at 23:35 · 14 episodes ticked one at a time", or null. */
  summary: string | null;
}

/** Reads the clock inside `container` (the recap's big-day panel or the story's big-day card). */
export async function readBigDay(container: Locator): Promise<BigDayShown> {
  return container.first().evaluate((root) => {
    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const shown = (node: Element) => getComputedStyle(node).display !== "none";
    const rowList = root.querySelector("[data-episode-row]")?.closest("ol");
    const more = rowList?.parentElement?.querySelector(":scope > p");
    const summary = Array.from(root.querySelectorAll("p")).find((p) => /ticked one at a time$/.test(text(p) ?? ""));
    return {
      ticks: Array.from(root.querySelectorAll("[data-tick-label]")).filter(shown).map((node) => text(node) ?? ""),
      points: Array.from(root.querySelectorAll('[data-point] [role="img"]')).map((node) => node.getAttribute("aria-label") ?? ""),
      rows: Array.from(root.querySelectorAll("[data-episode-row]")).map((node) =>
        Array.from(node.children)
          .map((child) => text(child) ?? "")
          .join(" "),
      ),
      more: more ? text(more) : null,
      summary: summary ? text(summary) : null,
    };
  });
}

/**
 * Where the clock is drawn, which decides its hour labels: the recap's panel
 * labels every wide step from lg (1024 px) up and, below lg, only the wide
 * steps that are also narrow ones; the story's card labels the narrow steps.
 */
export type BigDaySurface = "recap-lg" | "recap-below-lg" | "story";

/**
 * What the clock must show for `oracle`'s biggest day on `surface`. Null when
 * the oracle has no timeline (the panel then discloses why instead).
 */
export function expectedBigDay(oracle: OracleYear, surface: BigDaySurface): BigDayShown | null {
  const timeline = oracle.bigDayTimeline;
  if (timeline === null) return null;
  const label = (point: (typeof timeline)[number]) => `${point.time} · ${point.title ? `${point.title} ${point.episode}` : point.episode}`;
  const row = (point: (typeof timeline)[number]) => `${point.time} ${point.title ? `${point.title} · ${point.episode}` : point.episode}`;
  const rows = timeline.slice(0, LISTED).map(row);
  const more = timeline.length > LISTED ? `And ${words(timeline.length - LISTED)} more.` : null;
  if (timeline.length < AXIS_MIN_POINTS) return { ticks: [], points: [], rows, more, summary: null };

  const first = timeline[0]!.time;
  const last = timeline[timeline.length - 1]!.time;
  const start = Number(first.slice(0, 2));
  const hours = Number(last.slice(0, 2)) + 1 - start;
  const narrow = labelStep(hours, NARROW_LABELS);
  const wideStep = labelStep(hours, WIDE_LABELS);
  const ticks = Array.from({ length: hours + 1 }, (_, index) => index)
    .filter((index) =>
      surface === "story" ? index % narrow === 0 : index % wideStep === 0 && (surface === "recap-lg" || index % narrow === 0),
    )
    .map((index) => hourClock(start + index));
  const when = first === last ? `All at ${first}` : `First at ${first}, last at ${last}`;
  return {
    ticks,
    points: timeline.map(label),
    rows,
    more,
    summary: `${when} · ${pluralise(timeline.length, "episode")} ticked one at a time`,
  };
}
