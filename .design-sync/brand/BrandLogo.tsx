import {
  APP_ICON,
  APP_ICON_RATIO,
  ICON,
  ICON_RATIO,
  JUSTWATCH,
  JUSTWATCH_RATIO,
  TMDB,
  TMDB_RATIO,
  WORDMARK,
  WORDMARK_RATIO,
} from "./logo-data";

const MARKS = {
  wordmark: { src: WORDMARK, ratio: WORDMARK_RATIO, alt: "WatchThis" },
  icon: { src: ICON, ratio: ICON_RATIO, alt: "WatchThis" },
  appIcon: { src: APP_ICON, ratio: APP_ICON_RATIO, alt: "WatchThis" },
  tmdb: { src: TMDB, ratio: TMDB_RATIO, alt: "The Movie Database" },
  justwatch: { src: JUSTWATCH, ratio: JUSTWATCH_RATIO, alt: "JustWatch" },
} as const;

export interface BrandLogoProps {
  /**
   * Which mark to render:
   * - `wordmark` — the full lockup, glyph + "WatchThis" (default)
   * - `icon` — the glyph alone; the favicon/app-icon mark, scalable
   * - `appIcon` — the shipped app-icon artwork, glyph on its dark circle
   * - `tmdb` / `justwatch` — third-party attribution marks
   */
  mark?: keyof typeof MARKS;
  /** Rendered height in px; the mark keeps its aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * The WatchThis marks, plus the third-party attribution marks.
 *
 * All are inlined as data URIs from the repo's own assets, so they render
 * anywhere — a `/logo-master.svg` path resolves only inside the Next app,
 * never in a generated design.
 *
 * Use `wordmark` where there is horizontal room, `icon` where there is not
 * (nav rails, compact headers, avatars, favicons) — it is the same glyph the
 * favicon and mobile icons use, but scalable. `appIcon` is the finished
 * home-screen artwork and should only be shown when depicting the installed
 * app; don't use it as an inline logo.
 *
 * Both WatchThis marks carry the red-to-orange gradient and are built for dark
 * surfaces. Place them on `bg-gray-950`/`bg-gray-900`; never on light, never
 * recoloured or stretched.
 *
 * @category Brand
 */
export function BrandLogo({
  mark = "wordmark",
  height = 40,
  className,
}: BrandLogoProps) {
  const { src, ratio, alt } = MARKS[mark];
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
