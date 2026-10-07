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
 * Seeing the year hides it too, so nobody is asked again to open what they
 * have already opened. Seen means got to the end: the story's summary card
 * (`storyCompletedAt`), or the recap page's foot, which dismisses the period
 * the way "Not now" does (`RecapClient`). Opening the recap is not enough on
 * its own -- a click that lands there by mistake and comes straight back
 * keeps its banner.
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
  if (newest.storyCompletedAt !== null) return null;
  if (isThinPeriod(newest.headline)) return null;

  const { label, headline } = newest;

  return (
    <Card
      variant="entertainment"
      className="mb-8 flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between md:gap-10"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-red-400 uppercase">
          <Sparkles className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          Your {label} Series Finale is ready
        </div>
        <p className="mt-3 text-2xl font-semibold text-gray-50 sm:text-3xl">
          {pluralise(headline.episodes, "episode")}.{" "}
          {pluralise(headline.titlesCompleted, "title")}.
        </p>
      </div>
      {/* One action group: stacked full width on a phone; from md, side by
          side at the right, centred on the text beside it. */}
      <div className="flex flex-none flex-col gap-2.5 md:items-end">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
          <Button
            variant="entertainment"
            size="lg"
            className="w-full md:w-auto"
            asChild
          >
            {/* The recap route; on a phone it hands on to the story. */}
            <Link href={`/series-finale/${label}`}>See your Series Finale</Link>
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full md:w-auto md:px-5"
            onClick={() => dismiss.mutate(label)}
            disabled={dismiss.isPending}
          >
            Not now
          </Button>
        </div>
        {dismiss.isError ? (
          <p role="alert" className="text-center text-xs text-red-400">
            Could not dismiss that. Try again.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
