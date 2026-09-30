import type {
  ArchetypeId,
  SeriesFinalePayload,
} from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { BarChart } from "./BarChart";
import {
  feastLine,
  feastMonths,
  finishedDroppedLine,
  formatCount,
  hourClockLines,
  hourLabel,
  monthInitial,
  sharedListLine,
  topGenreLine,
} from "./format";
import { POPULARITY_STRIP_MIN_FILMS, PopularityStrip } from "./PopularityStrip";
import { WeekdayStrip } from "./RhythmCharts";

type Payload = SeriesFinalePayload;

/**
 * Tones per surface: "default" is the recap's gray card, "large" the story's
 * wash (as `GenreBars` and `PopularityStrip` split them).
 */
const TONES = {
  default: {
    track: "bg-gray-700",
    bar: "bg-gray-700",
    baseline: "border-gray-700",
    caption: "text-sm leading-relaxed text-gray-400",
    label: "text-xs text-gray-500",
    figure: "text-5xl text-gray-50",
  },
  large: {
    track: "bg-white/10",
    bar: "bg-white/25",
    baseline: "border-white/15",
    caption: "text-[15px] leading-relaxed text-white/70",
    label: "text-xs text-white/45",
    figure: "text-5xl text-white",
  },
} as const;

type Tone = (typeof TONES)[keyof typeof TONES];

const HIGHLIGHT = "bg-gradient-to-t from-red-600 to-orange-500";
const HIGHLIGHT_ACROSS = "bg-gradient-to-r from-red-600 to-orange-500";
const HIGHLIGHT_LABEL = "font-semibold text-red-400";

/** The hours the clock's axis names. */
const CLOCK_TICKS = [0, 6, 12, 18] as const;

/**
 * The picture under the archetype, one per type, each drawn from exactly the
 * payload field the type is about -- the same component on the recap's "Your
 * type" panel and the story's rhythm card. Every picture names itself in an
 * `aria-label` sentence, and draws nothing (not even `className`'s wrapper)
 * when its data is missing, or when there is no archetype at all.
 */
export function ArchetypeVisual({
  payload,
  size = "default",
  className,
}: {
  payload: Payload;
  size?: keyof typeof TONES;
  /** Spacing for the visual, dropped with it when there is none to draw. */
  className?: string;
}) {
  const { archetype } = payload.rhythm;
  if (archetype === null) return null;

  const visual = renderVisual(archetype, payload, size);
  if (!visual) return null;

  return (
    <div className={className} data-archetype-visual={archetype}>
      {visual}
    </div>
  );
}

/**
 * The type's picture, or null when its data is missing -- decided here, before
 * any element exists, so `ArchetypeVisual` can leave its wrapper out too.
 */
function renderVisual(
  archetype: ArchetypeId,
  payload: Payload,
  size: keyof typeof TONES,
) {
  const tone = TONES[size];
  const { rhythm, headline } = payload;

  switch (archetype) {
    case "weekday-marathoner":
      return rhythm.weekdayCounts.some((count) => count > 0) ? (
        <WeekdayStrip rhythm={rhythm} size="medium" />
      ) : null;

    case "nightly-ritualist": {
      const lines = rhythm.hourCounts && hourClockLines(rhythm.hourCounts);
      return rhythm.hourCounts && lines ? (
        <HourClock hourCounts={rhythm.hourCounts} lines={lines} tone={tone} />
      ) : null;
    }

    case "one-genre-only": {
      const { topGenreName, topGenreShare } = rhythm;
      return topGenreName !== null && topGenreShare !== null ? (
        <ShareBar
          percent={Math.round(topGenreShare * 100)}
          label={topGenreLine(topGenreName, topGenreShare)}
          tone={tone}
        />
      ) : null;
    }

    case "deep-cut-hunter":
      return payload.niche &&
        payload.niche.filmPopularities.length >= POPULARITY_STRIP_MIN_FILMS ? (
        <PopularityStrip
          popularities={payload.niche.filmPopularities}
          size={size}
        />
      ) : null;

    case "completionist":
    case "serial-abandoner": {
      const ratio = finishedDroppedLine(
        headline.titlesCompleted,
        headline.titlesDropped,
      );
      return ratio ? (
        <FinishedDropped
          completed={headline.titlesCompleted}
          dropped={headline.titlesDropped}
          ratio={ratio}
          lead={archetype === "completionist" ? "finished" : "dropped"}
          tone={tone}
        />
      ) : null;
    }

    case "feast-or-famine": {
      const line = feastLine(payload.months);
      return line ? (
        <FeastMonths months={payload.months} line={line} tone={tone} />
      ) : null;
    }

    case "group-watcher":
      return rhythm.sharedListShare === null ? null : (
        <ShareBar
          percent={Math.round(rhythm.sharedListShare * 100)}
          label={sharedListLine(rhythm.sharedListShare)}
          tone={tone}
        />
      );
  }
}

