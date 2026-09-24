"use client";

import Link from "next/link";
import { Children, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  SeriesFinaleUnavailableError,
  useSeriesFinale,
} from "@/hooks/useSeriesFinale";
import type { User } from "@/lib/auth/client";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { BarChart } from "./BarChart";
import {
  formatCount,
  formatPeriodRange,
  heroSentence,
  monthLabel,
  monthName,
  peakMonth,
  percentileLine,
  pluralise,
  streakLabel,
} from "./format";
import { StatTile } from "./StatTile";
import { ThinYearCard } from "./ThinYearCard";
import { TmdbAttribution } from "./TmdbAttribution";

/** The profile rows that open this page live on the profile's data tab. */
const PROFILE_DATA_TAB = "/profile#data";

type Viewer = Pick<User, "username" | "profilePictureUrl" | "timezone">;

interface RecapClientProps {
  period: string;
  /** The signed-in user, resolved by the page: the payload carries no username. */
  user: Viewer;
}

export function RecapClient({ period, user }: RecapClientProps) {
  const { data: payload, isLoading, error } = useSeriesFinale(period);

  return (
    <>
      <PageHeader
        title={`Series Finale ${period}`}
        backLinkHref={PROFILE_DATA_TAB}
        backLinkLabel="Back to profile"
      >
        {payload && !payload.thin ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series-finale/${period}/story`}>Play as story</Link>
          </Button>
        ) : null}
      </PageHeader>
      <main>
        <RecapBody
          period={period}
          user={user}
          payload={payload}
          isLoading={isLoading}
          error={error}
        />
      </main>
    </>
  );
}

function RecapBody({
  period,
  user,
  payload,
  isLoading,
  error,
}: {
  period: string;
  user: Viewer;
  payload: SeriesFinalePayload | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner text="Putting your year together" />
      </div>
    );
  }

  if (error instanceof SeriesFinaleUnavailableError) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-50">
            No Series Finale for {period}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-gray-400">
            Either that year is not over yet where you are, or you had not
            logged anything by then. Nothing to recap either way.
          </p>
          <Button variant="outline" size="sm" className="mt-6" asChild>
            <Link href={PROFILE_DATA_TAB}>Back to your profile</Link>
          </Button>
        </Card>
      </Container>
    );
  }

  if (error || !payload) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <p className="text-sm text-gray-400">
            That recap could not be loaded. Try again in a moment.
          </p>
        </Card>
      </Container>
    );
  }

  if (payload.thin) {
    return (
      <Container className="py-16">
        <ThinYearCard
          label={payload.period.label}
          episodes={payload.headline.episodes}
          titles={payload.headline.titlesCompleted}
        />
        <Footer />
      </Container>
    );
  }

  return (
    <>
      <Hero payload={payload} user={user} />
      <Container className="space-y-4 pb-14">
        <StatRow payload={payload} />
        <Band wide>
          <MonthsPanel months={payload.months} />
        </Band>
        <Footer />
      </Container>
    </>
  );
}

function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto max-w-[68rem] px-4 sm:px-8", className)}>
      {children}
    </div>
  );
}

/**
 * A row of panels, two abreast from `lg`. Absent panels (null children) are
 * dropped, and a lone survivor takes the full width rather than half a row.
 * `wide` gives the first column the mock's 1.55 : 1 share.
 */
function Band({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  // `Children.toArray` drops null, undefined and booleans, and keys the rest.
  const present = Children.toArray(children);
  if (present.length === 0) return null;

  return (
    <div
      className={cn(
        "grid gap-4",
        present.length > 1 &&
          (wide ? "lg:grid-cols-[1.55fr_1fr]" : "lg:grid-cols-2"),
      )}
    >
      {present}
    </div>
  );
}

/** One titled card of the recap. */
function Panel({
  title,
  aside,
  intro,
  className,
  children,
}: {
  title: string;
  aside?: string;
  intro?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg leading-tight font-semibold text-gray-100">
            {title}
          </h2>
          {aside ? (
            <span className="text-sm text-gray-500">{aside}</span>
          ) : null}
        </div>
        {intro ? <p className="mt-2 text-sm text-gray-400">{intro}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/**
 * The hours figure over the page's one ambient glow (the same red, orange and
 * purple wash as the landing page), fading into the page below it.
 */
function Hero({
  payload,
  user,
}: {
  payload: SeriesFinalePayload;
  user: Viewer;
}) {
  const percentile = percentileLine(payload.headline.percentile);
  const unknownRuntime = payload.headline.unknownRuntimeEpisodes;

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_50%_12%,rgba(239,68,68,0.2),transparent_56%),radial-gradient(700px_circle_at_12%_66%,rgba(249,115,22,0.12),transparent_60%),radial-gradient(800px_circle_at_90%_40%,rgba(168,85,247,0.12),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:3px_3px] opacity-30 motion-safe:animate-[wt-grain_7s_steps(10)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-56 bg-gradient-to-b from-gray-950/0 via-gray-950/70 to-gray-950"
      />
      <Container className="relative pt-16 pb-[76px] text-center">
        <p className="mb-6 text-xs font-semibold tracking-[0.28em] text-white/50 uppercase">
          {user.username} · {formatPeriodRange(payload.period, user.timezone)}
        </p>
        <p className="text-7xl leading-[0.86] font-bold tracking-[-0.055em] text-gray-50 tabular-nums sm:text-9xl">
          <span>{formatCount(payload.headline.hours)}</span>
          <span className="ml-3 text-3xl tracking-[-0.02em] text-white/55 sm:text-[44px]">
            hours
          </span>
        </p>
        <p className="mx-auto mt-6 max-w-[560px] text-lg leading-relaxed text-pretty text-gray-300 sm:text-[19px]">
          {heroSentence(payload)}
        </p>
        {percentile ? (
          <p className="mt-4 text-sm font-medium text-gray-400">{percentile}</p>
        ) : null}
        {unknownRuntime > 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Excludes {pluralise(unknownRuntime, "episode")} with no runtime on
            TMDB
          </p>
        ) : null}
      </Container>
    </section>
  );
}

function StatRow({ payload }: { payload: SeriesFinalePayload }) {
  const streak = payload.bigDay?.streak ?? null;
  const dropped = payload.headline.titlesDropped;

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        value={formatCount(payload.headline.episodes)}
        label="Episodes watched"
      />
      <StatTile
        value={formatCount(payload.headline.titlesCompleted)}
        label="Titles completed"
      />
      <StatTile
        value={streak ? formatCount(streak.days) : "—"}
        label={streakLabel(streak)}
      />
      <StatTile
        value={formatCount(dropped)}
        label="Shows dropped"
        tone={dropped > 0 ? "negative" : "default"}
      />
    </section>
  );
}

function MonthsPanel({ months }: { months: SeriesFinalePayload["months"] }) {
  const peak = peakMonth(months);

  return (
    <Panel
      title="Watched by month"
      aside={
        peak
          ? `Peak: ${monthName(peak.month)}, ${formatCount(peak.episodes)}`
          : undefined
      }
    >
      <BarChart
        axis
        ariaLabel={
          peak
            ? `Episodes and films by month. Peak ${monthName(peak.month)}, ${formatCount(peak.episodes)}.`
            : "Episodes and films by month. Nothing logged."
        }
        bars={months.map((month) => ({
          label: monthLabel(month.month),
          value: month.episodes,
          highlight: peak !== null && month.month === peak.month,
        }))}
      />
    </Panel>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-gray-800 pt-6">
      <TmdbAttribution />
    </footer>
  );
}
