"use client";

import { useState } from "react";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { CompareFacts, CompareSplit } from "../CompareSplit";
import { compareHeadline, overlapLine } from "../format";
import { Enter, Eyebrow, Headline, Shell } from "./StoryShell";

type Payload = SeriesFinalePayload;

/**
 * One peer at a time, the closest first (`compare` arrives ordered by titles
 * in common); the others can be swapped in, as in the mock.
 */
export function CompareCard({ compare }: { compare: Payload["compare"] }) {
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
