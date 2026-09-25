// @vitest-environment node
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import type { ShareablePayload } from "./share";
import { shareQrDataUrl } from "./share";
import {
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
    const qr = await shareQrDataUrl("https://watchthis.example/");
    expect(qr).not.toBeNull();

    const png = await render({
      card: card(),
      username: "ben",
      qr,
      // Any decodable raster stands in for the TMDB poster; the QR is one.
      poster: qr,
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
    });

    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keepForInspection("share-card-sparse", png);
  }, 30_000);

  // Hyphens are line-break opportunities; underscores are not. A username at
  // the 50-character limit with only underscores, or a title with no spaces,
  // is one unbreakable word that ran past the padding and off the card before
  // the text was allowed to break inside a word. The render not throwing is
  // all this can assert; the PNG is for looking at.
  it("keeps an unbreakable username and unbreakable titles inside the card", async () => {
    const username = "benjamin_paulsen_the_third_of_his_name_12345678901";
    expect(username).toHaveLength(50);

    const unbreakable: ShareablePayload = {
      ...card(),
      topShow: {
        title: "Supercalifragilisticexpialidocious_Pneumonoultramicroscopic",
        posterPath: null,
      },
      // Three lines' worth with no break in it: the two-line clamp holds.
      niche: {
        title:
          "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch".repeat(
            2,
          ),
      },
    };

    const png = await render({
      card: unbreakable,
      username,
      qr: null,
      poster: null,
    });

    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keepForInspection("share-card-unbreakable", png);
  }, 30_000);
});

/** The text children of an element tree, in reading order (styles skipped). */
function textChildren(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(textChildren);
  if (!isValidElement(node)) return [];
  return textChildren((node.props as { children?: unknown }).children);
}

describe("renderShareCard copy", () => {
  it("says hours for most years", () => {
    const text = textChildren(
      renderShareCard({
        card: card(),
        username: "ben",
        qr: null,
        poster: null,
      }),
    ).join(" ");

    expect(text).toContain("ben watched 412 hours");
  });

  it("says 1 hour, singular, for a one-hour year", () => {
    const oneHour = card();
    oneHour.headline.hours = 1;

    const text = textChildren(
      renderShareCard({
        card: oneHour,
        username: "ben",
        qr: null,
        poster: null,
      }),
    ).join(" ");

    expect(text).toContain("ben watched 1 hour 1,208 episodes");
    expect(text).not.toContain("1 hours");
  });
});
