import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { andMore, planningLine, planningMoreLine, shameIntro } from "../format";
import { Enter, Eyebrow, Headline, Shell } from "./StoryShell";

type Payload = SeriesFinalePayload;

/**
 * How many dropped shows the card has room for -- one fewer when the
 * planning box shares it. The rest are counted, not listed.
 */
const DROPPED_SHOWN = 6;
const DROPPED_SHOWN_WITH_PLANNING = 5;

export function ShameCard({
  shame,
  titlesDropped,
}: {
  shame: Payload["shame"];
  /** The headline's count; see `shameIntro`. */
  titlesDropped: number;
}) {
  const intro = shameIntro(shame, titlesDropped);
  const [oldest, ...waiting] = shame.stillPlanning;
  const dropped = shame.dropped.slice(
    0,
    oldest ? DROPPED_SHOWN_WITH_PLANNING : DROPPED_SHOWN,
  );
  // Everything not listed, whether cut for room or never named.
  const droppedMore = andMore(titlesDropped - dropped.length);
  const waitingMore = planningMoreLine(waiting.length);

  return (
    <Shell id="shame" tmdb>
      <Eyebrow className="mb-2.5">Hall of shame</Eyebrow>
      {intro ? (
        <Headline className="mb-6 text-2xl leading-tight">{intro}</Headline>
      ) : null}
      {dropped.length > 0 ? (
        <Enter delay={140}>
          <ul className="flex flex-col gap-[9px]">
            {dropped.map((show) => (
              <li
                key={show.tmdbId}
                className="flex items-center justify-between gap-3 rounded-[11px] border border-white/10 bg-white/[0.07] px-[15px] py-3"
              >
                <span className="text-[15px] leading-tight font-medium text-white">
                  {show.title}
                </span>
                {show.lastEpisode ? (
                  <span className="font-mono text-xs whitespace-nowrap text-red-400">
                    {`last: ${show.lastEpisode}`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {droppedMore ? (
            <p className="mt-2.5 text-[13px] text-white/50">{droppedMore}</p>
          ) : null}
        </Enter>
      ) : null}
      {oldest ? (
        <Enter
          kind="fade"
          delay={500}
          className="mt-5 rounded-[11px] border border-yellow-600/30 bg-yellow-600/15 px-[17px] py-[15px]"
        >
          <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-yellow-400 uppercase">
            Still &ldquo;planning&rdquo;
          </div>
          <p className="text-sm leading-normal text-pretty text-white/80">
            {planningLine(oldest)}
          </p>
          {waitingMore ? (
            <p className="mt-1 text-[13px] text-white/50">{waitingMore}</p>
          ) : null}
        </Enter>
      ) : null}
    </Shell>
  );
}
