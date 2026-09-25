"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  SeriesFinaleUnavailableError,
  useSeriesFinale,
} from "@/hooks/useSeriesFinale";
import type { User } from "@/lib/auth/client";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { LoadFailedNotice, UnavailableNotice } from "./SeriesFinaleNotices";
import { StoryCard } from "./story-cards/StoryCard";
import { ThinYearCard } from "./ThinYearCard";

export type StoryCardId =
  | "intro"
  | "hours"
  | "episodes"
  | "finished"
  | "topShow"
  | "niche"
  | "genres"
  | "months"
  | "bigDay"
  | "rhythm"
  | "shame"
  | "crew"
  | "compare"
  | "summary";

/**
 * Narrative order, matching the mock's REEL_ORDER. Adding a card is one entry
 * here, one case in `hasContent` if it can be empty, and one branch in
 * StoryCard -- no reindexing.
 */
export const REEL_ORDER: readonly StoryCardId[] = [
  "intro",
  "hours",
  "episodes",
  "finished",
  "topShow",
  "niche",
  "genres",
  "months",
  "bigDay",
  "rhythm",
  "shame",
  "crew",
  "compare",
  "summary",
];

/**
 * Whether a card has anything to say for this payload. A card with nothing is
 * taken out of the reel, not shown empty.
 */
function hasContent(id: StoryCardId, payload: SeriesFinalePayload): boolean {
  switch (id) {
    case "episodes":
      return payload.episodes.total > 0;
    case "finished":
      return payload.finished.total > 0;
    case "topShow":
      return payload.topShow !== null;
    case "niche":
      return payload.niche !== null;
    case "genres":
      return payload.genres.length > 0;
    case "months":
      return payload.months.some((month) => month.episodes > 0);
    case "bigDay":
      return payload.bigDay !== null;
    case "rhythm":
      return payload.rhythm.archetype !== null;
    case "shame":
      return (
        payload.headline.titlesDropped > 0 ||
        payload.shame.stillPlanning.length > 0
      );
    case "crew":
      return payload.crew.length > 0;
    case "compare":
      return payload.compare.length > 0;
    case "intro":
    case "hours":
    case "summary":
      return true;
  }
}

type Viewer = Pick<User, "username" | "profilePictureUrl">;

interface StoryReelProps {
  period: string;
  /** The signed-in user, resolved by the page: the payload carries no username. */
  user: Viewer;
}

/**
 * The fourteen-card story. Tap the right two-thirds (or ArrowRight) to
 * advance, the left third (or ArrowLeft) to go back; it stops at either end
 * rather than wrapping. Close, or Escape, returns to the recap page.
 */
export function StoryReel({ period, user }: StoryReelProps) {
  const router = useRouter();
  const { data: payload, isLoading, error } = useSeriesFinale(period);
  const [index, setIndex] = useState(0);

  const cards = useMemo(
    () =>
      payload && !payload.thin
        ? REEL_ORDER.filter((id) => hasContent(id, payload))
        : [],
    [payload],
  );

  const close = useCallback(
    () => router.push(`/series-finale/${period}`),
    [router, period],
  );

  const go = useCallback(
    (delta: number) => {
      setIndex((current) =>
        Math.min(Math.max(current + delta, 0), Math.max(cards.length - 1, 0)),
      );
    },
    [cards.length],
  );

  // Each card starts at its top, however far down the last one was read.
  useEffect(() => {
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Alt+Arrow is the browser's own back and forward.
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close]);

  if (isLoading) {
    return (
      <Frame>
        <div className="flex min-h-dvh items-center justify-center">
          <LoadingSpinner text="Putting your year together" />
        </div>
      </Frame>
    );
  }

  if (error instanceof SeriesFinaleUnavailableError) {
    return (
      <Frame>
        <div className="flex min-h-dvh items-center px-4">
          <UnavailableNotice period={period} />
        </div>
      </Frame>
    );
  }

  if (error || !payload) {
    return (
      <Frame onClose={close}>
        <div className="flex min-h-dvh items-center px-4">
          <LoadFailedNotice />
        </div>
      </Frame>
    );
  }

  if (payload.thin) {
    return (
      <Frame onClose={close}>
        <div className="flex min-h-dvh items-center px-4">
          <ThinYearCard
            label={payload.period.label}
            episodes={payload.headline.episodes}
            titles={payload.headline.titlesCompleted}
          />
        </div>
      </Frame>
    );
  }

  const position = Math.min(index, cards.length - 1);
  const current = cards[position];
  if (current === undefined) return null;

  return (
    <Frame onClose={close} progress={{ position, total: cards.length }}>
      {/* A stable live region, so each new card is read out as it arrives. */}
      <div aria-live="polite">
        {/* Keyed by card so each one's entrance plays when it arrives. */}
        <div
          key={current}
          role="group"
          aria-roledescription="card"
          aria-label={`Card ${position + 1} of ${cards.length}`}
        >
          <StoryCard id={current} payload={payload} viewer={user} />
        </div>
      </div>

      {/*
        The mock's film grain and scan line, over the card, under the taps. The
        clipping wrapper keeps the drifting grain from widening the page; it
        holds no content, so it never cuts a card short.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:3px_3px] opacity-30 motion-safe:animate-[wt-grain_7s_steps(10)_infinite]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.06),transparent)] bg-[length:100%_140px] opacity-20 motion-safe:animate-[wt-scan_7s_linear_infinite]" />
      </div>

      {/*
        Tap zones: buttons, so they are named and reachable without a pointer.
        They span the whole card however tall it grows; a touch drag over them
        still scrolls the page.
      */}
      <button
        type="button"
        aria-label="Previous card"
        onClick={() => go(-1)}
        className="absolute top-20 bottom-0 left-0 z-10 w-1/3 cursor-w-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-inset"
      />
      <button
        type="button"
        aria-label="Next card"
        onClick={() => go(1)}
        className="absolute top-20 right-0 bottom-0 z-10 w-2/3 cursor-e-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-inset"
      />
    </Frame>
  );
}

/**
 * The phone-shaped column every state renders in, with the story's chrome:
 * progress bars when there is a reel, the logo, and the close control.
 */
function Frame({
  onClose,
  progress,
  children,
}: {
  onClose?: () => void;
  progress?: { position: number; total: number };
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-gray-950">
      {/*
        At least one screen tall, and taller when a card needs it: the page
        scrolls rather than a card losing its bottom (attribution included).
      */}
      <div className="relative min-h-dvh w-full max-w-md bg-gray-950 select-none">
        {children}

        {/* Fixed, so the progress and the close control stay in reach. */}
        <div className="fixed inset-x-0 top-0 z-20 mx-auto w-full max-w-md bg-gradient-to-b from-gray-950/80 to-transparent px-4 pt-3 pb-2">
          {progress ? (
            <div className="flex gap-1">
              {Array.from({ length: progress.total }, (_, bar) => {
                const done = bar <= progress.position;
                return (
                  <div
                    key={bar}
                    role="progressbar"
                    aria-label={`Card ${bar + 1} of ${progress.total}`}
                    aria-valuemin={0}
                    aria-valuemax={1}
                    aria-valuenow={done ? 1 : 0}
                    className="h-[2.5px] flex-1 overflow-hidden rounded-sm bg-white/20"
                  >
                    <div
                      className={cn(
                        "h-full rounded-sm bg-white",
                        done ? "w-full" : "w-0",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-center justify-between pt-3">
            <Image
              src="/logo-master.svg"
              alt="WatchThis"
              width={179}
              height={50}
              className="h-11 w-auto"
            />
            {onClose ? (
              <button
                type="button"
                aria-label="Close story"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
