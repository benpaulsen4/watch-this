// @vitest-environment node
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";

import type { ShareablePayload } from "./share";
import { shareQrDataUrl } from "./share";
import {
  loadShareCardLogos,
  renderShareCard,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from "./share-card";

// The real renderer, not a mock. No dev server with a database runs in this
// project's verification, so this is the only thing that proves Satori
// accepts the card's layout -- a container missing `display: "flex"`, an
// unsupported CSS value or an image it cannot decode fails the render here.

const card = (): ShareablePayload => ({
  period: { label: "2026" },
  headline: {
    hours: 412,
    episodes: 1208,
    titlesCompleted: 47,
    titlesDropped: 6,
  },
  rhythm: { archetype: "weekday-marathoner", topWeekday: 6 },
  topShow: { title: "The Bear", posterPath: "/bear.jpg" },
  niche: { title: "Ich war zuhause, aber" },
});

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect(Array.from(bytes.subarray(0, 8))).toEqual(signature);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Bytes 8-11 are the first chunk's length; 12-15 its type.
  expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe("IHDR");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * For eyeballing the layout, not for assertions:
 * `SHARE_CARD_PNG_DIR=/some/dir npx vitest run share-card` writes each render
 * there as `<name>.png`. Unset in normal runs, so nothing is written.
 */
async function keepForInspection(name: string, png: Uint8Array) {
  const dir = process.env.SHARE_CARD_PNG_DIR;
  if (dir) await writeFile(join(dir, `${name}.png`), png);
}

async function render(input: Parameters<typeof renderShareCard>[0]) {
  const response = new ImageResponse(renderShareCard(input), {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
  });
  return new Uint8Array(await response.arrayBuffer());
}

describe("renderShareCard under the real ImageResponse", () => {
  it("renders the full card to a 1080x1350 PNG", async () => {
    const logos = await loadShareCardLogos();
    const qr = await shareQrDataUrl("https://watchthis.example/");
    expect(qr).not.toBeNull();

    const png = await render({
      card: card(),
      username: "ben",
      qr,
      // Any decodable raster stands in for the TMDB poster; the QR is one.
      poster: qr,
      ...logos,
    });

    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keepForInspection("share-card", png);
  }, 30_000);

  it("renders the placeholder poster frame when there is no poster", async () => {
    const png = await render({
      card: card(),
      username: "ben",
      qr: null,
      poster: null,
      ...(await loadShareCardLogos()),
    });

    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keepForInspection("share-card-placeholder", png);
  }, 30_000);

  it("renders a sparse year: no top show, no archetype, long titles", async () => {
    const sparse: ShareablePayload = {
      ...card(),
      rhythm: { archetype: null, topWeekday: null },
      topShow: null,
      niche: {
        title:
          "A Film Whose Title Runs On Long Enough To Wrap Across Several Lines Of The Card, Which The Clamp Cuts At Two",
      },
    };

    const png = await render({
      card: sparse,
      username: "a-rather-long-username-for-the-hero-line",
      qr: null,
      poster: null,
      ...(await loadShareCardLogos()),
    });

    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keepForInspection("share-card-sparse", png);
  }, 30_000);
});
