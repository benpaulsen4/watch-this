"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";

import type { User } from "@/lib/auth/client";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { BigDayTimeline } from "../BigDayTimeline";
import { CompareFacts, CompareSplit } from "../CompareSplit";
import { CrewRanking } from "../CrewRanking";
import {
  alsoTopForLine,
  andMore,
  archetypeDescription,
  archetypeName,
  bigDaySentence,
  compareHeadline,
  crewHeadline,
  dateKeyWeekday,
  episodesPerDayLine,
  finishedLine,
  formatCount,
  formatDateKey,
  hoursLine,
  monthName,
  monthsHeadline,
  mostFamousLine,
  newMaterialLine,
  nicheComparison,
  overlapLine,
  peakMonth,
  percentileLine,
  planningLine,
  planningMoreLine,
  pluralise,
  quietestMonth,
  shameIntro,
  streakLine,
  topShowStats,
  unknownRuntimeNote,
} from "../format";
import { GenreBars } from "../GenreBars";
import { Poster } from "../Poster";
import { MonthsChart, WeekdayStrip } from "../RhythmCharts";
import type { StoryCardId } from "../StoryReel";
import { TmdbAttribution } from "../TmdbAttribution";

type Payload = SeriesFinalePayload;
type Viewer = Pick<User, "username" | "profilePictureUrl">;

/**
 * Each card's ambient wash, from artboard 1c: the brand red, orange and
 * purple (and the finished card's blue, the shame card's yellow) at low
 * opacity, placed differently per card so the reel reads as moving.
 */
const WASH: Record<StoryCardId, string> = {
  intro:
    "bg-[radial-gradient(700px_circle_at_50%_34%,rgba(239,68,68,0.34),transparent_60%),radial-gradient(620px_circle_at_14%_82%,rgba(168,85,247,0.24),transparent_62%),radial-gradient(600px_circle_at_90%_14%,rgba(249,115,22,0.2),transparent_60%)]",
  hours:
    "bg-[radial-gradient(760px_circle_at_78%_22%,rgba(239,68,68,0.32),transparent_58%),radial-gradient(600px_circle_at_10%_88%,rgba(249,115,22,0.2),transparent_60%)]",
  episodes:
    "bg-[radial-gradient(680px_circle_at_22%_18%,rgba(168,85,247,0.28),transparent_60%),radial-gradient(700px_circle_at_84%_82%,rgba(239,68,68,0.26),transparent_60%)]",
  finished:
    "bg-[radial-gradient(700px_circle_at_84%_30%,rgba(37,99,235,0.26),transparent_58%),radial-gradient(620px_circle_at_10%_84%,rgba(239,68,68,0.22),transparent_62%)]",
  topShow:
    "bg-[radial-gradient(720px_circle_at_50%_76%,rgba(239,68,68,0.3),transparent_60%)]",
  niche:
    "bg-[radial-gradient(660px_circle_at_20%_76%,rgba(168,85,247,0.3),transparent_60%),radial-gradient(620px_circle_at_88%_18%,rgba(239,68,68,0.2),transparent_62%)]",
  genres:
    "bg-[radial-gradient(640px_circle_at_84%_14%,rgba(168,85,247,0.3),transparent_60%),radial-gradient(640px_circle_at_8%_90%,rgba(239,68,68,0.22),transparent_62%)]",
  months:
    "bg-[radial-gradient(700px_circle_at_34%_22%,rgba(239,68,68,0.28),transparent_60%),radial-gradient(660px_circle_at_90%_86%,rgba(249,115,22,0.22),transparent_60%)]",
  bigDay:
    "bg-[radial-gradient(700px_circle_at_26%_26%,rgba(249,115,22,0.28),transparent_60%),radial-gradient(680px_circle_at_82%_84%,rgba(239,68,68,0.26),transparent_60%)]",
  rhythm:
    "bg-[radial-gradient(760px_circle_at_50%_50%,rgba(168,85,247,0.3),transparent_62%),radial-gradient(600px_circle_at_92%_96%,rgba(239,68,68,0.2),transparent_60%)]",
  shame:
    "bg-[radial-gradient(700px_circle_at_76%_24%,rgba(239,68,68,0.3),transparent_58%),radial-gradient(600px_circle_at_14%_90%,rgba(202,138,4,0.18),transparent_62%)]",
  crew: "bg-[radial-gradient(680px_circle_at_18%_20%,rgba(239,68,68,0.26),transparent_60%),radial-gradient(700px_circle_at_88%_78%,rgba(168,85,247,0.24),transparent_60%)]",
  compare:
    "bg-[radial-gradient(660px_circle_at_22%_22%,rgba(239,68,68,0.26),transparent_60%),radial-gradient(660px_circle_at_84%_80%,rgba(168,85,247,0.28),transparent_60%)]",
  summary:
    "bg-[radial-gradient(780px_circle_at_50%_26%,rgba(239,68,68,0.3),transparent_60%),radial-gradient(620px_circle_at_12%_88%,rgba(168,85,247,0.22),transparent_62%),radial-gradient(600px_circle_at_92%_70%,rgba(249,115,22,0.2),transparent_60%)]",
};

