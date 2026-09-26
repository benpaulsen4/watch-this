import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type APIRequestContext, type Browser, type BrowserContext, test } from "@playwright/test";

import { ARTIFACTS_DIR } from "../env/test-env";
import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check, note } from "../support/evidence";
import { oracleAvailableYears, oracleYear } from "../support/oracle";

// The Series Finale API as a client sees it: the list, the payload, the share
// card's status matrix and image, and what the card must not carry. Desktop
// only -- nothing here depends on the viewport. Each persona's requests go
// through a context built from its saved storage state (no UI sign-in).
//
// Order matters within the file: the payload test runs first, so ava's 2025
// may still be ungenerated and its timing is a first generation (the list
// route generates every missing year).

const AVA = "e2e_ava";
const BO = "e2e_bo";
const BAT = "e2e_bat";
const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";
const TIA = "e2e_tia";
const POP12 = "e2e_pop12";

const CARDS_DIR = join(ARTIFACTS_DIR, "cards");
const NO_STORE = "private, no-store";
const GEN_BUDGET_MS = 10_000;

interface ListItem {
  label: string;
  generatedAt: string;
  dismissedAt: string | null;
  headline: { episodes: number; titlesCompleted: number };
}

interface Payload {
  headline: { episodes: number; titlesCompleted: number; percentile: number | null };
  topShow: { title: string } | null;
  crew: { username: string; episodes: number }[];
  compare: { username: string }[];
  thin: boolean;
}

test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "API-level checks: desktop project only");
});

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/** A request context signed in as `username` (or signed out, for null); closed after the test. */
async function requestAs(browser: Browser, username: string | null): Promise<APIRequestContext> {
  const context = await browser.newContext({
    storageState: username === null ? { cookies: [], origins: [] } : storageStatePath(username),
  });
  contexts.push(context);
  return context.request;
}

/** Whether `username` already has a stored snapshot for `label`. */
function snapshotStored(username: string, label: string): boolean {
  return (
    psql(
      `select count(*) from series_finale s join users u on u.id = s.user_id
       where u.username = :'u' and s.period_label = :'p';`,
      { u: username, p: label },
    ) !== "0"
  );
}

