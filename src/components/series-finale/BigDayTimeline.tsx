import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import {
  andMore,
  clockTime,
  soloTickDisclosure,
  TIMELINE_TOO_FEW,
  timelineEpisode,
  timelinePointLabel,
  timelineSummary,
} from "./format";

type BigDay = NonNullable<SeriesFinalePayload["bigDay"]>;
type Timeline = NonNullable<BigDay["timeline"]>;

/** "default" is the recap's panel (1e), "large" the story's card (1c). */
const SIZES = {
  default: {
    text: "text-xs text-gray-500",
    listColumns: "gap-x-8 lg:columns-2",
    rowTime: "text-gray-500",
    rowEpisode: "text-gray-300",
    row: "py-1 text-[13px]",
    track: "bg-gray-700",
    tick: "bg-gray-700",
    tickLabel: "text-[11px] text-gray-500",
    dot: "ring-gray-900",
  },
  large: {
    text: "text-sm text-white/60",
    listColumns: "",
    rowTime: "text-white/50",
    rowEpisode: "text-white/85",
    row: "py-0.5 text-[13px]",
    track: "bg-white/25",
    tick: "bg-white/25",
    tickLabel: "text-[11px] text-white/50",
    dot: "ring-gray-950",
  },
} as const;

const HOUR = 3_600_000;

/** Fewer points than this are a list, not a line: two dots are not a day. */
const AXIS_MIN_POINTS = 3;

/**
 * The most episodes listed under the axis; the rest are counted. Sixteen is
 * eight rows a column on a desktop panel, and keeps the story's card a short
 * scroll on a 360 x 640 phone.
 */
const LISTED = 16;

/**
 * How many hour labels fit: the story's card and a phone's panel are about
 * 260px of axis, a desktop panel at `lg` 420px or more. A "13:00" is about
 * 30px of 11px type.
 */
const NARROW_LABELS = 7;
const WIDE_LABELS = 13;
const LABEL_STEPS = [1, 2, 3, 4, 6, 12];

/**
 * Points nearer than this, in percent of the axis, stack instead of sitting
 * side by side: a dot's width on the narrowest axis (10px of about 240px),
 * so no two dots in a row ever overlap.
 */
const STACK_GAP = 4.5;
const DOT_PX = 10;
const ROW_PX = 12;

/** The labelled hours: every `step`th, with as few steps as `most` allows. */
function labelStep(hours: number, most: number): number {
  return LABEL_STEPS.find((step) => Math.floor(hours / step) + 1 <= most) ?? 12;
}

/**
 * The start of the local hour holding `time`. Every zone's offset is a whole
 * number of minutes, so the local minute (read off the clock) and the UTC
 * second are all that separate an instant from its hour.
 */
function localHourStart(time: number, clock: string): number {
  const minute = Number(clock.slice(3, 5));
  return time - minute * 60_000 - (time % 60_000);
}

interface Placed {
  time: number;
  clock: string;
  /** "13:05 · The Bear S2E03", the dot's accessible name and hover title. */
  label: string;
  /** "The Bear · S2E03", the list row beside the time. */
  episode: string;
}

