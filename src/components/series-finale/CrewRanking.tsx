import { ProfileImage } from "@/components/ui/ProfileImage";
import type { CrewMemberTotals } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { pluralise } from "./format";

/**
 * Crew data: renders only inside the authenticated recap and story, never in
 * anything the share image could reuse.
 */
interface CrewRankingProps {
  /**
   * The signed-in user's own row. The payload's `crew` never contains the
   * viewer, so their count comes from `headline.episodes`, not crew data.
   */
  viewer: {
    username: string;
    profilePictureUrl: string | null;
    episodes: number;
  };
  crew: CrewMemberTotals[];
}

interface Row {
  key: string;
  username: string;
  profilePictureUrl: string | null;
  episodes: number;
  isViewer: boolean;
}

/**
 * Everyone who shares a list with the viewer, the viewer included, ranked by
 * episodes -- the viewer first on a tie. Not hours: the viewer's headline
 * hours include films, while a collaborator's hours count episodes only, so
 * the two do not compare. Episodes do, and match the server's crew order.
 * Bars are drawn against the leader; the name and count are the text, the bar
 * decoration.
 */
export function CrewRanking({ viewer, crew }: CrewRankingProps) {
  const rows: Row[] = [
    {
      key: "viewer",
      username: viewer.username,
      profilePictureUrl: viewer.profilePictureUrl,
      episodes: viewer.episodes,
      isViewer: true,
    },
    ...crew.map((member) => ({
      key: member.userId,
      username: member.username,
      profilePictureUrl: null,
      episodes: member.episodes,
      isViewer: false,
    })),
  ].sort(
    (a, b) =>
      b.episodes - a.episodes || Number(b.isViewer) - Number(a.isViewer),
  );
  const leader = Math.max(...rows.map((row) => row.episodes), 0);

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3">
          <ProfileImage
            src={row.profilePictureUrl}
            username={row.username}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span
                data-name=""
                className={cn(
                  "truncate text-sm",
                  row.isViewer
                    ? "font-semibold text-white"
                    : "font-medium text-gray-200",
                )}
              >
                {row.isViewer ? "you" : row.username}
              </span>
              <span
                className={cn(
                  "text-[13px] font-semibold tabular-nums",
                  row.isViewer ? "text-gray-100" : "text-gray-300",
                )}
              >
                {pluralise(row.episodes, "episode")}
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 rounded-full bg-gray-700">
              <div
                data-episodes-bar=""
                className={cn(
                  "h-full rounded-full",
                  row.isViewer
                    ? "bg-gradient-to-r from-red-600 to-orange-500"
                    : "bg-gray-500",
                )}
                style={{
                  width:
                    leader === 0
                      ? "0%"
                      : `${Math.round((row.episodes / leader) * 100)}%`,
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
