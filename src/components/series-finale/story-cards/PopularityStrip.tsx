import { cn } from "@/lib/utils";

import { pluralise } from "../format";
import { Enter } from "./StoryShell";

/**
 * Every film finished, least popular first -- so the niche pick leads, marked
 * in the highlight. Heights are on a log scale: TMDB popularity runs from
 * about 1 to several hundred, and a linear scale would flatten everything but
 * the blockbusters. Only drawn with at least three films to line up.
 */
export function PopularityStrip({ popularities }: { popularities: number[] }) {
  if (popularities.length < 3) return null;

  const sorted = [...popularities].sort((a, b) => a - b);
  const scaled = sorted.map((value) => Math.log1p(Math.max(value, 0)));
  const top = Math.max(...scaled);
  const lowest = sorted[0] ?? 0;
  const highest = sorted[sorted.length - 1] ?? 0;

  return (
    <Enter kind="fade" delay={340} className="mt-8">
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
                : "bg-white/30",
            )}
            style={{
              height: `${top === 0 ? 4 : Math.max(4, Math.round((value / top) * 100))}%`,
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex justify-between gap-3 text-[11px] text-white/40">
        <span>obscure</span>
        <span>{`your ${pluralise(sorted.length, "film")}, by popularity`}</span>
        <span>famous</span>
      </div>
    </Enter>
  );
}
