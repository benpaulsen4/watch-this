import { cn } from "@/lib/utils";

interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

interface BarChartProps {
  bars: Bar[];
  /** Names the chart and its peak, so the shape is available without sight. */
  ariaLabel: string;
  /**
   * Optional y-axis tick column and gridlines (the mock's monthly chart). Bars
   * are then scaled against the top tick rather than the peak, so they line up
   * with the gridlines.
   */
  axis?: boolean;
  /** "compact" is the short, flat-bar strip under the mock's archetype. */
  size?: "default" | "compact";
}

const AXIS_INTERVALS = 4;

/**
 * The axis top: the peak rounded up to four equal steps of 1, 2 or 5 times a
 * power of ten -- 174 becomes 0/50/100/150/200. Whole-number steps only,
 * because every value charted here is a count.
 */
function axisTicks(peak: number): number[] {
  const raw = Math.max(peak, 1) / AXIS_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((factor) => factor * magnitude).find((s) => s >= raw) ??
      10 * magnitude,
  );

  return Array.from(
    { length: AXIS_INTERVALS + 1 },
    (_, index) => (AXIS_INTERVALS - index) * step,
  );
}

/**
 * Proportional bars for the monthly and weekday cuts.
 *
 * Without an axis, heights are a percentage of the largest bar, not of a fixed
 * scale, so a quiet year still reads as a shape rather than a flat line.
 * Deliberately bare of a card wrapper or title — the recap page and the story
 * slide each frame this differently, so that chrome belongs to the caller.
 */
export function BarChart({
  bars,
  ariaLabel,
  axis = false,
  size = "default",
}: BarChartProps) {
  const peak = Math.max(...bars.map((bar) => bar.value), 0);
  const ticks = axis ? axisTicks(peak) : [];
  const scaleTop = ticks[0] ?? peak;
  const compact = size === "compact";
  const plotHeight = compact ? "h-12" : "h-48";
  const gap = compact ? "gap-1.5" : "gap-2.5";

  return (
    <div>
      <div className="flex gap-3">
        {axis ? (
          <div
            aria-hidden="true"
            className={cn(
              "flex w-7 flex-none flex-col items-end justify-between text-[10px] leading-none text-gray-500 tabular-nums",
              plotHeight,
            )}
          >
            {ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        ) : null}
        <div className={cn("relative flex-1", plotHeight)}>
          {axis ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex flex-col justify-between"
            >
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className={cn(
                    "h-px",
                    tick === 0 ? "bg-gray-700" : "bg-gray-800",
                  )}
                />
              ))}
            </div>
          ) : null}
          <div
            aria-label={ariaLabel}
            role="img"
            className={cn("relative flex h-full items-end", gap)}
          >
            {bars.map((bar, index) => (
              // Keyed by position: labels repeat (the weekday initials T and S).
              <div
                key={index}
                data-bar=""
                className={cn(
                  "flex-1",
                  compact ? "rounded-sm" : "rounded-t",
                  bar.highlight
                    ? "bg-gradient-to-t from-red-600 to-orange-500"
                    : compact
                      ? "bg-gray-700"
                      : "bg-gradient-to-t from-gray-600 to-gray-500",
                )}
                // Zero scale would divide by zero and produce NaN, which React
                // renders as no height attribute at all.
                style={{
                  height:
                    scaleTop === 0
                      ? "0%"
                      : `${Math.round((bar.value / scaleTop) * 1000) / 10}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className={cn("mt-2 flex", gap, axis && "pl-10")}>
        {bars.map((bar, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 text-center text-xs",
              bar.highlight ? "font-semibold text-red-400" : "text-gray-500",
            )}
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
