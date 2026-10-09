import { LoadingSpinner } from "watch-this";

export function Sizes() {
  return (
    <div className="flex items-center gap-8">
      <LoadingSpinner size="sm" />
      <LoadingSpinner size="default" />
      <LoadingSpinner size="lg" />
      <LoadingSpinner size="xl" />
    </div>
  );
}

export function Variants() {
  return (
    <div className="flex items-center gap-8">
      <LoadingSpinner variant="default" size="lg" />
      <LoadingSpinner variant="primary" size="lg" />
      <LoadingSpinner variant="white" size="lg" />
      <LoadingSpinner variant="entertainment" size="lg" />
    </div>
  );
}

export function WithText() {
  return (
    <div className="flex items-center gap-10">
      <LoadingSpinner variant="primary" text="Loading your lists" />
      <LoadingSpinner size="lg" text="Syncing episodes from TMDB" />
    </div>
  );
}
