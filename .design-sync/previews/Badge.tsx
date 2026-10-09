import { Badge } from "watch-this";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Removed</Badge>
      <Badge variant="success">Available</Badge>
      <Badge variant="warning">Airing soon</Badge>
      <Badge variant="info">New season</Badge>
    </div>
  );
}

export function WatchStatus() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="watching">Watching</Badge>
      <Badge variant="completed">Completed</Badge>
      <Badge variant="planning">Plan to watch</Badge>
      <Badge variant="paused">Paused</Badge>
      <Badge variant="dropped">Dropped</Badge>
    </div>
  );
}

export function Metadata() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="genre">Sci-Fi</Badge>
      <Badge variant="genre">Thriller</Badge>
      <Badge variant="rating">★ 8.4</Badge>
      <Badge variant="year">2024</Badge>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="default">Default</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  );
}
