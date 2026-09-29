import { cn } from "@/lib/utils";

import { pluralise } from "./format";

/**
 * Bar and label tones per surface: "default" is the recap's gray card, "large"
 * the story's wash. One strip, drawn on both.
 */
const TONES = {
  default: { bar: "bg-gray-600", label: "text-gray-500" },
  large: { bar: "bg-white/30", label: "text-white/40" },
} as const;

/** Fewer films than this line up as nothing, so no strip is drawn. */
export const POPULARITY_STRIP_MIN_FILMS = 3;

/**
 * Every film finished, least popular first -- so the niche pick leads, marked
 * in the highlight. Heights are on a log scale: TMDB popularity runs from
 * about 1 to several hundred, and a linear scale would flatten everything but
 * the blockbusters. Only drawn with at least three films to line up.
 *
 * Shared by the story's niche card and the deep cut hunter's type visual.
 * `className` sits on the strip itself, so a caller's spacing goes with it
 * and leaves nothing behind when there are too few films to draw.
 */
export function PopularityStrip({
  popularities,
  size = "default",
  className,
}: {
  popularities: number[];
  size?: keyof typeof TONES;
  className?: string;
}) {
  if (popularities.length < POPULARITY_STRIP_MIN_FILMS) return null;

  const tone = TONES[size];
  const sorted = [...popularities].sort((a, b) => a - b);
  const scaled = sorted.map((value) => Math.log1p(Math.max(value, 0)));
  const top = Math.max(...scaled);
  const lowest = sorted[0] ?? 0;
  const highest = sorted[sorted.length - 1] ?? 0;

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Your ${pluralise(sorted.length, "film")} by TMDB popularity, from ${lowest.toFixed(1)} to ${Math.round(highest)}.`}
        className={cn(
          "flex h-16 items-end",
          sorted.length > 40 ? "gap-px" : "gap-[3px]",
        )}
      >
        {scaled.map((value, index) => (
          <div
            key={index}
            data-popularity={index === 0 ? "niche" : "film"}
            className={cn(
              "min-w-0 flex-1 rounded-sm",
              index === 0
                ? "bg-gradient-to-t from-red-600 to-orange-500"
                : tone.bar,
            )}
            style={{
              height: `${top === 0 ? 4 : Math.max(4, Math.round((value / top) * 100))}%`,
            }}
          />
        ))}
      </div>
      <div
        className={cn(
          "mt-2.5 flex justify-between gap-3 text-[11px]",
          tone.label,
        )}
      >
        <span>obscure</span>
        <span>{`your ${pluralise(sorted.length, "film")}, by popularity`}</span>
        <span>famous</span>
      </div>
    </div>
  );
}
