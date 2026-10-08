import { Badge } from "@/components/ui/Badge";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { pluralise } from "./format";

type Shame = SeriesFinalePayload["shame"];

/** Dropped shows, each with the furthest episode reached when there is one. */
export function DroppedBadges({ shows }: { shows: Shame["dropped"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {shows.map((show) => (
        <Badge key={show.tmdbId} variant="dropped">
          {show.lastEpisode
            ? `${show.title} · ${show.lastEpisode}`
            : show.title}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Films still on the planning list, with how long each has waited. The payload
 * holds every one of them, oldest first; callers slice to what their layout
 * can hold.
 */
export function PlanningBadges({ films }: { films: Shame["stillPlanning"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {films.map((film) => (
        <Badge key={film.tmdbId} variant="planning">
          {`${film.title} · ${pluralise(film.days, "day")}`}
        </Badge>
      ))}
    </div>
  );
}
