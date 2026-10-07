"use client";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { ComparePeerPicker, useComparePeer } from "../ComparePeerPicker";
import { CompareFacts, CompareSplit } from "../CompareSplit";
import { compareHeadline, overlapLine } from "../format";
import { Enter, Eyebrow, Headline, Shell } from "./StoryShell";

type Payload = SeriesFinalePayload;

/**
 * One peer at a time, the closest first (`compare` arrives ordered by titles
 * in common); the others can be swapped in, as in the mock.
 */
export function CompareCard({ compare }: { compare: Payload["compare"] }) {
  const [peer, setPeer] = useComparePeer(compare);
  if (!peer) return null;

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
      {/* Above the tap zones, so a swap is a click and not a card change. */}
      <ComparePeerPicker
        size="large"
        peers={compare}
        selected={peer.userId}
        onSelect={setPeer}
        className="relative z-20 mt-5"
      />
    </Shell>
  );
}
