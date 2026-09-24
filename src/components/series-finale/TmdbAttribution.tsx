import Image from "next/image";

/**
 * TMDB's required attribution for any surface showing their metadata: their
 * logo, unrestyled, and the disclaimer their terms ask for.
 */
export function TmdbAttribution() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Image src="/tmdb.svg" alt="TMDB" width={108} height={14} />
      <span className="text-xs text-gray-500">
        Title metadata from TMDB. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </span>
    </div>
  );
}
