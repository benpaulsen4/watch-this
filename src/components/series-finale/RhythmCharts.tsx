import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { BarChart } from "./BarChart";
import {
  formatCount,
  monthInitial,
  monthLabel,
  monthName,
  peakMonth,
  weekdayInitial,
  weekdayName,
} from "./format";

type Payload = SeriesFinalePayload;

/**
 * Episodes and films by month, the peak highlighted and named in the label.
 * The recap draws it with an axis and three-letter months (1e), initials
 * below `sm`; the story bare, with initials (1c).
 */
export function MonthsChart({
  months,
  axis = false,
  labels = "short",
}: {
  months: Payload["months"];
  axis?: boolean;
  labels?: "short" | "initial";
}) {
  const peak = peakMonth(months);

  return (
    <BarChart
      axis={axis}
      ariaLabel={
        peak
          ? `Episodes and films by month. Peak ${monthName(peak.month)}, ${formatCount(peak.episodes)}.`
          : "Episodes and films by month. Nothing logged."
      }
      bars={months.map((month) => ({
        label:
          labels === "initial"
            ? monthInitial(month.month)
            : monthLabel(month.month),
        narrowLabel:
          labels === "initial" ? undefined : monthInitial(month.month),
        value: month.episodes,
        highlight: peak !== null && month.month === peak.month,
      }))}
    />
  );
}

/**
 * Episodes by weekday, Monday first, the top weekday highlighted. "medium" is
 * the weekday marathoner's card, where the strip is the whole picture.
 */
export function WeekdayStrip({
  rhythm,
  size = "compact",
}: {
  rhythm: Pick<Payload["rhythm"], "weekdayCounts" | "topWeekday">;
  size?: "compact" | "medium";
}) {
  return (
    <BarChart
      size={size}
      ariaLabel={
        rhythm.topWeekday === null
          ? "Episodes by weekday."
          : `Episodes by weekday. Peak ${weekdayName(rhythm.topWeekday)}.`
      }
      bars={rhythm.weekdayCounts.map((value, index) => ({
        label: weekdayInitial(index),
        value,
        highlight: index === rhythm.topWeekday,
      }))}
    />
  );
}
