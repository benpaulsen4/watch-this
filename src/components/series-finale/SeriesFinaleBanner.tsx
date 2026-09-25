"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  useDismissSeriesFinale,
  useSeriesFinaleList,
} from "@/hooks/useSeriesFinale";

import { isThinPeriod, pluralise } from "./format";

/**
 * Dashboard promotion for the newest recap -- plan 4's only entry point into
 * the feature (see `listAvailableSnapshots`).
 *
 * Only `periods[0]` is ever considered. The list is every available year,
 * newest first, including dormant gap years, so falling through to an older
 * undismissed period after "Not now" would surface a stale or thin year
 * instead of just going quiet for the rest of the visit -- and a gap year's
 * headline would read "0 episodes. 0 titles."
 *
 * "Not now" hides the banner at once (the list is updated optimistically --
 * see `useDismissSeriesFinale`). If the dismissal fails the banner comes
 * back, with a line saying so.
 *
 * Renders nothing rather than an empty shell when there is no eligible
 * period -- for most of the year that is the correct state, not an error.
 *
 * One brand-coloured gradient per view (the "See your Series Finale"
 * button, matching `Button variant="entertainment"`'s use for marketing
 * surfaces) -- the card itself uses `Card variant="entertainment"`'s
 * gray-on-gray wash, which is not a competing treatment. The mock's ambient
 * red/purple/orange glow behind the card, and the gradient-border wrapper
 * used to draw it, are dropped for the same reason: the dashboard already
 * spends its one gradient on the button.
 */
export function SeriesFinaleBanner() {
  const { data: periods } = useSeriesFinaleList();
  const dismiss = useDismissSeriesFinale();

  const [newest] = periods ?? [];
  if (!newest || newest.dismissedAt !== null) return null;
  if (isThinPeriod(newest.headline)) return null;

  const { label, headline } = newest;

  return (
    <Card
      variant="entertainment"
      className="mb-8 flex flex-col items-center gap-6 p-6 text-center sm:p-8 md:flex-row md:items-center md:justify-between md:text-left"
    >
      <div>
        <div className="flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.16em] text-red-400 uppercase md:justify-start">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Your {label} Series Finale is ready
        </div>
        <p className="mt-3 text-2xl font-semibold text-gray-50 sm:text-3xl">
          {pluralise(headline.episodes, "episode")}.{" "}
          {pluralise(headline.titlesCompleted, "title")}.
        </p>
        <p className="mt-2 text-sm text-gray-300">
          A card at a time on your year.
        </p>
      </div>
      <div className="flex flex-none flex-col items-center gap-2.5 md:items-end">
        <Button variant="entertainment" size="lg" asChild>
          <Link href={`/series-finale/${label}/story`}>
            See your Series Finale
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismiss.mutate(label)}
          disabled={dismiss.isPending}
        >
          Not now
        </Button>
        {dismiss.isError ? (
          <p role="alert" className="text-xs text-red-400">
            Could not dismiss that. Try again.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