/** Width and height from a PNG's IHDR chunk, or null if `bytes` is not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("GET /api/series-finale/2025 as ava: the payload, its crew, and the first generation's time", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const oracle = oracleYear(AVA, "2025");

  const storedBefore = snapshotStored(AVA, "2025");
  const started = performance.now();
  const response = await ava.get("/api/series-finale/2025");
  const ms = Math.round(performance.now() - started);
  const body = (await response.json()) as { payload?: Payload };

  check("api-payload-status", "ava's 2025 payload answers 200", 200, response.status());
  check("api-payload-cache-control", "the payload response is private, no-store", NO_STORE, response.headers()["cache-control"]);
  check("api-payload-present", "the response carries a payload", true, body.payload !== undefined);
  check(
    "api-payload-headline",
    "the payload's headline episodes and titles match the oracle",
    { episodes: oracle.episodes, titlesCompleted: oracle.titlesCompleted, thin: oracle.thin },
    {
      episodes: body.payload?.headline.episodes,
      titlesCompleted: body.payload?.headline.titlesCompleted,
      thin: body.payload?.thin,
    },
  );
  // The oracle's crew includes the viewer (as CrewRanking renders it); the
  // payload's is the collaborators only.
  check(
    "api-payload-crew",
    "the payload's crew usernames are the oracle's (viewer excluded), in order",
    oracle.crew.filter((member) => member.username !== AVA).map((member) => member.username),
    body.payload?.crew.map((member) => member.username),
  );
  note(
    "gen-time",
    "time for GET /api/series-finale/2025 as ava; generated = no snapshot was stored before the call",
    `< ${GEN_BUDGET_MS} ms`,
    { generated: !storedBefore, ms },
    ms < GEN_BUDGET_MS,
  );
});

test("GET /api/series-finale as ava: every available year, newest first, headlines per the oracle", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const response = await ava.get("/api/series-finale");
  const body = (await response.json()) as { periods?: ListItem[] };
  const periods = body.periods ?? [];

  check("api-list-status", "ava's list answers 200", 200, response.status());
  check("api-list-cache-control", "the list response is private, no-store", NO_STORE, response.headers()["cache-control"]);
  check("api-list-periods", "ava's periods are 2025, 2024, 2023, newest first", ["2025", "2024", "2023"], periods.map((p) => p.label));
  check(
    "api-list-periods-oracle",
    "ava's periods are the oracle's available years",
    oracleAvailableYears(AVA),
    periods.map((p) => p.label),
  );
  check(
    "api-list-headlines",
    "each period's headline episodes and titles match the oracle",
    periods.map((p) => ({
      label: p.label,
      episodes: oracleYear(AVA, p.label).episodes,
      titlesCompleted: oracleYear(AVA, p.label).titlesCompleted,
    })),
    periods.map((p) => ({ label: p.label, episodes: p.headline.episodes, titlesCompleted: p.headline.titlesCompleted })),
  );
});

test("the share card's status matrix", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const tia = await requestAs(browser, TIA);
  const signedOut = await requestAs(browser, null);

  const card = await ava.get("/api/series-finale/2025/card");
  const bytes = await card.body();
  check("card-ava-2025-status", "ava's 2025 card answers 200", 200, card.status());
  check("card-ava-2025-type", "ava's 2025 card is image/png", "image/png", card.headers()["content-type"]);
  check("card-ava-2025-size", "ava's 2025 card's PNG IHDR is 1080x1350", { width: 1080, height: 1350 }, pngSize(bytes));
  check("card-ava-2025-cache-control", "ava's 2025 card is private, no-store", NO_STORE, card.headers()["cache-control"]);

  const matrix: { id: string; description: string; request: APIRequestContext; path: string; status: number }[] = [
    { id: "card-ava-2026", description: "ava's 2026 card (year not over)", request: ava, path: "/api/series-finale/2026/card", status: 404 },
    { id: "card-ava-abc", description: "ava's card for a malformed period", request: ava, path: "/api/series-finale/abc/card", status: 400 },
    { id: "card-tia-2025", description: "tia's 2025 card (thin year)", request: tia, path: "/api/series-finale/2025/card", status: 404 },
    { id: "card-signed-out", description: "a signed-out card request", request: signedOut, path: "/api/series-finale/2025/card", status: 401 },
  ];
  for (const row of matrix) {
    const response = await row.request.get(row.path);
    check(`${row.id}-status`, `${row.description} answers ${row.status}`, row.status, response.status());
    check(`${row.id}-cache-control`, `${row.description} is private, no-store`, NO_STORE, response.headers()["cache-control"]);
  }
});

test("pop12's stored 2025 percentile is above 50", async () => {
  const raw = psql(
    `select s.payload->'headline'->>'percentile' from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = '2025';`,
    { u: POP12 },
  );
  const percentile = raw === "" ? null : Number(raw);
  check(
    "api-pop12-percentile",
    `pop12's stored 2025 headline.percentile (${raw || "none"}) is above 50`,
    true,
    percentile !== null && percentile > 50,
  );
});

test("share card PNGs for ava, bo, bat and flo", async ({ browser }) => {
  mkdirSync(CARDS_DIR, { recursive: true });
  const personas = [
    { username: AVA, file: "ava-2025.png" },
    { username: BO, file: "bo-2025.png" },
    { username: BAT, file: "bat-2025.png" },
    { username: FLO, file: "flo-2025.png" },
  ];
  for (const { username, file } of personas) {
    const response = await (await requestAs(browser, username)).get("/api/series-finale/2025/card");
    const bytes = await response.body();
    check(`card-save-${file}`, `${username}'s 2025 card is a 1080x1350 PNG`, { status: 200, size: { width: 1080, height: 1350 } }, {
      status: response.status(),
      size: pngSize(bytes),
    });
    if (response.ok()) writeFileSync(join(CARDS_DIR, file), bytes);
  }

  // flo watches only films: her card has no top-show block to draw.
  const flo = await (await requestAs(browser, FLO)).get("/api/series-finale/2025");
  const floPayload = ((await flo.json()) as { payload?: Payload }).payload;
  check(
    "card-flo-no-top-show",
    "flo's 2025 has no top show (oracle and payload), so her card has no top-show block",
    { oracle: null, payload: null },
    { oracle: oracleYear(FLO, "2025").topShow, payload: floPayload === undefined ? "missing payload" : floPayload.topShow },
  );
});

test("privacy: ava's card carries no collaborator's username as text", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const payload = ((await (await ava.get("/api/series-finale/2025")).json()) as { payload?: Payload }).payload;
  const collaborators = [
    ...new Set([...(payload?.crew ?? []).map((m) => m.username), ...(payload?.compare ?? []).map((p) => p.username)]),
  ].filter((username) => username !== AVA);
  check(
    "privacy-payload-has-collaborators",
    "ava's payload names collaborators (so the card check below is not vacuous)",
    true,
    collaborators.length > 0,
  );

  const png = await (await ava.get("/api/series-finale/2025/card")).body();
  const leaked = collaborators.filter((username) => png.includes(Buffer.from(username, "utf8")));
  check("privacy-card-no-usernames", "no collaborator username appears in ava's card PNG bytes", [], leaked);
});
