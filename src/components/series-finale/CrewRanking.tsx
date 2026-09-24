import { ProfileImage } from "@/components/ui/ProfileImage";
import type { CrewMemberTotals } from "@/lib/series-finale/types";
import { cn } from "@/lib/utils";

import { formatCount } from "./format";

/**
 * Crew data: renders only inside the authenticated recap and story, never in
 * anything the share image could reuse.
 */
interface CrewRankingProps {
  /**
   * The signed-in user's own row. The payload's `crew` never contains the
   * viewer, so their hours come from `headline`, not from crew data.
   */
  viewer: { username: string; profilePictureUrl: string | null; hours: number };
  crew: CrewMemberTotals[];
}

interface Row {
  key: string;
  username: string;
  profilePictureUrl: string | null;
  hours: number;
  isViewer: boolean;
}

/**
 * Everyone who shares a list with the viewer, the viewer included, ranked by
 * the hours shown beside them -- the viewer first on a tie. Bars are drawn
 * against the leader; the name and hours are the text, the bar decoration.
 */
export function CrewRanking({ viewer, crew }: CrewRankingProps) {
  const rows: Row[] = [
    {
      key: "viewer",
      username: viewer.username,
      profilePictureUrl: viewer.profilePictureUrl,
      hours: viewer.hours,
      isViewer: true,
    },
    ...crew.map((member) => ({
      key: member.userId,
      username: member.username,
      profilePictureUrl: null,
      hours: member.hours,
      isViewer: false,
    })),
  ].sort(
    (a, b) => b.hours - a.hours || Number(b.isViewer) - Number(a.isViewer),
  );
  const leader = Math.max(...rows.map((row) => row.hours), 0);

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
                {formatCount(row.hours)}h
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 rounded-full bg-gray-700">
              <div
                data-hours-bar=""
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
                      : `${Math.round((row.hours / leader) * 100)}%`,
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
