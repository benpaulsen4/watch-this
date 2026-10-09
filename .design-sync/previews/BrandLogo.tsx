import { BrandLogo } from "watch-this";

export function Wordmark() {
  return (
    <div className="flex flex-col items-start gap-6">
      <BrandLogo height={56} />
      <BrandLogo height={40} />
      <BrandLogo height={24} />
    </div>
  );
}

export function Icon() {
  return (
    <div className="flex items-end gap-8">
      {[64, 40, 32, 24, 16].map((h) => (
        <div key={h} className="flex flex-col items-center gap-2">
          <BrandLogo mark="icon" height={h} />
          <span className="text-xs text-gray-500">{h}px</span>
        </div>
      ))}
    </div>
  );
}

export function IconInUse() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <BrandLogo mark="icon" height={28} />
          <span className="text-sm font-medium text-gray-100">
            Weekend Watchlist
          </span>
        </div>
        <span className="text-xs text-gray-400">12 titles</span>
      </div>
      <p className="text-xs text-gray-400">
        Use the icon where there is no room for the wordmark — compact headers,
        nav rails, tab bars.
      </p>
    </div>
  );
}

export function AppIcon() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-8 rounded-xl bg-gray-300 p-6">
        <BrandLogo mark="appIcon" height={96} />
        <BrandLogo mark="appIcon" height={60} />
        <BrandLogo mark="appIcon" height={40} />
        <span className="text-xs text-gray-700">
          Shown on a light tile so the dark circular field reads — on a dark
          surface it blends into the page.
        </span>
      </div>
      <p className="max-w-lg text-xs text-gray-400">
        The finished home-screen artwork. Show it when depicting the installed
        app; use <code className="text-gray-300">mark=&quot;icon&quot;</code> for
        an inline logo — appIcon carries its own background and reads as a
        sticker anywhere else.
      </p>
    </div>
  );
}

export function OnSurfaces() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 rounded-xl bg-gray-950 p-6">
        <BrandLogo height={32} />
        <BrandLogo mark="icon" height={32} />
        <span className="text-xs text-gray-400">bg-gray-950 — page</span>
      </div>
      <div className="flex items-center gap-6 rounded-xl bg-gray-900 p-6">
        <BrandLogo height={32} />
        <BrandLogo mark="icon" height={32} />
        <span className="text-xs text-gray-400">bg-gray-900 — raised</span>
      </div>
      <div className="inline-flex items-center gap-4 rounded-xl border border-dashed border-gray-600 p-6">
        <BrandLogo height={40} />
        <span className="text-xs text-gray-400">
          Clear space — half the mark&apos;s height on all sides
        </span>
      </div>
    </div>
  );
}

export function Attribution() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="w-32 text-xs text-gray-400">Movie data</span>
        <BrandLogo mark="tmdb" height={18} />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-32 text-xs text-gray-400">Streaming data</span>
        <BrandLogo mark="justwatch" height={18} />
      </div>
    </div>
  );
}
