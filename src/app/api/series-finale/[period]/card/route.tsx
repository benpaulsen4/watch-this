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
  loadShareCardLogos,
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
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
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

    const [qr, poster, logos] = await Promise.all([
      shareQrDataUrl(getSiteUrl("/")),
      posterDataUrl(card.topShow?.posterPath ?? null),
      loadShareCardLogos(),
    ]);

    const image = new ImageResponse(
      renderShareCard({
        card,
        username: request.user.username,
        qr,
        poster,
        ...logos,
      }),
      { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
    );

    // ImageResponse renders lazily inside its body stream, so a Satori error
    // would otherwise surface as a truncated 200 after this handler returned.
    // Buffering here routes it through handleApiError instead.
    const png = await image.arrayBuffer();

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
