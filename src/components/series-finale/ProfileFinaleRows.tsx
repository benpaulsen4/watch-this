"use client";

import { BarChart3, Sparkle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSeriesFinaleList } from "@/hooks/useSeriesFinale";
import { cn } from "@/lib/utils";

import { pluralise } from "./format";

/**
 * The profile's "Your data" archive: every generated Series Finale period,
 * newest first, each opening its own recap. Thin years are listed too --
 * this is the permanent archive, and a thin year's own recap page renders
 * the thin-year card, so there is nothing to hide here.
 *
 * Unlike `SeriesFinaleBanner`, nothing here is dismissable or time-limited:
 * the mock's "Available until 31 January" line is dropped, since no
 * availability window exists anywhere in the spec or the data -- recaps do
 * not expire, and `dismissedAt` only ever affects the dashboard banner.
 *
 * The newest period carries the mock's highlighted treatment (the one
 * gradient accent this view spends, on its icon tile) so the archive still
 * reads top-to-bottom as newest-first even once the dashboard banner itself
 * has been dismissed.
 */
export function ProfileFinaleRows() {
  const { data: periods, isLoading, isError } = useSeriesFinaleList();

  if (isLoading) {
    return (
      <LoadingSpinner
        size="sm"
        text="Loading your Series Finale archive..."
        centered
      />
    );
  }

  // A failed fetch still leaves `data` undefined, same as "nothing generated
  // yet" -- without this branch it would fall into the empty state below and
  // claim "No Series Finale yet", which is false: the archive may well have
  // entries, the request just failed.
  if (isError) {
    return (
      <p className="text-sm text-gray-500">
        Couldn&apos;t load your Series Finale archive. Try again later.
      </p>
    );
  }

  if (!periods || periods.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No Series Finale yet. One is put together for each calendar year once
        it has finished.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {periods.map((period, index) => {
        const isNewest = index === 0;

        return (
          <li
            key={period.label}
            className={cn(
              "relative overflow-hidden rounded-xl border p-[18px]",
              isNewest
                ? "border-red-600/40 bg-gray-800 shadow-xl shadow-black/20"
                : "border-gray-700 bg-gray-800",
            )}
          >
            {isNewest && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(360px_circle_at_88%_10%,rgba(239,68,68,0.18),transparent_62%)]"
              />
            )}
            <div className="relative flex items-center gap-[14px]">
              <div
                className={cn(
                  "flex h-11 w-11 flex-none items-center justify-center rounded-[10px]",
                  isNewest
                    ? "bg-gradient-to-br from-red-600 to-orange-500"
                    : "bg-gray-700",
                )}
              >
                {isNewest ? (
                  <Sparkle className="h-5 w-5 text-white" aria-hidden="true" />
                ) : (
                  <BarChart3
                    className="h-[19px] w-[19px] text-gray-400"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[15px] font-semibold",
                    isNewest ? "text-white" : "text-gray-100",
                  )}
                >
                  Series Finale {period.label}
                </div>
                <div className="text-xs text-gray-400">
                  {pluralise(period.headline.episodes, "episode")} ·{" "}
                  {pluralise(period.headline.titlesCompleted, "title")}
                </div>
              </div>
              <Button variant={isNewest ? "default" : "outline"} size="sm" asChild>
                <Link href={`/series-finale/${period.label}`}>Open</Link>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
