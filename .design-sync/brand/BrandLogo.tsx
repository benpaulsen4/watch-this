import { JUSTWATCH_LOGO, TMDB_LOGO, WATCHTHIS_LOGO } from "./logo-data";

const MARKS = {
  watchthis: { src: WATCHTHIS_LOGO, alt: "WatchThis", ratio: 1075 / 300 },
  tmdb: { src: TMDB_LOGO, alt: "The Movie Database", ratio: 3.06 },
  justwatch: { src: JUSTWATCH_LOGO, alt: "JustWatch", ratio: 4.5 },
} as const;

export interface BrandLogoProps {
  /** Which mark to render. Defaults to the WatchThis wordmark. */
  mark?: keyof typeof MARKS;
  /** Rendered height in px; the mark keeps its aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * The WatchThis wordmark, plus the third-party attribution marks.
 *
 * The marks are inlined as data URIs from the repo's own `public/*.svg`, so
 * they render anywhere — a `/logo-master.svg` path resolves only inside the
 * Next app, never in a generated design.
 *
 * The wordmark carries the brand's red-to-orange gradient and is built for
 * dark surfaces. Place it on `bg-gray-950`/`bg-gray-900`; never on a light
 * background, and never recolour or stretch it.
 *
 * @category Brand
 */
export function BrandLogo({
  mark = "watchthis",
  height = 40,
  className,
}: BrandLogoProps) {
  const { src, alt, ratio } = MARKS[mark];
  return (
    <img
      src={src}
      alt={alt}
      height={height}
      width={Math.round(height * ratio)}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
