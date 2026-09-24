import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { formatCount } from "./format";

/**
 * Compare data: renders only inside the authenticated recap and story, never
 * in anything the share image could reuse.
 */
type Peer = SeriesFinalePayload["compare"][number];

/**
 * Titles finished in the period: only you, both of you, only them -- as the
 * mock's three overlapping discs, with the shared middle on top.
 */
export function CompareSplit({
  peer,
}: {
  peer: Pick<Peer, "username" | "onlyYou" | "both" | "onlyThem">;
}) {
  return (
    <div className="flex items-center justify-center">
      <div className="-mr-[34px] flex h-[108px] w-[108px] flex-none items-center justify-center rounded-full border border-red-600/45 bg-red-600/20 pr-9">
        <div className="text-center">
          <div className="text-[19px] leading-none font-bold text-gray-100 tabular-nums">
            {formatCount(peer.onlyYou)}
          </div>
          <div className="mt-1 text-[11px] leading-none text-gray-400">
            only you
          </div>
        </div>
      </div>
      <div className="relative z-10 flex h-[72px] w-[72px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-orange-500 shadow-[0_8px_24px_-6px_rgba(220,38,38,0.6)]">
        <div className="text-center">
          <div className="text-[21px] leading-none font-bold text-white tabular-nums">
            {formatCount(peer.both)}
          </div>
          <div className="mt-0.5 text-[10px] leading-none text-white/80">
            both
          </div>
        </div>
      </div>
      <div className="-ml-[34px] flex h-[108px] w-[108px] flex-none items-center justify-center rounded-full border border-purple-500/40 bg-purple-500/20 pl-9">
        <div className="min-w-0 text-center">
          <div className="text-[19px] leading-none font-bold text-gray-100 tabular-nums">
            {formatCount(peer.onlyThem)}
          </div>
          <div className="mt-1 max-w-[4.25rem] truncate text-[11px] leading-none text-gray-400">
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
}: {
  peer: Pick<
    Peer,
    "username" | "theyFinishedYouDropped" | "bothPlanningNeitherStarted"
  >;
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

  return (
    <dl className="border-b border-gray-700">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex items-center justify-between gap-3 border-t border-gray-700 py-2.5"
        >
          <dt className="text-[13px] leading-snug text-gray-400">
            {fact.label}
          </dt>
          <dd
            className={`text-right text-[13px] leading-snug font-semibold ${fact.tone}`}
          >
            {fact.title}
          </dd>
        </div>
      ))}
    </dl>
  );
}
