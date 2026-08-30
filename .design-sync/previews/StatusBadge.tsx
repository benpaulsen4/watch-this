import { StatusBadge } from "watch-this";

export function AllStatuses() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status="watching" />
      <StatusBadge status="completed" />
      <StatusBadge status="planning" />
      <StatusBadge status="paused" />
      <StatusBadge status="dropped" />
    </div>
  );
}

export function ForMovies() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status="planning" contentType="movie" />
      <StatusBadge status="completed" contentType="movie" />
      <StatusBadge status="dropped" contentType="movie" />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status="watching" size="sm" />
      <StatusBadge status="watching" size="default" />
      <StatusBadge status="watching" size="lg" />
    </div>
  );
}
