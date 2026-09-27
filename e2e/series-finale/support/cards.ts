// The share card as bytes: where the specs save card PNGs, and a PNG's
// dimensions read straight from its IHDR chunk (no image library needed).
import { join } from "node:path";

import { ARTIFACTS_DIR } from "../env/test-env";

/** artifacts/cards/ -- card PNGs saved for the report. */
export const CARDS_DIR = join(ARTIFACTS_DIR, "cards");

/** The share card's size (share-card.tsx SHARE_CARD_WIDTH x SHARE_CARD_HEIGHT). */
export const CARD_SIZE = { width: 1080, height: 1350 } as const;

/** Width and height from a PNG's IHDR chunk, or null if `bytes` is not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
