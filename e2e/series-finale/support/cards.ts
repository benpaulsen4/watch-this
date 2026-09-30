// The share card as bytes: where the specs save card PNGs, a PNG's dimensions
// read straight from its IHDR chunk (no image library needed), and a pixel
// comparison that ignores the one region the card is allowed to vary in.
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { ARTIFACTS_DIR } from "../env/test-env";

/** artifacts/cards/ -- card PNGs saved for the report. */
export const CARDS_DIR = join(ARTIFACTS_DIR, "cards");

/** The share card's size (share-card.tsx SHARE_CARD_WIDTH x SHARE_CARD_HEIGHT). */
export const CARD_SIZE = { width: 1080, height: 1350 } as const;

/**
 * The top-show poster's box within the 1080x1350 card, the one region whose
 * pixels are allowed to differ between two otherwise-identical renders --
 * `route.tsx`'s `posterDataUrl` fetches the poster from TMDB's CDN live on
 * every render, and the bytes it gets back are not guaranteed stable.
 *
 * `width`/`height` mirror share-card.tsx's `POSTER_WIDTH`/`POSTER_HEIGHT`
 * (lines 43-44; not exported, so copied here) and `x` mirrors the card
 * root's `padding: 80` (line 230), which is also the poster's left edge.
 * `y` has no single named constant to copy -- it falls out of Satori's flex
 * layout, including a baseline-aligned text row, above the poster -- so it
 * was measured directly from the real renderer (`ImageResponse` +
 * `renderShareCard`, the same pair `route.tsx` uses) rather than computed by
 * hand: rendering the card once with a poster and once with the placeholder
 * and diffing every pixel gives the exact bounding box of what changed, and
 * it is nothing but this rectangle. That was re-checked across several
 * payloads (short/long hours, short/long titles, no niche) and stayed at
 * `y: 670` every time, because nothing above the poster in the layout
 * depends on content that varies in width -- only text that would *wrap* to
 * an extra line could move it, and none of the fields above the poster row
 * (period label, username, the three stat numbers) do for any persona this
 * suite drives.
 */
export const POSTER_BOX = { x: 80, y: 670, width: 184, height: 276 } as const;

/** Width and height from a PNG's IHDR chunk, or null if `bytes` is not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export interface PosterMaskedComparison {
  /** Both PNGs decoded to the same width/height as CARD_SIZE. */
  sameSize: boolean;
  /** Every pixel outside POSTER_BOX matched, byte for byte. */
  outsideIdentical: boolean;
  /** Every pixel inside POSTER_BOX also matched -- informational only. */
  posterBoxIdentical: boolean;
}

/**
 * Decodes two card PNGs in the browser (via `<canvas>`, `pngjs` is only a
 * transitive dependency here so it is not used) and compares every pixel,
 * masking out `POSTER_BOX`. Runs inside `page` because Node has no built-in
 * PNG decoder and the project takes no new dependency to add one.
 */
export async function compareCardPngsOutsidePosterBox(page: Page, a: Buffer, b: Buffer): Promise<PosterMaskedComparison> {
  return page.evaluate(
    async ([aBase64, bBase64, box, expectedWidth, expectedHeight]) => {
      const decode = async (base64: string): Promise<ImageData> => {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("image failed to decode"));
        });
        image.src = `data:image/png;base64,${base64}`;
        await loaded;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d canvas context unavailable");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };

      const imageA = await decode(aBase64);
      const imageB = await decode(bBase64);
      const sameSize =
        imageA.width === imageB.width &&
        imageA.height === imageB.height &&
        imageA.width === expectedWidth &&
        imageA.height === expectedHeight;
      if (!sameSize) return { sameSize, outsideIdentical: false, posterBoxIdentical: false };

      let outsideIdentical = true;
      let posterBoxIdentical = true;
      for (let y = 0; y < imageA.height; y++) {
        const inBoxRow = y >= box.y && y < box.y + box.height;
        for (let x = 0; x < imageA.width; x++) {
          const idx = (y * imageA.width + x) * 4;
          const same =
            imageA.data[idx] === imageB.data[idx] &&
            imageA.data[idx + 1] === imageB.data[idx + 1] &&
            imageA.data[idx + 2] === imageB.data[idx + 2] &&
            imageA.data[idx + 3] === imageB.data[idx + 3];
          if (same) continue;
          const inBox = inBoxRow && x >= box.x && x < box.x + box.width;
          if (inBox) posterBoxIdentical = false;
          else outsideIdentical = false;
        }
      }
      return { sameSize, outsideIdentical, posterBoxIdentical };
    },
    [a.toString("base64"), b.toString("base64"), POSTER_BOX, CARD_SIZE.width, CARD_SIZE.height] as const,
  );
}
