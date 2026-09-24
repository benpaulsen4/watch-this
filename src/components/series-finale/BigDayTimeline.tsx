import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import {
  soloTickDisclosure,
  TIMELINE_TOO_FEW,
  timelineLine,
  timelineSpread,
} from "./format";

type BigDay = NonNullable<SeriesFinalePayload["bigDay"]>;

/** "default" is the recap's panel (1e), "large" the story's card (1c). */
const SIZES = {
  default: {
    text: "text-xs text-gray-500",
    track: "bg-gray-700",
    tick: "ring-gray-900",
  },
  large: {
    text: "text-sm text-white/60",
    track: "bg-white/20",
    tick: "ring-gray-950",
  },
} as const;

/**
 * How the biggest day went. Its timeline is UTC instants with no zone, so
 * there are no clock times: the solo ticks are placed by elapsed time from the
 * first, which reads the same in every zone. When the period had too few solo
 * ticks for a timeline at all, it says so, quoting the period's total.
 */
export function BigDayTimeline({
  bigDay,
  soloTickTotal,
  size = "default",
}: {
  bigDay: Pick<BigDay, "timeline" | "soloTickCount">;
  /** The period's solo ticks: the number the timeline's floor is judged on. */
  soloTickTotal: number;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];
  const text = cn("leading-relaxed", styles.text);

  if (bigDay.timeline === null) {
    return <p className={text}>{soloTickDisclosure(soloTickTotal)}</p>;
  }

  const spread = timelineSpread(bigDay.timeline.map((point) => point.at));
  if (spread === null) {
    return <p className={text}>{TIMELINE_TOO_FEW}</p>;
  }

  return (
    <>
      <div aria-hidden="true" className="relative h-10">
        <div
          className={cn("absolute inset-x-0 top-1/2 h-px", styles.track)}
        />
        {spread.offsets.map((offset, index) => (
          <span
            key={index}
            data-tick=""
            className={cn(
              "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2",
              styles.tick,
            )}
            style={{ left: `${offset}%` }}
          />
        ))}
      </div>
      <p className={cn("mt-3", text)}>
        {timelineLine(bigDay.soloTickCount, spread.minutes)}
      </p>
    </>
  );
}
