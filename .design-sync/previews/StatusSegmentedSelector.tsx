import { StatusSegmentedSelector } from "watch-this";

const noop = () => {};

export function Default() {
  return (
    <div className="max-w-xl">
      <StatusSegmentedSelector value="watching" onValueChange={noop} />
    </div>
  );
}

export function ForMovies() {
  return (
    <div className="max-w-xl">
      <StatusSegmentedSelector
        contentType="movie"
        value="completed"
        onValueChange={noop}
      />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="max-w-xl space-y-4">
      <StatusSegmentedSelector size="sm" value="watching" onValueChange={noop} />
      <StatusSegmentedSelector size="default" value="watching" onValueChange={noop} />
      <StatusSegmentedSelector size="lg" value="watching" onValueChange={noop} />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="max-w-xl">
      <StatusSegmentedSelector value="paused" onValueChange={noop} disabled />
    </div>
  );
}
