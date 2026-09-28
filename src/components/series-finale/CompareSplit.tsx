import { useId } from "react";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { formatCount } from "./format";

/**
 * Compare data: renders only inside the authenticated recap and story, never
 * in anything the share image could reuse.
 */
type Peer = SeriesFinalePayload["compare"][number];

/**
 * Size and type per surface: "default" is the recap's panel (1e), "large" the
 * story's card (1c). Both scale with their column up to `frame`; only the
 * classes differ, and the content and the red / gradient / purple treatment
 * are one implementation.
 */
const SIZES = {
  default: {
    frame: "max-w-[25rem]",
    you: "fill-red-600/20 stroke-red-600/45",
    them: "fill-purple-500/20 stroke-purple-500/40",
    count: "text-[26px] sm:text-[30px]",
    outerCount: "text-gray-100",
    label: "mt-2 text-xs text-gray-400",
  },
  large: {
    frame: "max-w-[18rem]",
    you: "fill-red-600/25 stroke-red-400/45",
    them: "fill-purple-500/20 stroke-purple-400/40",
    count: "text-[30px]",
    outerCount: "text-white",
    label: "mt-2.5 text-[13px] text-white/60",
  },
} as const;

/**
 * Two discs of radius 100 in a 300 x 200 box, their centres one radius apart,
 * so the left lune, the lens and the right lune are each a third of the width
 * across the middle -- and each region's number sits at the centre of its
 * third. The lens is the discs' intersection: an arc of each between the
 * points where they cross, (150, 100 +/- 50 * sqrt 3).
 */
const LENS = "M150 13.397A100 100 0 0 1 150 186.603A100 100 0 0 1 150 13.397Z";

/**
 * Titles finished in the period: only you, both of you, only them -- two
 * overlapping discs with the shared lens in the brand gradient. Each number
 * sits in its region and its label beneath the picture in the same third,
 * wrapping as far as it needs: a name of any length is set whole, never cut
 * (F5), and nothing depends on how wide its glyphs are.
 */
export function CompareSplit({
  peer,
  size = "default",
}: {
  peer: Pick<Peer, "username" | "onlyYou" | "both" | "onlyThem">;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];
  // `useId`'s colons are not safe in a `url(#...)` reference.
  const gradient = `compare-lens-${useId().replace(/[^\w-]/g, "")}`;
  const regions = [
    {
      key: "you",
      count: peer.onlyYou,
      label: "only you",
      tone: styles.outerCount,
    },
    { key: "both", count: peer.both, label: "both", tone: "text-white" },
    {
      key: "them",
      count: peer.onlyThem,
      label: `only ${peer.username}`,
      tone: styles.outerCount,
    },
  ];

  return (
    <div className={cn("relative mx-auto w-full", styles.frame)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 300 200"
        className="absolute inset-x-0 top-0 aspect-[3/2] w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop
              offset="0"
              stopColor="currentColor"
              className="text-red-600"
            />
            <stop
              offset="1"
              stopColor="currentColor"
              className="text-orange-500"
            />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="100"
          vectorEffect="non-scaling-stroke"
          className={styles.you}
        />
        <circle
          cx="200"
          cy="100"
          r="100"
          vectorEffect="non-scaling-stroke"
          className={styles.them}
        />
        <path d={LENS} fill={`url(#${gradient})`} />
      </svg>
      <div className="relative grid grid-cols-3">
        {regions.map((region) => (
          <div
            key={region.key}
            data-region=""
            className="flex min-w-0 flex-col items-center text-center"
          >
            {/* A third of the width, the full height: its region's middle. */}
            <div
              className={cn(
                "flex aspect-[1/2] w-full items-center justify-center leading-none font-bold tabular-nums",
                styles.count,
                region.tone,
              )}
            >
              {formatCount(region.count)}
            </div>
            <div
              className={cn(
                "w-full px-1 leading-tight [overflow-wrap:anywhere]",
                styles.label,
              )}
            >
              {region.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The comparison's named facts, each only when the payload has one. The peer
 * is always named: we do not know anyone's pronouns.
 */
export function CompareFacts({
  peer,
  size = "default",
}: {
  peer: Pick<
    Peer,
    "username" | "theyFinishedYouDropped" | "bothPlanningNeitherStarted"
  >;
  /** "default": the recap's ruled list (1e). "large": the story's boxes (1c). */
  size?: "default" | "large";
}) {
  const facts = [
    peer.theyFinishedYouDropped
      ? {
          label: `${peer.username} finished, you dropped`,
          title: peer.theyFinishedYouDropped,
          tone: "text-red-400",
        }
      : null,
    peer.bothPlanningNeitherStarted
      ? {
          label: "On both lists, neither started",
          title: peer.bothPlanningNeitherStarted,
          tone: "text-gray-100",
        }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  if (facts.length === 0) return null;

  const large = size === "large";

  return (
    <dl
      className={cn(large ? "flex flex-col gap-2" : "border-b border-gray-700")}
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          data-fact=""
          className={cn(
            "flex items-center justify-between gap-3",
            large
              ? "rounded-[11px] border border-white/10 bg-white/[0.07] px-4 py-3"
              : "border-t border-gray-700 py-2.5",
          )}
        >
          <dt
            className={cn(
              "text-[13px] leading-snug",
              large ? "text-white/60" : "text-gray-400",
            )}
          >
            {fact.label}
          </dt>
          <dd
            className={cn(
              "text-right leading-snug font-semibold",
              large ? "text-sm" : "text-[13px]",
              fact.tone,
            )}
          >
            {fact.title}
          </dd>
        </div>
      ))}
    </dl>
  );
}