/** The mock's entrances; still for anyone who prefers reduced motion. */
const ENTER = {
  fade: "motion-safe:animate-[wt-fade_0.6s_ease_both]",
  rise: "motion-safe:animate-[wt-rise_0.6s_cubic-bezier(0.2,0.8,0.2,1)_both]",
  riseLarge:
    "motion-safe:animate-[wt-rise-lg_0.7s_cubic-bezier(0.2,0.8,0.2,1)_both]",
} as const;

function Enter({
  kind = "rise",
  delay = 0,
  className,
  children,
}: {
  kind?: keyof typeof ENTER;
  /** Milliseconds, so a card's lines arrive one after another. */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(ENTER[kind], className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * One full-bleed card over its wash, never shorter than the screen and never
 * cut short by it. `align="end"` sits the content low, as
 * the hours card does; `centred` centres it. TMDB attribution rides on every
 * card that shows their metadata.
 */
function Shell({
  id,
  align = "center",
  centred = false,
  tmdb = false,
  children,
}: {
  id: StoryCardId;
  align?: "center" | "end";
  centred?: boolean;
  tmdb?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-card={id} className="relative min-h-dvh bg-gray-950">
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", WASH[id])}
      />
      <div
        className={cn(
          // At least the viewport, growing with the content: a tall card makes
          // the page scroll instead of hiding its bottom.
          "relative flex min-h-dvh flex-col px-[30px] pt-24",
          align === "end" ? "justify-end pb-[92px]" : "justify-center pb-10",
          centred && "items-center text-center",
        )}
      >
        {children}
        {tmdb ? (
          <Enter kind="fade" delay={600} className="mt-8">
            <TmdbAttribution />
          </Enter>
        ) : null}
      </div>
    </div>
  );
}

function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Enter
      kind="fade"
      className={cn(
        "text-xs font-semibold tracking-[0.24em] text-white/55 uppercase",
        className,
      )}
    >
      {children}
    </Enter>
  );
}

/** A card's headline under the eyebrow, where the mock has one. */
function Headline({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Enter
      delay={60}
      className={cn(
        "max-w-[300px] text-[32px] leading-[1.15] font-bold tracking-[-0.03em] text-pretty text-white",
        className,
      )}
    >
      {children}
    </Enter>
  );
}

/** The large figure of a stat card, stepped down as it grows longer. */
function bigFigureSize(text: string, sizes: [string, string, string]): string {
  if (text.length <= 3) return sizes[0];
  if (text.length <= 5) return sizes[1];
  return sizes[2];
}

const BODY = "text-lg leading-normal text-pretty text-white/80";

/** The story's crew card lists this many, plus the viewer (the mock's five). */
const CREW_SHOWN = 5;

export function StoryCard({
  id,
  payload,
  viewer,
}: {
  id: StoryCardId;
  payload: Payload;
  /** The signed-in user: the crew row marked "you" and the summary's name. */
  viewer: Viewer;
}) {
  switch (id) {
    case "intro":
      return (
        <Shell id={id} centred>
          <Eyebrow className="mb-[22px] tracking-[0.28em] text-white/60">
            Series Finale
          </Eyebrow>
          <Enter
            kind="riseLarge"
            className="bg-gradient-to-br from-red-500 to-orange-300 bg-clip-text text-[108px] leading-[0.86] font-bold tracking-[-0.05em] text-transparent"
          >
            {payload.period.label}
          </Enter>
          <Enter
            delay={160}
            className="mt-[26px] max-w-[270px] text-[17px] leading-normal text-pretty text-white/80"
          >
            A year of yours, reconstructed from every episode you ticked off.
          </Enter>
          <Enter
            kind="fade"
            delay={500}
            className="mt-[46px] text-[13px] text-white/35"
          >
            Tap to begin
          </Enter>
        </Shell>
      );

    case "hours": {
      const { hours, minutes, percentile, unknownRuntimeEpisodes } =
        payload.headline;
      const figure = formatCount(hours);
      const percentileText = percentileLine(percentile);
      const unknownRuntime = unknownRuntimeNote(unknownRuntimeEpisodes);
      return (
        <Shell id={id} align="end">
          <Eyebrow className="mb-[18px]">You spent</Eyebrow>
          <Enter
            kind="riseLarge"
            delay={60}
            className="flex items-baseline gap-2.5"
          >
            <span
              className={cn(
                "leading-[0.82] font-bold tracking-[-0.055em] text-white tabular-nums",
                bigFigureSize(figure, [
                  "text-[132px]",
                  "text-[104px]",
                  "text-[84px]",
                ]),
              )}
            >
              {figure}
            </span>
            <span className="text-[30px] font-semibold text-white/65">
              {hours === 1 ? "hr" : "hrs"}
            </span>
          </Enter>
          <Enter delay={180} className={cn("mt-[26px] max-w-[280px]", BODY)}>
            {hoursLine(minutes)}
          </Enter>
          {percentileText ? (
            <Enter
              kind="fade"
              delay={500}
              className="mt-[22px] text-xs text-white/35"
            >
              {percentileText}
            </Enter>
          ) : null}
          {unknownRuntime ? (
            <Enter
              kind="fade"
              delay={500}
              className="mt-2 text-xs text-white/35"
            >
              {unknownRuntime}
            </Enter>
          ) : null}
        </Shell>
      );
    }

    case "episodes": {
      const figure = formatCount(payload.episodes.total);
      return (
        <Shell id={id}>
          <Eyebrow className="mb-5">Episodes ticked off</Eyebrow>
          <Enter
            kind="riseLarge"
            delay={60}
            className={cn(
              "leading-[0.84] font-bold tracking-[-0.055em] text-white tabular-nums",
              bigFigureSize(figure, [
                "text-[116px]",
                "text-[116px]",
                "text-[88px]",
              ]),
            )}
          >
            {figure}
          </Enter>
          <Enter delay={160} className={cn("mt-6 max-w-[290px]", BODY)}>
            {episodesPerDayLine(payload.episodes.perDay)}
          </Enter>
        </Shell>
      );
    }

    case "finished": {
      const { films, shows, total } = payload.finished;
      return (
        <Shell id={id}>
          <Eyebrow className="mb-[18px]">You finished</Eyebrow>
          <Enter
            kind="riseLarge"
            delay={60}
            className="text-[128px] leading-[0.84] font-bold tracking-[-0.055em] text-white tabular-nums"
          >
            {formatCount(total)}
          </Enter>
          <Enter delay={160} className={cn("mt-5 max-w-[290px]", BODY)}>
            {finishedLine(total, payload.headline.titlesDropped)}
          </Enter>
          <Enter kind="fade" delay={340} className="mt-[34px] flex gap-2.5">
            <FinishedTile
              value={films}
              label={films === 1 ? "film" : "films"}
            />
            <FinishedTile
              value={shows}
              label={shows === 1 ? "show" : "shows"}
            />
          </Enter>
        </Shell>
      );
    }

    case "topShow": {
      const { topShow } = payload;
      if (!topShow) return null;
      const alsoTopFor = alsoTopForLine(topShow.alsoTopFor);
      const newMaterial = newMaterialLine(topShow.alsoTopFor.length);
      return (
        <Shell id={id} centred tmdb>
          <Eyebrow className="mb-6">Your #1 show</Eyebrow>
          <Enter kind="riseLarge" delay={60}>
            <Poster
              posterPath={topShow.posterPath}
              title={topShow.title}
              size="large"
            />
          </Enter>
          <Enter delay={180} className="mt-[26px]">
            <div className="text-[38px] leading-[1.1] font-bold tracking-[-0.03em] text-white">
              {topShow.title}
            </div>
            <div className="mt-2.5 text-base text-white/70">
              {topShowStats(topShow)}
            </div>
          </Enter>
          {alsoTopFor ? (
            <Enter
              kind="fade"
              delay={380}
              className="mt-[22px] rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-2 text-[13px] text-white/75"
            >
              {newMaterial ? `${alsoTopFor} ${newMaterial}` : alsoTopFor}
            </Enter>
          ) : null}
        </Shell>
      );
    }

    case "niche": {
      const { niche } = payload;
      if (!niche) return null;
      return (
        <Shell id={id} tmdb>
          <Eyebrow className="mb-4">Your most obscure film</Eyebrow>
          <Enter
            delay={60}
            className="max-w-[310px] text-[44px] leading-[1.08] font-bold tracking-[-0.035em] text-pretty text-white"
          >
            {niche.title}
          </Enter>
          <Enter
            delay={160}
            className="mt-[22px] max-w-[290px] text-[17px] leading-relaxed text-pretty text-white/80"
          >
            {nicheComparison(niche)}
          </Enter>
          <PopularityStrip popularities={niche.filmPopularities} />
          {niche.mostPopular ? (
            <Enter
              kind="fade"
              delay={550}
              className="mt-6 text-[13px] text-white/40"
            >
              {mostFamousLine(niche.mostPopular)}
            </Enter>
          ) : null}
        </Shell>
      );
    }

    case "genres":
      return (
        <Shell id={id} tmdb>
          <Eyebrow className="mb-8">Your genres</Eyebrow>
          <Enter delay={140}>
            <GenreBars genres={payload.genres} size="large" />
          </Enter>
        </Shell>
      );

    case "months": {
      const peak = peakMonth(payload.months);
      const quietest = quietestMonth(payload.months);
      const headline = monthsHeadline(payload.months);
      return (
        <Shell id={id}>
          <Eyebrow className="mb-2.5">Your year had a shape</Eyebrow>
          {headline ? <Headline className="mb-8">{headline}</Headline> : null}
          <Enter kind="fade" delay={200}>
            <MonthsChart months={payload.months} labels="initial" />
          </Enter>
          {peak ? (
            <Enter
              kind="fade"
              delay={850}
              className="mt-[26px] flex gap-[22px] text-[13px] text-white/70"
            >
              <span data-testid="months-peak">
                <span className="font-semibold text-red-400">
                  {formatCount(peak.episodes)}
                </span>{" "}
                in {monthName(peak.month)}
              </span>
              {quietest && quietest.month !== peak.month ? (
                <span data-testid="months-quietest">
                  <span className="font-semibold text-white/90">
                    {formatCount(quietest.episodes)}
                  </span>{" "}
                  in {monthName(quietest.month)}
                </span>
              ) : null}
            </Enter>
          ) : null}
        </Shell>
      );
    }

    case "bigDay": {
      const { bigDay } = payload;
      if (!bigDay) return null;
      return (
        <Shell id={id}>
          <Eyebrow className="mb-4">Your worst / best day</Eyebrow>
          <Enter
            kind="riseLarge"
            delay={60}
            className="text-[68px] leading-[0.92] font-bold tracking-[-0.045em] text-white"
          >
            <div>{dateKeyWeekday(bigDay.date).slice(0, 3)}</div>
            <div>{formatDateKey(bigDay.date, { short: true })}</div>
          </Enter>
          <Enter delay={180} className={cn("mt-[26px] max-w-[290px]", BODY)}>
            {bigDaySentence(bigDay)}
          </Enter>
          <Enter kind="fade" delay={340} className="mt-8">
            <BigDayTimeline
              bigDay={bigDay}
              soloTickTotal={payload.soloTickTotal}
              size="large"
            />
          </Enter>
          {bigDay.streak ? (
            <Enter
              kind="fade"
              delay={800}
              className="mt-3 text-xs text-white/40"
            >
              {streakLine(bigDay.streak)}
            </Enter>
          ) : null}
        </Shell>
      );
    }

    case "rhythm": {
      const { rhythm } = payload;
      if (rhythm.archetype === null) return null;
      return (
        <Shell id={id} centred>
          <Eyebrow className="mb-[22px]">Your watching type</Eyebrow>
          <Enter
            kind="riseLarge"
            delay={60}
            className="max-w-[320px] bg-gradient-to-br from-red-500 to-orange-300 bg-clip-text text-[46px] leading-[1.05] font-bold tracking-[-0.035em] text-transparent"
          >
            {archetypeName({
              archetype: rhythm.archetype,
              topWeekday: rhythm.topWeekday,
            })}
          </Enter>
          <Enter
            delay={200}
            className="mt-6 max-w-[284px] text-[17px] leading-relaxed text-pretty text-white/80"
          >
            {archetypeDescription(rhythm.archetype, rhythm)}
          </Enter>
          <Enter kind="fade" delay={400} className="mt-9 w-full max-w-[290px]">
            <WeekdayStrip rhythm={rhythm} />
          </Enter>
        </Shell>
      );
    }

    case "shame":
      return <ShameCard shame={payload.shame} />;

    case "crew": {
      const headline = crewHeadline(payload.headline.episodes, payload.crew);
      return (
        <Shell id={id}>
          <Eyebrow className="mb-2">Your crew</Eyebrow>
          {headline ? (
            <Headline className="mb-[26px]">{headline}</Headline>
          ) : null}
          <Enter delay={140}>
            <CrewRanking
              size="large"
              limit={CREW_SHOWN}
              viewer={{
                username: viewer.username,
                profilePictureUrl: viewer.profilePictureUrl,
                episodes: payload.headline.episodes,
              }}
              crew={payload.crew}
            />
          </Enter>
        </Shell>
      );
    }

    case "compare":
      return <CompareCard compare={payload.compare} />;

    case "summary":
      return <SummaryCard payload={payload} viewer={viewer} />;
  }
}

function FinishedTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.08] px-[18px] py-4">
      <div className="text-[34px] leading-none font-bold text-white tabular-nums">
        {formatCount(value)}
      </div>
      <div className="mt-[7px] text-[13px] text-white/60">{label}</div>
    </div>
  );
}

