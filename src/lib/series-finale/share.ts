import QRCodeLib from "qrcode";

import type { SeriesFinalePayload } from "./types";

/**
 * Exactly what the summary card reads, and nothing else -- the viewer's own
 * year only. Plan 5's share image reuses this card, and the share image must
 * never carry crew, compare or `topShow.alsoTopFor` (other people's data), so
 * the type leaves them out rather than trusting a caller to empty them: a
 * field the card cannot name, it cannot render. `topShow` and `niche` are
 * reduced to their titles for the same reason.
 *
 * Lives here, in a pure module with no React import, rather than on the
 * `SummaryCard` component it was originally defined next to: the share image
 * route (Task 3) reads the database on the server, and a server module must
 * not import a client component file to reach a type. `SummaryCard` imports
 * it back from here.
 */
export interface SummaryCardData {
  period: Pick<SeriesFinalePayload["period"], "label">;
  headline: Pick<
    SeriesFinalePayload["headline"],
    "hours" | "episodes" | "titlesCompleted" | "titlesDropped"
  >;
  rhythm: Pick<SeriesFinalePayload["rhythm"], "archetype" | "topWeekday">;
  topShow: { title: string } | null;
  niche: { title: string } | null;
}

/**
 * A payload safe to render into an image that leaves the app: the summary
 * card's own allowlist, widened only so the card art has a poster to draw --
 * `topShow.posterPath` isn't cross-user data, it's the show's own artwork.
 */
export type ShareablePayload = Omit<SummaryCardData, "topShow"> & {
  topShow: { title: string; posterPath: string | null } | null;
};

/**
 * Remove every field describing somebody other than the viewer.
 *
 * This is an allowlist, not a denylist: the returned object is built field by
 * field from `payload`, never by spreading it and deleting the fields we
 * don't want. A denylist protects only against the cross-user fields known
 * today -- the next field added to `SeriesFinalePayload` would reach the
 * image by default. An allowlist requires a deliberate edit here before a new
 * field can be rendered at all, which is the guarantee the spec asks for:
 * crew and comparison data exist only inside the authenticated app, never in
 * anything shareable.
 */
export function stripCrossUserData(
  payload: SeriesFinalePayload,
): ShareablePayload {
  return {
    period: { label: payload.period.label },
    headline: {
      hours: payload.headline.hours,
      episodes: payload.headline.episodes,
      titlesCompleted: payload.headline.titlesCompleted,
      titlesDropped: payload.headline.titlesDropped,
    },
    rhythm: {
      archetype: payload.rhythm.archetype,
      topWeekday: payload.rhythm.topWeekday,
    },
    topShow: payload.topShow
      ? {
          title: payload.topShow.title,
          posterPath: payload.topShow.posterPath,
        }
      : null,
    niche: payload.niche ? { title: payload.niche.title } : null,
  };
}

/**
 * QR for the share card, pointing at the marketing splash page.
 *
 * Deliberately not a personal link. There is no public recap route, and this
 * is the one element of the card a stranger is likely to scan. Callers should
 * pass `getSiteUrl("/")` from `src/lib/seo/site.ts` -- the app's already-
 * resolved origin -- rather than reading `process.env.SITE_URL` directly,
 * which yields no QR in an environment where only `NEXT_PUBLIC_SITE_URL` is
 * set.
 *
 * Returns null rather than throwing: a missing QR should cost the corner of a
 * card, not the whole image.
 */
export async function shareQrDataUrl(siteUrl: string): Promise<string | null> {
  if (!siteUrl) return null;

  try {
    return await QRCodeLib.toDataURL(siteUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 180,
      color: { dark: "#101828", light: "#f3f4f6" },
    });
  } catch {
    return null;
  }
}
