"use client";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { BigDayTimeline } from "../BigDayTimeline";
import { CrewRanking } from "../CrewRanking";
import {
  alsoTopForLine,
  archetypeDescription,
  archetypeName,
  bigDaySentence,
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
  peakMonth,
  percentileLine,
  quietestMonth,
  streakLine,
  topShowStats,
  unknownRuntimeNote,
} from "../format";
import { GenreBars } from "../GenreBars";
import { Poster } from "../Poster";
import { MonthsChart, WeekdayStrip } from "../RhythmCharts";
import type { StoryCardId } from "../StoryReel";
import type { Viewer } from "../viewer";
import { CompareCard } from "./CompareCard";
import { PopularityStrip } from "./PopularityStrip";
import { ShameCard } from "./ShameCard";
import { Enter, Eyebrow, Headline, Shell } from "./StoryShell";
import { SummaryCard } from "./SummaryCard";

type Payload = SeriesFinalePayload;

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
                // A step smaller than the episodes figure from four digits:
                // the "hrs" beside it has to fit too, and "1,208 hrs" at 104px
                // overruns a 375px phone.
                bigFigureSize(figure, [
                  "text-[132px]",
                  "text-[84px]",
                  "text-[68px]",
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
            <Poster posterPath={topShow.posterPath} size="large" />
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
      return (
        <ShameCard
          shame={payload.shame}
          titlesDropped={payload.headline.titlesDropped}
        />
      );

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
      return <SummaryCard summary={payload} viewer={viewer} />;
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
