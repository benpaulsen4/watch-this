import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReactElement } from "react";

import {
  archetypeName,
  formatCount,
  pluralNoun,
} from "@/components/series-finale/format";

import type { ShareablePayload } from "./share";

/**
 * The Series Finale share card: artboard 1g, drawn at full size.
 *
 * Rendered by `ImageResponse` (Satori), not by React DOM, so the usual rules
 * are different here: inline styles only (no Tailwind), flexbox only, and any
 * element with more than one child needs an explicit `display: "flex"`.
 * Every image arrives as a data URL -- a remote `src` that fails to load fails
 * the whole render, so fetching and fallbacks are the caller's job.
 *
 * Built from plain function calls rather than child components so the element
 * this returns is the whole tree, fully expanded: the route's privacy test
 * serialises it and checks that nobody else's name is anywhere in it.
 */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

// Artboard 1g is drawn at half size; every length below is its value doubled.
const PAGE = "#030712";
const WHITE = "#FFFFFF";
const POSTER_WIDTH = 184;
const POSTER_HEIGHT = 276;
const QR_SIZE = 120;
// public/tmdb.svg's viewBox is 273.42 x 35.52; drawn at the QR's width.
const TMDB_LOGO_HEIGHT = Math.round((QR_SIZE * 35.52) / 273.42);
// public/logo-master.svg is 1075 x 300.
const LOGO_HEIGHT = 84;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 1075) / 300);

const white = (alpha: number) => `rgba(255,255,255,${alpha})`;

export interface ShareCardInput {
  card: ShareablePayload;
  /** The viewer's own username -- the only name the card may carry. */
  username: string;
  /** Data URLs, or null to leave that element out (or draw its placeholder). */
  qr: string | null;
  poster: string | null;
  /** Data URLs of public/logo-master.svg and public/tmdb.svg. */
  logo: string;
  tmdbLogo: string;
}

