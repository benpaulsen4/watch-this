/**
 * The pieces every story card is built from: the full-bleed shell over its
 * wash, the staggered entrances, and the eyebrow and headline type.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { StoryCardId } from "../StoryReel";
import { TmdbAttribution } from "../TmdbAttribution";

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

export function Enter({
  as: Element = "div",
  kind = "rise",
  delay = 0,
  className,
  children,
}: {
  /** The element to render; a heading keeps the card's outline navigable. */
  as?: "div" | "h2";
  kind?: keyof typeof ENTER;
  /** Milliseconds, so a card's lines arrive one after another. */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Element
      className={cn(ENTER[kind], className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Element>
  );
}

/**
 * One full-bleed card over its wash, never shorter than the screen and never
 * cut short by it. `align="end"` sits the content low, as
 * the hours card does; `centred` centres it. TMDB attribution rides on every
 * card that shows their metadata.
 */
export function Shell({
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

export function Eyebrow({
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

/**
 * A card's headline under the eyebrow, where the mock has one. An `h2`, under
 * the reel's one `h1`, so heading navigation finds each card's point.
 */
export function Headline({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Enter
      as="h2"
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
