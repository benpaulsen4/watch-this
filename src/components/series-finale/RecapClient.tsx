"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Children,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePhoneViewport } from "@/hooks/usePhoneViewport";
import {
  SeriesFinaleUnavailableError,
  useDismissSeriesFinale,
  useSeriesFinale,
  useStoryCompletedAt,
} from "@/hooks/useSeriesFinale";
import type {
  ArchetypeId,
  SeriesFinalePayload,
} from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { ArchetypeVisual } from "./ArchetypeVisual";
import { BigDayTimeline } from "./BigDayTimeline";
import { ComparePeerPicker, useComparePeer } from "./ComparePeerPicker";
import { CompareFacts, CompareSplit } from "./CompareSplit";
import { CrewRanking } from "./CrewRanking";
import { FilmGrain } from "./FilmGrain";
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
import {
  MonthsChart,
  WeekdayStrip,
  weekdaysUnderMonths,
} from "./RhythmCharts";
import {
  LoadFailedNotice,
  PROFILE_DATA_TAB,
  UnavailableNotice,
} from "./SeriesFinaleNotices";
import { DroppedBadges, PlanningBadges } from "./ShameBadges";
import { SHARE_FAILURE_LINE, ShareButton } from "./ShareButton";
import { StatTile } from "./StatTile";
import { ThinYearCard } from "./ThinYearCard";
import { TmdbAttribution } from "./TmdbAttribution";
import type { Viewer } from "./viewer";

interface RecapClientProps {
  period: string;
  /** The signed-in user, resolved by the page: the payload carries no username. */
  user: Viewer;
}

/**
 * On a phone the story is the default: the recap opens only once the story
 * has been gone through (`storyCompletedAt`, kept on the account), and until
 * then this route hands over to the story. A desktop always gets the recap.
 */
export function RecapClient({ period, user }: RecapClientProps) {
  const router = useRouter();
  const isPhone = usePhoneViewport();
  const { data: payload, isLoading, error, refetch } = useSeriesFinale(period);
  const { data: storyCompletedAt } = useStoryCompletedAt(period);

  // Nothing is decided until the viewport is known and, on a phone, the year
  // has loaded. A thin year has no story to finish, and a failed load no year
  // to gate, so both render here as they always have.
  const known = isPhone === false || (isPhone === true && !isLoading);
  const toStory =
    isPhone === true &&
    payload !== undefined &&
    !payload.thin &&
    storyCompletedAt === null;

  // Once a year has been shown, it stays: a completion rolled back after a
  // failed POST, or a window narrowed past the breakpoint, never pulls the
  // page out from under its reader.
  const [yearShown, setYearShown] = useState(false);
  const showPage = yearShown || (known && !toStory);
  if (showPage && payload !== undefined && !yearShown) setYearShown(true);

  const handOver = !showPage && toStory;
  useEffect(() => {
    // `replace`, so Back from the story skips this page instead of looping.
    if (handOver) router.replace(`/series-finale/${period}/story`);
  }, [handOver, router, period]);

  // The header's bar is a fixed height, so a failed share is said below it.
  const [shareFailed, setShareFailed] = useState(false);

  // The header is there from the first render, a full page load's included;
  // its actions wait for a year to act on, and never appear for a phone being
  // handed on to the story (Share would prefetch a card for nothing).
  const actions = showPage && payload !== undefined && !payload.thin;

  return (
    <>
      <PageHeader
        title={`Series Finale ${period}`}
        backLinkHref={PROFILE_DATA_TAB}
        backLinkLabel="Back to profile"
      >
        {actions ? (
          <>
            {/* Below sm, both fold to icons so the title keeps its line. */}
            <Button
              variant="outline"
              size="sm"
              className="px-2.5 sm:px-3"
              asChild
            >
              <Link href={`/series-finale/${period}/story`}>
                <Play aria-hidden="true" className="h-4 w-4 sm:hidden" />
                <span className="sr-only sm:not-sr-only">Play as story</span>
              </Link>
            </Button>
            <ShareButton
              period={period}
              username={user.username}
              collapse
              onFailureChange={setShareFailed}
            />
          </>
        ) : null}
      </PageHeader>
      {actions && shareFailed ? <ShareFailureNotice /> : null}
      {showPage ? (
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
      ) : (
        // Until then only a spinner, so a phone never glimpses the recap.
        <PageSpinner />
      )}
    </>
  );
}