/**
 * Solo ticks by local hour, midnight first, the busiest three hours -- the
 * window the archetype was classified on -- highlighted. Heights are a share
 * of the busiest hour, so the habit reads as a shape; a baseline keeps the
 * empty hours visible as empty.
 */
function HourClock({
  hourCounts,
  lines,
  tone,
}: {
  hourCounts: number[];
  lines: NonNullable<ReturnType<typeof hourClockLines>>;
  tone: Tone;
}) {
  const peak = Math.max(...hourCounts);
  const busiest = new Set(lines.hours);

  return (
    <div>
      <div
        role="img"
        aria-label={lines.ariaLabel}
        className={cn("flex h-16 items-end gap-[2px] border-b", tone.baseline)}
      >
        {hourCounts.map((count, hour) => (
          <div
            key={hour}
            data-hour={hour}
            data-busiest={busiest.has(hour)}
            className={cn(
              "min-w-0 flex-1 rounded-t-sm",
              busiest.has(hour) ? HIGHLIGHT : tone.bar,
            )}
            style={{ height: `${Math.round((count / peak) * 1000) / 10}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className={cn("relative mt-1.5 h-4", tone.label)}>
        {CLOCK_TICKS.map((hour) => (
          <span
            key={hour}
            className={cn(
              "absolute top-0 tabular-nums",
              hour !== 0 && "-translate-x-1/2",
            )}
            style={{ left: `${(hour / 24) * 100}%` }}
          >
            {hourLabel(hour)}
          </span>
        ))}
      </div>
      <p className={cn("mt-3", tone.caption)}>{lines.caption}</p>
    </div>
  );
}

/**
 * One share as a figure over one bar, labelled with the sentence it stands
 * for: the number the type is about leads, large, where it gives the card
 * its weight.
 */
function ShareBar({
  percent,
  label,
  tone,
}: {
  percent: number;
  label: string;
  tone: Tone;
}) {
  return (
    <div role="img" aria-label={`${label}.`}>
      <p
        data-share-figure=""
        className={cn(
          "mb-4 leading-none font-bold tracking-tight tabular-nums",
          tone.figure,
        )}
      >
        {`${percent}%`}
      </p>
      <div className={cn("h-2.5 rounded-full", tone.track)}>
        <div
          data-share-fill=""
          className={cn("h-full rounded-full", HIGHLIGHT_ACROSS)}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className={cn("mt-3", tone.caption)}>{label}</p>
    </div>
  );
}

/**
 * Titles finished against titles dropped as two segments of one bar, each as
 * wide as its count, the side the archetype is about in the highlight. An
 * empty side is left out rather than drawn as a sliver.
 */
function FinishedDropped({
  completed,
  dropped,
  ratio,
  lead,
  tone,
}: {
  completed: number;
  dropped: number;
  /** `finishedDroppedLine`'s sentence. */
  ratio: string;
  lead: "finished" | "dropped";
  tone: Tone;
}) {
  const sides = [
    { id: "finished", count: completed },
    { id: "dropped", count: dropped },
  ].filter((side) => side.count > 0);

  return (
    <div
      role="img"
      aria-label={`Titles finished against titles dropped: ${formatCount(completed)} finished, ${formatCount(dropped)} dropped. ${ratio}`}
    >
      <div className="flex h-2.5 gap-1">
        {sides.map((side) => (
          <div
            key={side.id}
            data-segment={side.id}
            className={cn(
              "min-w-1.5 rounded-full",
              side.id === lead ? HIGHLIGHT_ACROSS : tone.bar,
            )}
            style={{ flexGrow: side.count, flexBasis: 0 }}
          />
        ))}
      </div>
      <div className={cn("mt-2 flex justify-between gap-3", tone.label)}>
        {sides.map((side) => (
          <span
            key={side.id}
            className={cn("tabular-nums", side.id === lead && HIGHLIGHT_LABEL)}
          >
            {`${formatCount(side.count)} ${side.id}`}
          </span>
        ))}
      </div>
      <p className={cn("mt-3", tone.caption)}>{ratio}</p>
    </div>
  );
}

/** The months as a compact strip, every feast month in the highlight. */
function FeastMonths({
  months,
  line,
  tone,
}: {
  months: Payload["months"];
  /** `feastLine`'s sentence. */
  line: string;
  tone: Tone;
}) {
  const feast = new Set(feastMonths(months).map((month) => month.month));

  return (
    <div>
      <BarChart
        size="compact"
        ariaLabel={`Episodes and films by month. ${line}`}
        bars={months.map((month) => ({
          label: monthInitial(month.month),
          value: month.episodes,
          highlight: feast.has(month.month),
        }))}
      />
      <p className={cn("mt-3", tone.caption)}>{line}</p>
    </div>
  );
}
