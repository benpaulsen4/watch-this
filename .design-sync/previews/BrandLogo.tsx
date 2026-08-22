import { BrandLogo } from "watch-this";

export function Wordmark() {
  return (
    <div className="space-y-8">
      <BrandLogo height={56} />
      <BrandLogo height={40} />
      <BrandLogo height={24} />
    </div>
  );
}

export function ClearSpace() {
  return (
    <div className="inline-block rounded-xl border border-dashed border-gray-600 p-6">
      <BrandLogo height={40} />
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

export function OnSurfaces() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-gray-950 p-6">
        <BrandLogo height={32} />
        <p className="mt-2 text-xs text-gray-400">bg-gray-950 — page</p>
      </div>
      <div className="rounded-xl bg-gray-900 p-6">
        <BrandLogo height={32} />
        <p className="mt-2 text-xs text-gray-400">bg-gray-900 — raised</p>
      </div>
    </div>
  );
}
