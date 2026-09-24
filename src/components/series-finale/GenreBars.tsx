import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

/** The top four lead; the tail and "Everything else" sit back. */
const LEADING_GENRES = 4;

/**
 * The genre split as labelled bars. The percents are rounded independently
 * and need not total 100, so each bar is drawn to its own share of the track
 * rather than stacked. The name and percent are the text; the bar is
 * decoration.
 */
export function GenreBars({
  genres,
}: {
  genres: SeriesFinalePayload["genres"];
}) {
  return (
    <ul className="flex flex-col gap-4">
      {genres.map((genre, index) => {
        const lead = index < LEADING_GENRES;
        return (
          // Positional key: unresolved genres all arrive named "Unknown".
          <li key={`${index}-${genre.name}`}>
            <div className="mb-2 flex justify-between gap-4">
              <span
                className={cn(
                  "text-sm font-medium",
                  lead ? "text-gray-200" : "text-gray-400",
                )}
              >
                {genre.name}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium tabular-nums",
                  lead ? "text-gray-400" : "text-gray-500",
                )}
              >
                {genre.percent}%
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 rounded-full bg-gray-700">
              <div
                data-share={lead ? "lead" : "rest"}
                className={cn(
                  "h-full rounded-full",
                  lead
                    ? "bg-gradient-to-r from-red-600 to-orange-500"
                    : "bg-gray-500",
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
