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
   * Optional quiet caption shown top-right, e.g. "Peak: March, 174" in the
   * mock. Left to the caller because it depends on how the peak was framed
   * (month, weekday, ...), not something BarChart can derive on its own.
   */
  caption?: string;
}

/**
 * Proportional bars for the monthly and weekday cuts.
 *
 * Heights are a percentage of the largest bar, not of a fixed scale, so a quiet
 * year still reads as a shape rather than a flat line. Deliberately bare of a
 * card wrapper or title — the recap page and the story slide each frame this
 * differently, so that chrome belongs to the caller.
 */
export function BarChart({ bars, ariaLabel, caption }: BarChartProps) {
  const peak = Math.max(...bars.map((bar) => bar.value), 0);

  return (
    <div>
      {caption ? (
        <div className="mb-2 flex justify-end">
          <span className="text-xs text-gray-500">{caption}</span>
        </div>
      ) : null}
      <div aria-label={ariaLabel} role="img" className="flex items-end gap-2.5">
        {bars.map((bar) => (
          <div
            key={bar.label}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-48 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t bg-gradient-to-t",
                  bar.highlight
                    ? "from-red-600 to-orange-500"
                    : "from-gray-600 to-gray-500",
                )}
                // Zero peak would divide by zero and produce NaN, which React
                // renders as no height attribute at all.
                style={{
                  height: peak === 0 ? "0%" : `${(bar.value / peak) * 100}%`,
                }}
              />
            </div>
            <span
              className={cn(
                "text-xs",
                bar.highlight ? "font-semibold text-red-400" : "text-gray-500",
              )}
            >
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
