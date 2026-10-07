import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

/** The top four lead; the tail and "Everything else" sit back. */
const LEADING_GENRES = 4;

/**
 * Type and track per surface: "default" is the recap's panel (1e), "large"
 * the story's card (1c). The bars and their lead / rest split are one
 * implementation.
 */
const SIZES = {
  default: {
    list: "gap-4",
    name: "text-sm font-medium",
    leadName: "text-gray-200",
    restName: "text-gray-400",
    percent: "text-[13px] font-medium",
    leadPercent: "text-gray-400",
    restPercent: "text-gray-500",
    track: "bg-gray-700",
    rest: "bg-gray-500",
  },
  large: {
    list: "gap-5",
    name: "text-[17px] font-semibold",
    leadName: "text-white",
    restName: "text-white/60",
    percent: "text-[15px] font-semibold",
    leadPercent: "text-white/55",
    restPercent: "text-white/45",
    track: "bg-white/10",
    rest: "bg-white/35",
  },
} as const;

/**
 * The genre split as labelled bars. The percents are rounded independently
 * and need not total 100, so each bar is drawn to its own share of the track
 * rather than stacked. The name and percent are the text; the bar is
 * decoration.
 */
export function GenreBars({
  genres,
  size = "default",
}: {
  genres: SeriesFinalePayload["genres"];
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];

  return (
    <ul className={cn("flex flex-col", styles.list)}>
      {genres.map((genre, index) => {
        const lead = index < LEADING_GENRES;
        return (
          // Positional key: unresolved genres all arrive named "Unknown".
          <li key={`${index}-${genre.name}`}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span
                className={cn(
                  styles.name,
                  lead ? styles.leadName : styles.restName,
                )}
              >
                {genre.name}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  styles.percent,
                  lead ? styles.leadPercent : styles.restPercent,
                )}
              >
                {genre.percent}%
              </span>
            </div>
            <div
              aria-hidden="true"
              className={cn("h-1.5 rounded-full", styles.track)}
            >
              <div
                data-share={lead ? "lead" : "rest"}
                className={cn(
                  "h-full rounded-full",
                  lead
                    ? "bg-gradient-to-r from-red-600 to-orange-500"
                    : styles.rest,
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, genre.percent))}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
