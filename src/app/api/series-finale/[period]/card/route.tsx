import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { getSiteUrl } from "@/lib/seo/site";
import { parsePeriodLabel } from "@/lib/series-finale/periods";
import { getOrGenerateSnapshot } from "@/lib/series-finale/service";
import { shareQrDataUrl, stripCrossUserData } from "@/lib/series-finale/share";
import {
  renderShareCard,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from "@/lib/series-finale/share-card";
import { getImageUrl } from "@/lib/tmdb/client";

// NOT edge. This route reads the database, and postgres-js opens raw TCP
// sockets the edge runtime does not provide -- unlike src/app/opengraph-image.tsx,
// which reads nothing and can afford `runtime = "edge"`.
export const runtime = "nodejs";

const POSTER_TIMEOUT_MS = 3000;
// A w342 poster is tens of kilobytes; anything near this is not one.
const POSTER_MAX_BYTES = 2 * 1024 * 1024;
// The formats Satori decodes that TMDB serves. WebP, should the CDN ever
// negotiate it, would fail the whole render rather than just the poster.
const POSTER_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * The top show's poster as a data URL, or null for the placeholder frame.
 *
 * Fetched here rather than handed to Satori as a remote `src`: Satori fetches
 * remote images itself and a failed fetch fails the whole render, whereas a
 * missing poster should cost only the poster.
 */
async function posterDataUrl(
  posterPath: string | null,
): Promise<string | null> {
  const url = getImageUrl(posterPath, "w342");
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(POSTER_TIMEOUT_MS),
      // The host is fixed by getImageUrl; a redirect is the one way off it.
      redirect: "error",
    });
    // The base type only: `image/jpeg; charset=...` would otherwise end up
    // inside the data URL and make it malformed.
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!response.ok || !type || !POSTER_TYPES.has(type)) return null;
    if (Number(response.headers.get("content-length")) > POSTER_MAX_BYTES) {
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > POSTER_MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// GET /api/series-finale/[period]/card - the viewer's 1080x1350 share image.
// The period is the segment before "card", parsed from `request.url` for the
// same reason as the payload route beside this one: `withAuth` wraps a
// single-argument handler.
const handler = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const label = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const full = await getOrGenerateSnapshot(request.user.id, period);

    // A thin year gets the thin-year card in the app, not a share image: a
    // card announcing "3 hours" is exactly what the thin rule exists to avoid.
    if (!full || full.thin) {
      return NextResponse.json(
        { error: "Period not available" },
        { status: 404 },
      );
    }

    // The privacy boundary. Everything below renders from `card`, which by
    // construction carries nobody else's data; `full` exists only to be
    // sanitised.
    const card = stripCrossUserData(full);

    const [qr, poster] = await Promise.all([
      shareQrDataUrl(getSiteUrl("/")),
      posterDataUrl(card.topShow?.posterPath ?? null),
    ]);

    // ImageResponse renders lazily inside its body stream, so a Satori error
    // would otherwise surface as a truncated 200 after this handler returned.
    // Buffering here routes it through handleApiError instead.
    const renderPng = (withPoster: string | null) =>
      new ImageResponse(
        renderShareCard({
          card,
          username: request.user.username,
          qr,
          poster: withPoster,
        }),
        { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
      ).arrayBuffer();

    let png: ArrayBuffer;
    try {
      png = await renderPng(poster);
    } catch (error) {
      // A poster that passed the type check can still be one Satori cannot
      // decode. It should cost the poster, not the card: draw the
      // placeholder frame instead. Without a poster there is nothing to drop.
      if (poster === null) throw error;
      console.warn("Series Finale card: retrying without the poster", error);
      png = await renderPng(null);
    }

    return new NextResponse(png, {
      headers: { "Content-Type": "image/png" },
    });
  } catch (error) {
    return handleApiError(error, "Series Finale card");
  }
});

// The image is one user's recap at a URL that is the same for every user, so
// no shared cache may keep it -- 401s and errors included.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const response = await handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
