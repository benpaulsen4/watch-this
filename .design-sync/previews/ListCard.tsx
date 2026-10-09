// Poster collages can't render here: next/image rejects image.tmdb.org because
// the app's next.config image host allowlist is compile-time only. Empty
// posterPaths is therefore the only honest state — so these cards are newly
// created lists, where "Nothing here" and an item count of 0 agree.
import { ListCard } from "watch-this";

const base = {
  ownerId: "user_1",
  isArchived: false,
  syncWatchStatus: true,
  createdAt: new Date("2026-01-14T10:00:00Z"),
  updatedAt: new Date("2026-02-02T10:00:00Z"),
  posterPaths: [],
  itemCount: 0,
};

export function NewList() {
  return (
    <div className="max-w-sm">
      <ListCard
        list={{
          ...base,
          id: "list_1",
          name: "Weekend Watchlist",
          description: "Things we actually intend to finish.",
          listType: "mixed",
          isPublic: false,
          collaborators: 2,
        }}
      />
    </div>
  );
}

export function ListTypes() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ListCard
        list={{
          ...base,
          id: "list_2",
          name: "Comfort rewatches",
          description: null,
          listType: "tv",
          isPublic: true,
          collaborators: 0,
        }}
      />
      <ListCard
        list={{
          ...base,
          id: "list_3",
          name: "Oscar catch-up",
          description: "Before the ceremony.",
          listType: "movies",
          isPublic: false,
          collaborators: 4,
        }}
      />
    </div>
  );
}
