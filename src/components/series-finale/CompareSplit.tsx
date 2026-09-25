import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { formatCount } from "./format";

/**
 * Compare data: renders only inside the authenticated recap and story, never
 * in anything the share image could reuse.
 */
type Peer = SeriesFinalePayload["compare"][number];

/**
 * Disc geometry and type per surface: "default" is the recap's panel (1e),
 * "large" the story's card (1c). Only the classes differ; the content and the
 * red / gradient / purple treatment are one implementation.
 */
const SIZES = {
  default: {
    outer: "h-[108px] w-[108px]",
    you: "-mr-[34px] pr-9 border-red-600/45 bg-red-600/20",
    them: "-ml-[34px] pl-9 border-purple-500/40 bg-purple-500/20",
    outerCount: "text-[19px] text-gray-100",
    outerLabel: "mt-1 text-[11px] text-gray-400",
    themLabelWidth: "max-w-[4.25rem]",
    middle: "h-[72px] w-[72px] shadow-[0_8px_24px_-6px_rgba(220,38,38,0.6)]",
    middleCount: "text-[21px]",
    middleLabel: "mt-0.5 text-[10px] text-white/80",
  },
  large: {
    outer: "h-32 w-32",
    // 128 + 88 + 128 - 2 * 48 = 248px, inside the 260px a 320px phone
    // leaves between the story's 30px gutters.
    you: "-mr-12 pr-12 border-red-400/45 bg-red-600/25",
    them: "-ml-12 pl-12 border-purple-400/40 bg-purple-500/20",
    outerCount: "text-2xl text-white",
    outerLabel: "mt-1 text-[11px] text-white/60",
    themLabelWidth: "max-w-[5rem]",
    middle: "h-[88px] w-[88px] shadow-[0_10px_30px_-8px_rgba(220,38,38,0.7)]",
    middleCount: "text-[26px]",
    middleLabel: "mt-[3px] text-[11px] text-white/80",
  },
} as const;

/**
 * Titles finished in the period: only you, both of you, only them -- as the
 * mock's three overlapping discs, with the shared middle on top.
 */
export function CompareSplit({
  peer,
  size = "default",
}: {
  peer: Pick<Peer, "username" | "onlyYou" | "both" | "onlyThem">;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];

  return (
    <div className="flex items-center justify-center">
      <div
        data-disc=""
        className={cn(
          "flex flex-none items-center justify-center rounded-full border",
          styles.outer,
          styles.you,
        )}
      >
        <div className="text-center">
          <div
            className={cn(
              "leading-none font-bold tabular-nums",
              styles.outerCount,
            )}
          >
            {formatCount(peer.onlyYou)}
          </div>
          <div className={cn("leading-none", styles.outerLabel)}>only you</div>
        </div>
      </div>
      <div
        data-disc=""
        className={cn(
          "relative z-10 flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-orange-500",
          styles.middle,
        )}
      >
        <div className="text-center">
          <div
            className={cn(
              "leading-none font-bold text-white tabular-nums",
              styles.middleCount,
            )}
          >
            {formatCount(peer.both)}
          </div>
          <div className={cn("leading-none", styles.middleLabel)}>both</div>
        </div>
      </div>
      <div
        data-disc=""
        className={cn(
          "flex flex-none items-center justify-center rounded-full border",
          styles.outer,
          styles.them,
        )}
      >
        <div className="min-w-0 text-center">
          <div
            className={cn(
              "leading-none font-bold tabular-nums",
              styles.outerCount,
            )}
          >
            {formatCount(peer.onlyThem)}
          </div>
          <div
            className={cn(
              "truncate leading-none",
              styles.outerLabel,
              styles.themLabelWidth,
            )}
          >
            only {peer.username}
          </div>
        </div>
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