function place(timeline: Timeline, timeZone: string): Placed[] {
  return timeline
    .flatMap((point) => {
      const time = Date.parse(point.at);
      const clock = clockTime(point.at, timeZone);
      const label = timelinePointLabel(point, timeZone);
      return Number.isNaN(time) || clock === null || label === null
        ? []
        : [{ time, clock, label, episode: timelineEpisode(point) }];
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * The axis runs from the local hour before the first point to the hour after
 * the last, in the snapshot's zone. Points keep their true positions; one
 * too close to the last in its row moves up a row.
 */
function layout(points: Placed[], timeZone: string) {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const start = localHourStart(first.time, first.clock);
  const end = localHourStart(last.time, last.clock) + HOUR;
  const span = end - start;
  const offset = (time: number) => ((time - start) / span) * 100;

  const rowEnds: number[] = [];
  const dots = points.map((point) => {
    const left = offset(point.time);
    let row = rowEnds.findIndex((end) => left - end >= STACK_GAP);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = left;
    return { ...point, left, row };
  });

  const hours = Math.round(span / HOUR);
  const narrowStep = labelStep(hours, NARROW_LABELS);
  const wideStep = labelStep(hours, WIDE_LABELS);
  const ticks = Array.from({ length: hours + 1 }, (_, index) => {
    const time = start + index * HOUR;
    return {
      left: offset(time),
      clock: clockTime(new Date(time).toISOString(), timeZone),
      narrow: index % narrowStep === 0,
      wide: index % wideStep === 0,
    };
  });

  return { dots, ticks, rows: rowEnds.length, first, last };
}

/**
 * How the biggest day went: each episode ticked one at a time, placed at the
 * local time it was ticked on an hour axis as the overview, then listed by
 * time and name underneath. With too few for an axis they are only listed;
 * with no timeline at all, it says why, quoting the period's total.
 */
export function BigDayTimeline({
  bigDay,
  soloTickTotal,
  timeZone,
  size = "default",
}: {
  bigDay: Pick<BigDay, "timeline" | "soloTickCount">;
  /** The period's solo ticks: the number the timeline's floor is judged on. */
  soloTickTotal: number;
  /** `period.timezone`: the zone the day's clock is read in. */
  timeZone: string;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];
  const text = cn("leading-relaxed", styles.text);

  if (bigDay.timeline === null) {
    return <p className={text}>{soloTickDisclosure(soloTickTotal)}</p>;
  }

  const points = place(bigDay.timeline, timeZone);

  if (points.length < AXIS_MIN_POINTS) {
    return (
      <>
        {points.length > 0 ? (
          <EpisodeList points={points} size={size} className="mb-3" />
        ) : null}
        <p className={text}>{TIMELINE_TOO_FEW}</p>
      </>
    );
  }

  const { dots, ticks, rows, first, last } = layout(points, timeZone);
  const large = size === "large";

  return (
    <>
      {/* Inset, so an hour label centred on either end stays inside. */}
      <div className="mx-4">
        {/* Over the axis, which a first-row dot straddles, so hover finds it. */}
        <ol
          className="relative z-10"
          style={{ height: (rows - 1) * ROW_PX + DOT_PX / 2 + 4 }}
        >
          {dots.map((dot, index) => (
            <li
              key={index}
              data-point=""
              data-row={dot.row}
              className="absolute -translate-x-1/2"
              style={{
                left: `${dot.left}%`,
                bottom: dot.row * ROW_PX - DOT_PX / 2,
              }}
            >
              <span
                role="img"
                aria-label={dot.label}
                title={dot.label}
                className={cn(
                  "block h-2.5 w-2.5 rounded-full bg-red-500 ring-2",
                  styles.dot,
                )}
              />
            </li>
          ))}
        </ol>
        <div aria-hidden="true" className="relative h-6">
          <div className={cn("absolute inset-x-0 top-0 h-px", styles.track)} />
          {ticks.map((tick, index) => {
            // The story's card is always narrow; a panel is wide from `lg`.
            const labelled = large ? tick.narrow : tick.wide;
            return (
              <div key={index}>
                <span
                  className={cn("absolute top-0 h-1.5 w-px", styles.tick)}
                  style={{ left: `${tick.left}%` }}
                />
                {labelled ? (
                  <span
                    data-tick-label=""
                    className={cn(
                      "absolute top-2 -translate-x-1/2 leading-none tabular-nums",
                      styles.tickLabel,
                      !tick.narrow && "hidden lg:block",
                    )}
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.clock}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <p className={cn("mt-2", text)}>
        {timelineSummary(first.clock, last.clock, bigDay.soloTickCount)}
      </p>
      <EpisodeList points={points} size={size} className="mt-4" />
    </>
  );
}

/**
 * The day's episodes as rows, "13:05  The Bear · S2E03", in time order: what
 * each dot is, readable without hovering. At most `LISTED`, the rest counted.
 * Two columns on a desktop panel, one on a phone and on the story's card.
 */
function EpisodeList({
  points,
  size,
  className,
}: {
  points: Placed[];
  size: keyof typeof SIZES;
  className?: string;
}) {
  const styles = SIZES[size];
  const more = andMore(points.length - LISTED);

  return (
    <div className={className}>
      <ol className={styles.listColumns}>
        {points.slice(0, LISTED).map((point, index) => (
          <li
            key={index}
            data-episode-row=""
            className={cn("flex gap-3 break-inside-avoid", styles.row)}
          >
            {/* A set width too: the brand face's digits are not all
                tabular, and the names should start on one line. */}
            <span className={cn("w-11 flex-none tabular-nums", styles.rowTime)}>
              {point.clock}
            </span>
            <span
              className={cn(
                "min-w-0 leading-snug [overflow-wrap:anywhere]",
                styles.rowEpisode,
              )}
            >
              {point.episode}
            </span>
          </li>
        ))}
      </ol>
      {more ? <p className={cn("mt-2", styles.text)}>{more}</p> : null}
    </div>
  );
}
