import { ActivityEntry } from "watch-this";

const ana = { id: "u_1", username: "ana", profilePictureUrl: null };
const marcus = { id: "u_2", username: "marcus", profilePictureUrl: null };

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

export function Feed() {
  return (
    <div className="max-w-xl space-y-1">
      <ActivityEntry
        currentUsername="ben"
        activity={{
          id: "a_1",
          activityType: "status_changed",
          user: ana,
          isCollaborative: false,
          createdAt: hoursAgo(2),
          metadata: { title: "Severance", status: "watching" },
        }}
      />
      <ActivityEntry
        currentUsername="ben"
        activity={{
          id: "a_2",
          activityType: "episode_progress",
          user: marcus,
          isCollaborative: false,
          createdAt: hoursAgo(6),
          metadata: {
            title: "The Bear",
            watched: true,
            seasonNumber: 2,
            episodeNumber: 7,
          },
        }}
      />
      <ActivityEntry
        currentUsername="ben"
        activity={{
          id: "a_3",
          activityType: "list_item_added",
          user: ana,
          isCollaborative: true,
          createdAt: hoursAgo(26),
          metadata: { title: "Dune: Part Two", listName: "Weekend Watchlist" },
        }}
      />
    </div>
  );
}

export function OwnActivity() {
  return (
    <div className="max-w-xl">
      <ActivityEntry
        currentUsername="ana"
        activity={{
          id: "a_4",
          activityType: "list_created",
          user: ana,
          isCollaborative: false,
          createdAt: hoursAgo(1),
          metadata: { listName: "Oscar catch-up" },
        }}
      />
    </div>
  );
}
