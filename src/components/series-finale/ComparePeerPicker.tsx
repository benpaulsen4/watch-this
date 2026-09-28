"use client";

import { useState } from "react";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

/**
 * Compare data: renders only inside the authenticated recap and story, never
 * in anything the share image could reuse.
 */
type Peer = SeriesFinalePayload["compare"][number];

/**
 * The peer a comparison shows: the closest first (`compare` arrives ordered
 * by titles in common), then whichever was swapped in. A swapped-in peer no
 * longer in the list falls back to the closest.
 */
export function useComparePeer(
  compare: Peer[],
): [Peer | undefined, (userId: string) => void] {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peer =
    compare.find((candidate) => candidate.userId === selectedId) ?? compare[0];
  return [peer, setSelectedId];
}

/** "default" is the recap's panel (1e), "large" the story's card (1c). */
const SIZES = {
  default: {
    row: "text-[13px] text-gray-500",
    chip: "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 focus-visible:ring-offset-gray-900",
    pressed: "border-red-500/50 bg-red-600/15 text-gray-100",
  },
  large: {
    row: "text-[13px] text-white/45",
    chip: "border-white/15 bg-white/10 text-white/85 hover:bg-white/15 focus-visible:ring-offset-gray-950",
    pressed: "border-white/40 bg-white/25 text-white",
  },
} as const;

/**
 * "Swap in" and a chip per peer, the one shown pressed: the comparison's
 * choice of whom it compares with, shared by the recap's panel and the
 * story's card. Nothing with a single peer.
 */
export function ComparePeerPicker({
  peers,
  selected,
  onSelect,
  size = "default",
  className,
}: {
  peers: Pick<Peer, "userId" | "username">[];
  /** The `userId` of the peer shown. */
  selected: string;
  onSelect: (userId: string) => void;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (peers.length < 2) return null;
  const styles = SIZES[size];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        styles.row,
        className,
      )}
    >
      <span>Swap in</span>
      {peers.map((peer) => {
        const pressed = peer.userId === selected;
        return (
          <button
            key={peer.userId}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(peer.userId)}
            className={cn(
              "rounded-full border px-2.5 py-[5px] font-medium [overflow-wrap:anywhere] transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none",
              pressed ? styles.pressed : styles.chip,
            )}
          >
            {peer.username}
          </button>
        );
      })}
    </div>
  );
}