/** The same wait before the viewport is known as while the year loads. */
function PageSpinner() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <LoadingSpinner text="Putting your year together" />
    </div>
  );
}

/**
 * A failed share, said just under the header and kept there as the page
 * scrolls. It takes no room in the page: it floats over the hero's top
 * padding, or over whatever has scrolled beneath the header.
 */
function ShareFailureNotice() {
  return (
    <div className="pointer-events-none sticky top-16 z-40 h-0">
      <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
        <p
          role="alert"
          className="pointer-events-auto mt-2 rounded-md border border-gray-700 bg-gray-900/95 px-3 py-1.5 text-xs text-gray-300 shadow-lg shadow-black/25"
        >
          {SHARE_FAILURE_LINE}
        </p>
      </div>
    </div>
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
  if (isLoading) return <PageSpinner />;

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

  return (
    <>
      <Hero payload={payload} user={user} />
      <Container className="space-y-4 pb-14">
        <StatRow payload={payload} />
        <Band wide>
          <MonthsPanel months={payload.months} rhythm={payload.rhythm} />
          {archetype !== null ? (
            <ArchetypePanel archetype={archetype} payload={payload} />
          ) : null}
        </Band>
        <Band>
          {topShow || niche ? (
            <TopTitlesPanel topShow={topShow} niche={niche} />
          ) : null}
          {payload.genres.length > 0 ? (
            // What the percents measure, set over their column in the
            // title row: the type card's genre figure is a share of titles.
            <Panel
              title="Genres"
              aside="Share of genre tags across what you finished"
            >
              <GenreBars genres={payload.genres} />
            </Panel>
          ) : null}
        </Band>
        <Band>
          {bigDay ? (
            <BigDayPanel
              bigDay={bigDay}
              soloTickTotal={payload.soloTickTotal}
              timeZone={payload.period.timezone}
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
          {payload.compare.length > 0 ? (
            <ComparePanel compare={payload.compare} />
          ) : null}
        </Band>
        <RecapEnd period={period} />
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
 *
 * Every column is `minmax(0, …)` (`grid-cols-1` and `grid-cols-2` are too):
 * an implicit column would grow to its widest panel's content, and a chart's
 * min-content width then pushes a phone's page sideways.
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
        "grid grid-cols-1 gap-4",
        present.length > 1 &&
          (wide
            ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
            : "lg:grid-cols-2"),
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
        {/* Wraps, so an aside too long to share the line (the Genres
            caption on a phone) drops under the title instead of breaking
            it mid-word. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="min-w-0 text-lg leading-tight font-semibold [overflow-wrap:anywhere] text-gray-100">
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
      <FilmGrain />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-56 bg-gradient-to-b from-gray-950/0 via-gray-950/70 to-gray-950"
      />
      <Container className="relative pt-16 pb-[76px] text-center">
        <p className="mb-6 text-xs font-semibold tracking-[0.28em] [overflow-wrap:anywhere] text-white/50 uppercase">
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

/**
 * The months, and under them the weekdays for every type but the weekday
 * marathoner, whose own card draws the weekday strip larger: one strip per
 * page, never the same chart twice side by side. The months chart fills
 * whatever height the row gives the panel, so a taller type card beside it
 * leaves no empty block under the chart.
 */
function MonthsPanel({
  months,
  rhythm,
}: {
  months: SeriesFinalePayload["months"];
  rhythm: SeriesFinalePayload["rhythm"];
}) {
  const peak = peakMonth(months);
  const weekdays = weekdaysUnderMonths(rhythm);

  return (
    <Panel
      title="Watched by month"
      aside={
        peak
          ? `Peak: ${monthName(peak.month)}, ${formatCount(peak.episodes)}`
          : undefined
      }
    >
      <MonthsChart months={months} axis fill />
      {weekdays ? (
        <div className="mt-6 border-t border-gray-800 pt-5">
          <h3 className="mb-3 text-sm font-medium text-gray-300">
            By day of the week
          </h3>
          {/* Indented past the months' axis, so the two plots line up. */}
          <div className="pl-10">
            <WeekdayStrip rhythm={rhythm} />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * The type's name and copy, then its picture (see `ArchetypeVisual`), centred
 * in whatever height the months panel beside it leaves over.
 */
function ArchetypePanel({
  archetype,
  payload,
}: {
  archetype: ArchetypeId;
  payload: SeriesFinalePayload;
}) {
  const { rhythm } = payload;
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
      <ArchetypeVisual payload={payload} className="my-auto pt-6" />
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
  timeZone,
}: {
  bigDay: NonNullable<SeriesFinalePayload["bigDay"]>;
  soloTickTotal: number;
  timeZone: string;
}) {
  return (
    <Panel title="Biggest day" intro={bigDayLine(bigDay)}>
      <BigDayTimeline
        bigDay={bigDay}
        soloTickTotal={soloTickTotal}
        timeZone={timeZone}
      />
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

/**
 * One peer's comparison at a time, the closest first (`compare` arrives
 * ordered by titles in common); the others can be swapped in, as on the
 * story's card.
 */
function ComparePanel({
  compare,
}: {
  compare: SeriesFinalePayload["compare"];
}) {
  const [peer, setPeer] = useComparePeer(compare);
  if (!peer) return null;

  return (
    <Panel title={`You & ${peer.username}`} intro={overlapLine(peer)}>
      <CompareSplit peer={peer} />
      <div className="mt-auto pt-5">
        <CompareFacts peer={peer} />
        <ComparePeerPicker
          peers={compare}
          selected={peer.userId}
          onSelect={setPeer}
          className="mt-4"
        />
      </div>
    </Panel>
  );
}

/**
 * The foot of a recap with something to read. Reaching it is going through
 * the recap, as the story's summary card is going through the story, so it
 * puts the dashboard banner away (`dismissedAt`, as "Not now" sets). A thin
 * year renders the plain `Footer`: it never has a banner.
 */
function RecapEnd({ period }: { period: string }) {
  const { mutate: dismiss } = useDismissSeriesFinale();
  const reached = useCallback(() => dismiss(period), [dismiss, period]);
  return <Footer onReached={reached} />;
}

/**
 * The TMDB attribution, closing every recap. `onReached` is called the first
 * time the footer is scrolled into view, once per page: a visit that opens
 * the recap and leaves without scrolling down never calls it.
 *
 * Scrolled into view, not merely in view: the observer reports the footer's
 * state as soon as it starts watching, and on a tall screen a short year's
 * footer is in view on opening -- that is the page loading, not the recap
 * being read, and counting it would let a misclick put the banner away. So
 * the footer has to have been out of view first.
 */
function Footer({ onReached }: { onReached?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const done = useRef(false);
  const beenOutOfView = useRef(false);

  useEffect(() => {
    const footer = ref.current;
    if (!onReached || !footer || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (done.current) return;
      if (!entries.some((entry) => entry.isIntersecting)) {
        beenOutOfView.current = true;
        return;
      }
      if (!beenOutOfView.current) return;
      done.current = true;
      observer.disconnect();
      onReached();
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, [onReached]);

  return (
    <footer ref={ref} className="mt-8 border-t border-gray-800 pt-6">
      <TmdbAttribution />
    </footer>
  );
}