/**
 * Every film finished, least popular first -- so the niche pick leads, marked
 * in the highlight. Heights are on a log scale: TMDB popularity runs from
 * about 1 to several hundred, and a linear scale would flatten everything but
 * the blockbusters. Only drawn with at least three films to line up.
 */
function PopularityStrip({ popularities }: { popularities: number[] }) {
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

/**
 * How many dropped shows the card has room for -- one fewer when the
 * planning box shares it. The rest are counted, not listed.
 */
const DROPPED_SHOWN = 6;
const DROPPED_SHOWN_WITH_PLANNING = 5;

function ShameCard({ shame }: { shame: Payload["shame"] }) {
  const intro = shameIntro(shame);
  const [oldest, ...waiting] = shame.stillPlanning;
  const dropped = shame.dropped.slice(
    0,
    oldest ? DROPPED_SHOWN_WITH_PLANNING : DROPPED_SHOWN,
  );
  const droppedMore = andMore(shame.dropped.length - dropped.length);
  const waitingMore = planningMoreLine(waiting.length);

  return (
    <Shell id="shame" tmdb>
      <Eyebrow className="mb-2.5">Hall of shame</Eyebrow>
      {intro ? (
        <Headline className="mb-6 text-2xl leading-tight">{intro}</Headline>
      ) : null}
      {dropped.length > 0 ? (
        <Enter delay={140}>
          <ul className="flex flex-col gap-[9px]">
            {dropped.map((show) => (
              <li
                key={show.tmdbId}
                className="flex items-center justify-between gap-3 rounded-[11px] border border-white/10 bg-white/[0.07] px-[15px] py-3"
              >
                <span className="text-[15px] leading-tight font-medium text-white">
                  {show.title}
                </span>
                {show.lastEpisode ? (
                  <span className="font-mono text-xs whitespace-nowrap text-red-400">
                    {`last: ${show.lastEpisode}`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {droppedMore ? (
            <p className="mt-2.5 text-[13px] text-white/50">{droppedMore}</p>
          ) : null}
        </Enter>
      ) : null}
      {oldest ? (
        <Enter
          kind="fade"
          delay={500}
          className="mt-5 rounded-[11px] border border-yellow-600/30 bg-yellow-600/15 px-[17px] py-[15px]"
        >
          <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-yellow-400 uppercase">
            Still &ldquo;planning&rdquo;
          </div>
          <p className="text-sm leading-normal text-pretty text-white/80">
            {planningLine(oldest)}
          </p>
          {waitingMore ? (
            <p className="mt-1 text-[13px] text-white/50">{waitingMore}</p>
          ) : null}
        </Enter>
      ) : null}
    </Shell>
  );
}

/**
 * One peer at a time, the closest first (`compare` arrives ordered by titles
 * in common); the others can be swapped in, as in the mock.
 */
function CompareCard({ compare }: { compare: Payload["compare"] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peer =
    compare.find((candidate) => candidate.userId === selectedId) ?? compare[0];
  if (!peer) return null;

  const others = compare.filter((candidate) => candidate !== peer);
  const headline = compareHeadline(peer);
  const overlap = overlapLine(peer);

  return (
    <Shell id="compare" tmdb>
      <Eyebrow className="mb-3.5">You &amp; {peer.username}</Eyebrow>
      {headline ? <Headline className="mb-[30px]">{headline}</Headline> : null}
      <Enter kind="riseLarge" delay={160}>
        <CompareSplit peer={peer} size="large" />
      </Enter>
      {overlap ? (
        <Enter
          kind="fade"
          delay={260}
          className="mt-5 mb-5 text-center text-sm text-white/60"
        >
          {overlap}
        </Enter>
      ) : null}
      <Enter delay={300}>
        <CompareFacts peer={peer} size="large" />
      </Enter>
      {others.length > 0 ? (
        // Above the tap zones, so the swap is a click and not a card change.
        <div className="relative z-20 mt-5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-white/45">
          <span>Swap in</span>
          {others.map((other) => (
            <button
              key={other.userId}
              type="button"
              onClick={() => setSelectedId(other.userId)}
              className="rounded-full border border-white/15 bg-white/10 px-2.5 py-[5px] font-medium text-white/85 transition-colors hover:bg-white/15"
            >
              {other.username}
            </button>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

function SummaryCard({
  payload,
  viewer,
}: {
  payload: Payload;
  viewer: Viewer;
}) {
  const { hours, episodes, titlesCompleted, titlesDropped } = payload.headline;
  const type = archetypeName(payload.rhythm);
  const rows = [
    payload.topShow
      ? { label: "Top show", value: payload.topShow.title, accent: false }
      : null,
    payload.niche
      ? { label: "Deepest cut", value: payload.niche.title, accent: false }
      : null,
    type ? { label: "Type", value: type, accent: true } : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);
  const stats = [
    { value: hours, label: hours === 1 ? "hour" : "hours" },
    { value: episodes, label: episodes === 1 ? "episode" : "episodes" },
    {
      value: titlesCompleted,
      label: titlesCompleted === 1 ? "title finished" : "titles finished",
    },
    { value: titlesDropped, label: "abandoned" },
  ];

  return (
    <Shell
      id="summary"
      tmdb={payload.topShow !== null || payload.niche !== null}
    >
      <Enter className="rounded-[18px] border border-white/15 bg-gray-950/55 px-[22px] py-6 backdrop-blur-md">
        <div className="mb-5 flex items-center justify-between">
          <Image
            src="/logo-master.svg"
            alt=""
            width={179}
            height={50}
            className="h-[18px] w-auto"
          />
          <span className="text-[11px] font-semibold tracking-[0.2em] text-white/50">
            {payload.period.label}
          </span>
        </div>
        <div className="mb-[22px] text-[26px] leading-tight font-bold tracking-[-0.03em] text-white">
          {`${viewer.username}'s year`}
        </div>
        <dl className="grid grid-cols-2 gap-x-3.5 gap-y-[18px]">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse">
              <dt className="mt-[5px] text-xs text-white/50">{stat.label}</dt>
              <dd className="text-[30px] leading-none font-bold text-white tabular-nums">
                {formatCount(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
        {rows.length > 0 ? (
          <dl className="mt-[22px] flex flex-col gap-[9px] border-t border-white/10 pt-[18px] text-[13px] leading-snug">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-white/50">{row.label}</dt>
                <dd
                  className={cn(
                    "text-right font-semibold",
                    row.accent ? "text-red-400" : "text-white",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Enter>
    </Shell>
  );
}
