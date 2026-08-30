import { ContentCardSkeleton } from "watch-this";

export function Single() {
  return (
    <div className="max-w-[220px]">
      <ContentCardSkeleton />
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <ContentCardSkeleton key={i} />
      ))}
    </div>
  );
}