async function publicSvgDataUrl(name: string): Promise<string> {
  // `process.cwd()` + a literal path is the pattern Next's output tracing
  // follows for ImageResponse assets on the Node runtime.
  const svg = await readFile(join(process.cwd(), "public", name));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

/**
 * The two marks every card carries, read from `public/` as data URLs. No
 * fallback: the TMDB mark is the attribution the licence requires on anything
 * showing its titles, so a card without it should fail rather than ship.
 */
export async function loadShareCardLogos(): Promise<
  Pick<ShareCardInput, "logo" | "tmdbLogo">
> {
  const [logo, tmdbLogo] = await Promise.all([
    publicSvgDataUrl("logo-master.svg"),
    publicSvgDataUrl("tmdb.svg"),
  ]);
  return { logo, tmdbLogo };
}

/** Small uppercase label above a value, as the artboard sets them. */
function eyebrow(text: string, fontSize: number, marginBottom: number) {
  return (
    <div
      style={{
        fontSize,
        lineHeight: 1,
        letterSpacing: fontSize * 0.16,
        textTransform: "uppercase",
        color: white(0.45),
        marginBottom,
      }}
    >
      {text}
    </div>
  );
}

function stat(value: number, label: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: 32,
        borderRadius: 24,
        backgroundColor: white(0.07),
        border: `2px solid ${white(0.1)}`,
      }}
    >
      <div style={{ fontSize: 52, lineHeight: 1, fontWeight: 700 }}>
        {formatCount(value)}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 24,
          lineHeight: 1.3,
          color: white(0.55),
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** The real poster, or the artboard's dashed frame with a play glyph. */
function posterFrame(poster: string | null) {
  if (poster) {
    return (
      <img
        src={poster}
        alt=""
        width={POSTER_WIDTH}
        height={POSTER_HEIGHT}
        style={{ borderRadius: 20, objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        borderRadius: 20,
        border: `2px dashed ${white(0.3)}`,
        backgroundColor: white(0.06),
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke={white(0.4)}
        strokeWidth="1.6"
      >
        <polygon points="6 4 20 12 6 20" />
      </svg>
    </div>
  );
}

function titleLine(label: string, title: string) {
  return (
    <div key={label} style={{ display: "flex", flexDirection: "column" }}>
      {eyebrow(label, 22, 12)}
      <div
        style={{
          fontSize: 42,
          lineHeight: 1.2,
          fontWeight: 600,
          color: WHITE,
          // Two lines each keeps both titles inside the poster's height.
          display: "block",
          lineClamp: 2,
        }}
      >
        {title}
      </div>
    </div>
  );
}

function titlesRow(card: ShareablePayload, poster: string | null) {
  const titles = [
    card.topShow ? titleLine("Top show", card.topShow.title) : null,
    card.niche ? titleLine("Most obscure film", card.niche.title) : null,
  ].filter((line) => line !== null);

  if (titles.length === 0) return null;

  return (
    <div style={{ display: "flex", marginTop: 36, gap: 28 }}>
      {/* The poster belongs to the top show; without one there is nothing to frame. */}
      {card.topShow ? posterFrame(poster) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          gap: 28,
        }}
      >
        {titles}
      </div>
    </div>
  );
}

export function renderShareCard({
  card,
  username,
  qr,
  poster,
  logo,
  tmdbLogo,
}: ShareCardInput): ReactElement {
  const hours = card.headline.hours;
  const archetype = archetypeName(card.rhythm);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 80,
        backgroundColor: PAGE,
        backgroundImage:
          "radial-gradient(1120px circle at 50% 16%, rgba(239,68,68,0.34), transparent 58%), radial-gradient(1000px circle at 8% 88%, rgba(168,85,247,0.26), transparent 62%), radial-gradient(960px circle at 96% 66%, rgba(249,115,22,0.22), transparent 60%)",
        color: WHITE,
      }}
    >
      {/* Grain: the artboard's 1px dot on a 3px grid, doubled. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: SHARE_CARD_WIDTH,
          height: SHARE_CARD_HEIGHT,
          opacity: 0.3,
          backgroundImage: `radial-gradient(circle, ${white(0.1)} 2px, transparent 2px)`,
          backgroundSize: "6px 6px",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <img
          src={logo}
          alt="WatchThis"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
        />
        <span
          style={{
            fontSize: 26,
            lineHeight: 1,
            fontWeight: 600,
            letterSpacing: 26 * 0.24,
            color: white(0.55),
          }}
        >
          {card.period.label}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
        <div
          style={{
            fontSize: 26,
            lineHeight: 1,
            fontWeight: 600,
            letterSpacing: 26 * 0.2,
            textTransform: "uppercase",
            color: white(0.5),
            marginBottom: 24,
          }}
        >
          {`${username} watched`}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <span
            style={{
              fontSize: 192,
              lineHeight: 0.84,
              fontWeight: 700,
              letterSpacing: -192 * 0.055,
              color: WHITE,
            }}
          >
            {formatCount(hours)}
          </span>
          <span
            style={{
              fontSize: 60,
              lineHeight: 1,
              fontWeight: 600,
              color: white(0.6),
            }}
          >
            {pluralNoun(hours, "hour")}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 48, gap: 28 }}>
        {stat(
          card.headline.episodes,
          pluralNoun(card.headline.episodes, "episode"),
        )}
        {stat(card.headline.titlesCompleted, "finished")}
        {stat(card.headline.titlesDropped, "abandoned")}
      </div>

      {titlesRow(card, poster)}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 40,
          marginTop: "auto",
          paddingTop: 48,
          borderTop: `2px solid ${white(0.14)}`,
        }}
      >
        {archetype ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {eyebrow("Watching type", 22, 16)}
            <div
              style={{
                fontSize: 54,
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: -54 * 0.02,
                backgroundImage:
                  "linear-gradient(to bottom right, #ed4141, #f9aa79)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {archetype}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 14,
          }}
        >
          {qr ? (
            <img
              src={qr}
              alt=""
              width={QR_SIZE}
              height={QR_SIZE}
              style={{ borderRadius: 16 }}
            />
          ) : null}
          {/* TMDB attribution: the card shows TMDB titles and artwork. */}
          <img
            src={tmdbLogo}
            alt="TMDB"
            width={QR_SIZE}
            height={TMDB_LOGO_HEIGHT}
          />
        </div>
      </div>
    </div>
  );
}
