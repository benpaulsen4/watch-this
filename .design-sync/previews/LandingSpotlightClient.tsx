import { Button, LandingSpotlightClient } from "watch-this";

export function Hero() {
  return (
    <LandingSpotlightClient className="rounded-2xl border border-gray-800 bg-gray-900/40 p-10">
      <h1 className="text-4xl font-bold tracking-tight text-white">
        Never argue about what to watch again
      </h1>
      <p className="mt-4 max-w-lg text-gray-300">
        Track films and shows, build lists with the people you actually watch
        with, and pick up exactly where you left off.
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="gradient" size="lg">
          Create your first list
        </Button>
        <Button variant="outline" size="lg">
          Browse trending
        </Button>
      </div>
    </LandingSpotlightClient>
  );
}

export function FeaturePanel() {
  return (
    <LandingSpotlightClient className="rounded-xl border border-gray-800 bg-gray-900/40 p-8">
      <h2 className="text-xl font-semibold text-white">Shared lists</h2>
      <p className="mt-2 max-w-md text-sm text-gray-300">
        Invite someone and you both see the same list update as it changes — no
        screenshots, no group chat archaeology.
      </p>
    </LandingSpotlightClient>
  );
}
