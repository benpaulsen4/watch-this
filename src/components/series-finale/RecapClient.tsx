"use client";

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
import type {
  ArchetypeId,
  SeriesFinalePayload,
} from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { BigDayTimeline } from "./BigDayTimeline";
import { CompareFacts, CompareSplit } from "./CompareSplit";
import { CrewRanking } from "./CrewRanking";
import {
  alsoTopForLine,
  andMore,
  archetypeDescription,
  archetypeName,
  bigDayLine,
  formatCount,
  heroSentence,
  monthName,
  nicheLine,
  overlapLine,
  peakMonth,
  percentileLine,
  periodRange,
  pluralNoun,
  shameIntro,
  shamePlanningLink,
  streakLabel,
  topShowStats,
  unknownRuntimeNote,
} from "./format";
import { GenreBars } from "./GenreBars";
import { Poster } from "./Poster";
import { MonthsChart, WeekdayStrip } from "./RhythmCharts";
import {
  LoadFailedNotice,
  PROFILE_DATA_TAB,
  UnavailableNotice,
} from "./SeriesFinaleNotices";
import { DroppedBadges, PlanningBadges } from "./ShameBadges";
import { StatTile } from "./StatTile";
import { ThinYearCard } from "./ThinYearCard";
import { TmdbAttribution } from "./TmdbAttribution";

type Viewer = Pick<User, "username" | "profilePictureUrl">;

interface RecapClientProps {
  period: string;
  /** The signed-in user, resolved by the page: the payload carries no username. */
  user: Viewer;
}

