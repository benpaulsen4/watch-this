"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { useCompleteStory, useStoryCompletedAt } from "@/hooks/useSeriesFinale";
import type { SummaryCardData } from "@/lib/series-finale/share";
import { cn } from "@/lib/utils";

import { archetypeName, formatCount, pluralNoun } from "../format";
import { ShareButton } from "../ShareButton";
import type { Viewer } from "../viewer";
import { Enter, Shell } from "./StoryShell";

/**
 * The story's closing card: the year in four figures and three names.
 *
 * Reaching it is going through the story, so it records that on the account
 * -- which is what opens the recap on a phone -- and then offers the recap.
 */
export function SummaryCard({
  summary,
  viewer,
}: {
  summary: SummaryCardData;
  viewer: Viewer;
}) {
  const period = summary.period.label;
  const recapHref = `/series-finale/${period}`;
  const { data: storyCompletedAt } = useStoryCompletedAt(period);
  const completeStory = useCompleteStory();
  const { mutate: markComplete } = completeStory;

  // Never for a story already gone through, so coming back to this card
  // (the cache holds the completion by then) posts nothing more; the ref
  // covers StrictMode's second effect and the moment before the cache does.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || storyCompletedAt !== null) return;
    marked.current = true;
    markComplete(period);
  }, [storyCompletedAt, markComplete, period]);

  // A failed POST is rolled back, and on a phone the recap would send the
  // reader straight back into the story -- so offer a retry, not the link.
  const unsaved = completeStory.isError && !storyCompletedAt;
  const { hours, episodes, titlesCompleted, titlesDropped } = summary.headline;
  const type = archetypeName(summary.rhythm);
  const rows = [
    summary.topShow
      ? { label: "Top show", value: summary.topShow.title, accent: false }
      : null,
    summary.niche
      ? { label: "Deepest cut", value: summary.niche.title, accent: false }
      : null,
    type ? { label: "Type", value: type, accent: true } : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);
  const stats = [
    { value: hours, label: pluralNoun(hours, "hour") },
    { value: episodes, label: pluralNoun(episodes, "episode") },
    {
      value: titlesCompleted,
      label: titlesCompleted === 1 ? "title finished" : "titles finished",
    },
    { value: titlesDropped, label: "abandoned" },
  ];

  return (
    <Shell
      id="summary"
      tmdb={summary.topShow !== null || summary.niche !== null}
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
            {summary.period.label}
          </span>
        </div>
        {/* Underscores are no break opportunity, so a long name may break anywhere. */}
        <div className="mb-[22px] text-[26px] leading-tight font-bold tracking-[-0.03em] [overflow-wrap:anywhere] text-white">
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
      {/* Above the tap zones, so the tap is a share and not a card change. */}
      <Enter delay={160} className="relative z-20 mt-5 flex justify-center">
        <ShareButton
          period={summary.period.label}
          username={viewer.username}
          label="Share your card"
          size="lg"
        />
      </Enter>
      <Enter
        delay={240}
        className="relative z-20 mt-3 flex flex-col items-center gap-1"
      >
        {unsaved ? (
          <>
            <p role="alert" className="text-xs text-red-400">
              Could not save your progress. Try again.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markComplete(period)}
              disabled={completeStory.isPending}
            >
              Try again
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link href={recapHref}>See the full recap</Link>
          </Button>
        )}
      </Enter>
    </Shell>
  );
}
