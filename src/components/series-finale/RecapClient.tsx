"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Children, type ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
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
import { getImageUrl } from "@/lib/tmdb/client";
import { cn } from "@/lib/utils";

import { ARCHETYPE_LABELS } from "./ARCHETYPE_LABELS";
import { BarChart } from "./BarChart";
import {
  alsoTopForLine,
  archetypeDetail,
  archetypeName,
  bigDayLine,
  droppedIntro,
  formatCount,
  formatHoursMinutes,
  formatPeriodRange,
  heroSentence,
  monthLabel,
  monthName,
  nicheLine,
  peakMonth,
  percentileLine,
  pluralise,
  streakLabel,
  timelineLine,
  timelineSpread,
  weekdayInitial,
  weekdayName,
} from "./format";
import { GenreBars } from "./GenreBars";
import { DroppedBadges, PlanningBadges } from "./ShameBadges";
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
          <ArchetypePanel rhythm={payload.rhythm} />
        </Band>
        <Band>
          <TopTitlesPanel topShow={payload.topShow} niche={payload.niche} />
          {payload.genres.length > 0 ? (
            <Panel title="Genres">
              <GenreBars genres={payload.genres} />
            </Panel>
          ) : null}
        </Band>
        <Band>
          <BigDayPanel bigDay={payload.bigDay} />
          <ShamePanel shame={payload.shame} />
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

function ArchetypePanel({ rhythm }: { rhythm: SeriesFinalePayload["rhythm"] }) {
  const name = archetypeName(rhythm);
  if (rhythm.archetype === null || name === null) return null;

  const description = [
    ARCHETYPE_LABELS[rhythm.archetype].blurb,
    archetypeDetail(rhythm),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Panel title="Your type">
      <p className="bg-gradient-to-br from-red-500 to-orange-300 bg-clip-text text-3xl leading-tight font-bold tracking-tight text-transparent sm:text-[34px]">
        {name}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-pretty text-gray-300">
        {description}
      </p>
      <div className="mt-auto pt-6">
        <BarChart
          size="compact"
          ariaLabel={
            rhythm.topWeekday === null
              ? "Episodes by weekday."
              : `Episodes by weekday. Peak ${weekdayName(rhythm.topWeekday)}.`
          }
          bars={rhythm.weekdayCounts.map((value, index) => ({
            label: weekdayInitial(index),
            value,
            highlight: index === rhythm.topWeekday,
          }))}
        />
      </div>
    </Panel>
  );
}

/** A TMDB poster, or a quiet placeholder where the title has none. */
function Poster({
  posterPath,
  title,
}: {
  posterPath: string | null;
  title: string;
}) {
  const src = getImageUrl(posterPath, "w342");

  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-[10px] bg-gray-800">
      {src ? (
        <Image
          src={src}
          alt={title}
          fill
          sizes="(min-width: 1024px) 14rem, 45vw"
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full items-center justify-center rounded-[10px] border border-dashed border-gray-600"
        >
          <Play className="h-5 w-5 text-gray-500" />
        </div>
      )}
    </div>
  );
}

function TopTitlesPanel({
  topShow,
  niche,
}: {
  topShow: SeriesFinalePayload["topShow"];
  niche: SeriesFinalePayload["niche"];
}) {
  if (!topShow && !niche) return null;

  const title =
    topShow && niche
      ? "Most watched, and least known"
      : topShow
        ? "Most watched"
        : "Least known";
  const alsoTopFor = topShow ? alsoTopForLine(topShow.alsoTopFor) : null;

  return (
    <Panel title={title}>
      <div className="grid grid-cols-2 gap-4">
        {topShow ? (
          <div>
            <Poster posterPath={topShow.posterPath} title={topShow.title} />
            <p className="mt-3 text-[15px] leading-snug font-semibold text-gray-100">
              {topShow.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="genre" size="sm">
                Show
              </Badge>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-gray-500">
              {topShow.minutes > 0
                ? `${pluralise(topShow.episodes, "episode")} · ${formatHoursMinutes(topShow.minutes)}`
                : pluralise(topShow.episodes, "episode")}
            </p>
            {alsoTopFor ? (
              <p className="mt-1 text-[13px] leading-snug text-gray-500">
                {alsoTopFor}
              </p>
            ) : null}
          </div>
        ) : null}
        {niche ? (
          <div>
            <Poster posterPath={niche.posterPath} title={niche.title} />
            <p className="mt-3 text-[15px] leading-snug font-semibold text-gray-100">
              {niche.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="genre" size="sm">
                Film
              </Badge>
              <Badge variant="year" size="sm">
                {`popularity ${niche.popularity.toFixed(1)}`}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-gray-500">
              {nicheLine(niche)}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * The biggest day. Its timeline is UTC instants with no zone, so there are no
 * clock times here: solo ticks are placed by elapsed time from the first.
 */
function BigDayPanel({ bigDay }: { bigDay: SeriesFinalePayload["bigDay"] }) {
  if (!bigDay) return null;

  const spread = bigDay.timeline
    ? timelineSpread(bigDay.timeline.map((point) => point.at))
    : null;

  return (
    <Panel title="Biggest day" intro={bigDayLine(bigDay)}>
      {bigDay.timeline === null ? (
        <p className="text-xs leading-relaxed text-gray-500">
          No hour-by-hour breakdown for this one. Most of these were ticked off
          in batches, which says more about how you use the app than how you
          watch.
        </p>
      ) : spread === null ? (
        <p className="text-xs leading-relaxed text-gray-500">
          Too few of these were ticked one at a time to say how the day went.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gray-700" />
            {spread.offsets.map((offset, index) => (
              <span
                key={index}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-gray-900"
                style={{ left: `${offset}%` }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            {timelineLine(bigDay.soloTickCount, spread.minutes)}
          </p>
        </>
      )}
    </Panel>
  );
}

/** How many waiting films the recap lists; the payload carries all of them. */
const PLANNING_SHOWN = 5;

function ShamePanel({ shame }: { shame: SeriesFinalePayload["shame"] }) {
  const { dropped, stillPlanning } = shame;
  if (dropped.length === 0 && stillPlanning.length === 0) return null;

  const planning = stillPlanning.slice(0, PLANNING_SHOWN);
  const intro =
    dropped.length > 0
      ? droppedIntro(
          dropped.length,
          dropped.some((show) => show.lastEpisode !== null),
        )
      : "Nothing dropped this year. These films, on the other hand, are still waiting.";

  return (
    <Panel title="Walked out on" intro={intro}>
      {dropped.length > 0 ? <DroppedBadges shows={dropped} /> : null}
      {dropped.length > 0 && planning.length > 0 ? (
        <p className="mt-4 mb-2.5 text-sm text-gray-400">
          And even after giving up on those, you still didn&apos;t find time for
          these.
        </p>
      ) : null}
      {planning.length > 0 ? <PlanningBadges films={planning} /> : null}
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