export function RecapClient({ period, user }: RecapClientProps) {
  const { data: payload, isLoading, error, refetch } = useSeriesFinale(period);

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
          onRetry={() => void refetch()}
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
  onRetry,
}: {
  period: string;
  user: Viewer;
  payload: SeriesFinalePayload | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
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
        <UnavailableNotice period={period} />
      </Container>
    );
  }

  if (error || !payload) {
    return (
      <Container className="py-16">
        <LoadFailedNotice onRetry={onRetry} />
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

  // Each optional panel is decided here rather than inside the panel, so a
  // band knows how many panels it really holds and can widen a lone one.
  const { archetype } = payload.rhythm;
  const { topShow, niche, bigDay, shame } = payload;
  const { titlesDropped } = payload.headline;
  const hasShame = titlesDropped > 0 || shame.stillPlanning.length > 0;
  // `compare` arrives ordered by titles in common, so this is the closest peer.
  const [peer] = payload.compare;

  return (
    <>
      <Hero payload={payload} user={user} />
      <Container className="space-y-4 pb-14">
        <StatRow payload={payload} />
        <Band wide>
          <MonthsPanel months={payload.months} />
          {archetype !== null ? (
            <ArchetypePanel archetype={archetype} rhythm={payload.rhythm} />
          ) : null}
        </Band>
        <Band>
          {topShow || niche ? (
            <TopTitlesPanel topShow={topShow} niche={niche} />
          ) : null}
          {payload.genres.length > 0 ? (
            <Panel title="Genres">
              <GenreBars genres={payload.genres} />
            </Panel>
          ) : null}
        </Band>
        <Band>
          {bigDay ? (
            <BigDayPanel
              bigDay={bigDay}
              soloTickTotal={payload.soloTickTotal}
            />
          ) : null}
          {hasShame ? (
            <ShamePanel shame={shame} titlesDropped={titlesDropped} />
          ) : null}
        </Band>
        <Band>
          {payload.crew.length > 0 ? (
            <Panel
              title="The crew"
              intro="People you share a list with. Nobody asked to be ranked."
            >
              <CrewRanking
                viewer={{
                  username: user.username,
                  profilePictureUrl: user.profilePictureUrl,
                  episodes: payload.headline.episodes,
                }}
                crew={payload.crew}
              />
            </Panel>
          ) : null}
          {peer ? <ComparePanel peer={peer} /> : null}
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
  const unknownRuntime = unknownRuntimeNote(
    payload.headline.unknownRuntimeEpisodes,
  );

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
          {user.username} · {periodRange(payload.period.label)}
        </p>
        <p className="text-7xl leading-[0.86] font-bold tracking-[-0.055em] text-gray-50 tabular-nums sm:text-9xl">
          <span>{formatCount(payload.headline.hours)}</span>
          <span className="ml-3 text-3xl tracking-[-0.02em] text-white/55 sm:text-[44px]">
            {pluralNoun(payload.headline.hours, "hour")}
          </span>
        </p>
        <p className="mx-auto mt-6 max-w-[560px] text-lg leading-relaxed text-pretty text-gray-300 sm:text-[19px]">
          {heroSentence(payload)}
        </p>
        {percentile ? (
          <p className="mt-4 text-sm font-medium text-gray-400">{percentile}</p>
        ) : null}
        {unknownRuntime ? (
          <p className="mt-2 text-xs text-gray-500">{unknownRuntime}</p>
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
      <MonthsChart months={months} axis />
    </Panel>
  );
}

function ArchetypePanel({
  archetype,
  rhythm,
}: {
  archetype: ArchetypeId;
  rhythm: SeriesFinalePayload["rhythm"];
}) {
  const name = archetypeName({ archetype, topWeekday: rhythm.topWeekday });
  const description = archetypeDescription(archetype, rhythm);

  return (
    <Panel title="Your type">
      <p className="bg-gradient-to-br from-red-500 to-orange-300 bg-clip-text text-3xl leading-tight font-bold tracking-tight text-transparent sm:text-[34px]">
        {name}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-pretty text-gray-300">
        {description}
      </p>
      <div className="mt-auto pt-6">
        <WeekdayStrip rhythm={rhythm} />
      </div>
    </Panel>
  );
}

function TopTitlesPanel({
  topShow,
  niche,
}: {
  topShow: SeriesFinalePayload["topShow"];
  niche: SeriesFinalePayload["niche"];
}) {
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
            <Poster posterPath={topShow.posterPath} />
            <p className="mt-3 text-[15px] leading-snug font-semibold text-gray-100">
              {topShow.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="genre" size="sm">
                Show
              </Badge>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-gray-500">
              {topShowStats(topShow)}
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
            <Poster posterPath={niche.posterPath} />
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

/** The biggest day: when it was, then how it went (see `BigDayTimeline`). */
function BigDayPanel({
  bigDay,
  soloTickTotal,
}: {
  bigDay: NonNullable<SeriesFinalePayload["bigDay"]>;
  soloTickTotal: number;
}) {
  return (
    <Panel title="Biggest day" intro={bigDayLine(bigDay)}>
      <BigDayTimeline bigDay={bigDay} soloTickTotal={soloTickTotal} />
    </Panel>
  );
}

/** How many waiting films the recap lists; the payload carries all of them. */
const PLANNING_SHOWN = 5;

/**
 * The dropped shows and the waiting films. The count is the headline's
 * `titlesDropped`, the stat tile's number; the badges name the ones with
 * metadata, and any the payload could not name are counted under them.
 */
function ShamePanel({
  shame,
  titlesDropped,
}: {
  shame: SeriesFinalePayload["shame"];
  titlesDropped: number;
}) {
  const { dropped, stillPlanning } = shame;

  const planning = stillPlanning.slice(0, PLANNING_SHOWN);
  const unnamed = andMore(titlesDropped - dropped.length);

  return (
    <Panel title="Walked out on" intro={shameIntro(shame, titlesDropped)}>
      {dropped.length > 0 ? <DroppedBadges shows={dropped} /> : null}
      {dropped.length > 0 && unnamed ? (
        <p className="mt-2.5 text-[13px] text-gray-500">{unnamed}</p>
      ) : null}
      {titlesDropped > 0 && planning.length > 0 ? (
        <p className="mt-4 mb-2.5 text-sm text-gray-400">
          {shamePlanningLink(titlesDropped, planning.length)}
        </p>
      ) : null}
      {planning.length > 0 ? <PlanningBadges films={planning} /> : null}
    </Panel>
  );
}

/** One peer's comparison; the page passes the one it overlaps with most. */
function ComparePanel({
  peer,
}: {
  peer: SeriesFinalePayload["compare"][number];
}) {
  return (
    <Panel title={`You & ${peer.username}`} intro={overlapLine(peer)}>
      <CompareSplit peer={peer} />
      <div className="mt-auto pt-5">
        <CompareFacts peer={peer} />
      </div>
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
