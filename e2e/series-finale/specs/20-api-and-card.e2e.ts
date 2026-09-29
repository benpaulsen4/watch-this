import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type APIRequestContext, type Browser, type BrowserContext, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { CARDS_DIR, pngSize } from "../support/cards";
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
// route generates every missing year). "Ungenerated" includes the seeder's
// placeholder row (schema version 0, empty payload), which only carries her
// story completion into the regeneration.

const AVA = "e2e_ava";
const BO = "e2e_bo";
const BAT = "e2e_bat";
const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";
const TIA = "e2e_tia";
const POP12 = "e2e_pop12";

const NO_STORE = "private, no-store";
const GEN_BUDGET_MS = 10_000;

interface ListItem {
  label: string;
  generatedAt: string;
  dismissedAt: string | null;
  storyCompletedAt: string | null;
  headline: { episodes: number; titlesCompleted: number };
}

interface Payload {
  headline: { episodes: number; titlesCompleted: number; percentile: number | null };
  topShow: { title: string } | null;
  crew: { username: string; episodes: number }[];
  compare: { username: string }[];
  thin: boolean;
  months: { month: number; episodes: number }[];
  rhythm: {
    weekdayCounts: number[];
    topWeekday: number | null;
    lateShare: number | null;
    archetype: string | null;
    hourCounts: number[] | null;
    sharedListShare: number | null;
    topGenreName: string | null;
    topGenreShare: number | null;
  };
  period: { timezone: string };
  bigDay: { timeline: { at: string; title: string | null; episode: string }[] | null } | null;
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

/**
 * Whether `username` already has a generated snapshot for `label`: a row with
 * a payload. The seeder's placeholder rows (schema version 0, `{}`) carry only
 * a story completion and are regenerated on first read, so they do not count.
 */
function snapshotStored(username: string, label: string): boolean {
  return (
    psql(
      `select count(*) from series_finale s join users u on u.id = s.user_id
       where u.username = :'u' and s.period_label = :'p' and s.payload ? 'headline';`,
      { u: username, p: label },
    ) !== "0"
  );
}

/** A stored row's schema version and whether its story is marked completed; null without a row. */
function storedRow(username: string, label: string): { schemaVersion: number; storyCompleted: boolean } | null {
  const raw = psql(
    `select s.schema_version || ',' || (s.story_completed_at is not null) from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = :'p';`,
    { u: username, p: label },
  );
  if (raw === "") return null;
  const [version, completed] = raw.split(",");
  return { schemaVersion: Number(version), storyCompleted: completed === "true" };
}

/** The schema version the app writes today, read off a row the seeder generated through it (bo's 2025). */
function currentSchemaVersion(): number | null {
  return storedRow(BO, "2025")?.schemaVersion ?? null;
}

test("GET /api/series-finale/2025 as ava: the payload, its crew, and the first generation's time", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const oracle = oracleYear(AVA, "2025");

  const storedBefore = snapshotStored(AVA, "2025");
  const rowBefore = storedRow(AVA, "2025");
  const started = performance.now();
  const response = await ava.get("/api/series-finale/2025");
  const ms = Math.round(performance.now() - started);
  const body = (await response.json()) as { payload?: Payload; storyCompletedAt?: string | null };

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
  // Every bucket here is a local one: the oracle computes them with
  // Postgres' AT TIME ZONE in ava's Brisbane, the app with Intl.
  const sixPlaces = (value: number | null | undefined) => (value === null || value === undefined ? value : Math.round(value * 1e6) / 1e6);
  check(
    "api-payload-local-buckets",
    "the payload's months (episodes + completed films), weekday counts (Monday first), top weekday and after-21:00 share are the oracle's, in ava's zone",
    {
      months: oracle.months,
      weekdayCounts: oracle.weekdayCounts,
      topWeekday: oracle.topWeekday,
      lateShare: sixPlaces(oracle.lateShare),
    },
    {
      months: body.payload?.months.map((month) => month.episodes),
      weekdayCounts: body.payload?.rhythm.weekdayCounts,
      topWeekday: body.payload?.rhythm.topWeekday,
      lateShare: sixPlaces(body.payload?.rhythm.lateShare),
    },
  );
  // The seeder stored ava's story completion on a placeholder row (schema
  // version 0) so a phone opens her 2025 as a recap; generating over it must
  // keep the completion (the upsert sets payload, version and generated_at
  // only), or every phone spec on her recap would land on the story instead.
  const rowAfter = storedRow(AVA, "2025");
  check(
    "api-payload-story-completion-kept",
    "generating ava's 2025 over the seeder's placeholder row brings it to the current schema version and keeps its story completion, which the payload route returns beside the payload",
    { before: { schemaVersion: 0, storyCompleted: true }, after: { schemaVersion: currentSchemaVersion(), storyCompleted: true }, returned: true },
    { before: rowBefore, after: rowAfter, returned: typeof body.storyCompletedAt === "string" },
  );

  // Payload v4's new fields, against the oracle: the snapshot's zone, the
  // biggest day's timeline (local times, titles, episode codes), the solo
  // ticks by hour, the top genre's title share and the shared-list share.
  const timeline = body.payload?.bigDay?.timeline ?? null;
  const localClock = (at: string) =>
    new Date(at).toLocaleTimeString("en-GB", { timeZone: oracle.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const topGenre = oracle.topGenre;
  check(
    "api-payload-v4-fields",
    "the payload's period.timezone, bigDay.timeline (local HH:MM, title, episode code), rhythm.hourCounts, top genre (name among the oracle's tied top, share by titles) and sharedListShare are the oracle's",
    {
      timezone: oracle.timezone,
      timeline: oracle.bigDayTimeline,
      hourCounts: oracle.hourCounts,
      topGenre: topGenre && { nameIsTop: true, share: sixPlaces(topGenre.share) },
      sharedListShare: sixPlaces(oracle.sharedListShare),
    },
    {
      timezone: body.payload?.period.timezone,
      timeline: timeline && timeline.map((point) => ({ time: localClock(point.at), title: point.title, episode: point.episode })),
      hourCounts: body.payload?.rhythm.hourCounts,
      topGenre: body.payload?.rhythm.topGenreName == null
        ? null
        : { nameIsTop: !!topGenre?.names.includes(body.payload.rhythm.topGenreName), share: sixPlaces(body.payload.rhythm.topGenreShare) },
      sharedListShare: sixPlaces(body.payload?.rhythm.sharedListShare),
    },
  );

  note(
    "gen-time",
    "time for GET /api/series-finale/2025 as ava; generated = no generated snapshot was stored before the call (the seeder's placeholder row does not count)",
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
  check(
    "api-list-story-completed",
    "the list carries each period's storyCompletedAt: set for 2025 and 2024 (the seeder marked them, and generation kept it), null for the thin 2023",
    [
      { label: "2025", storyCompleted: true },
      { label: "2024", storyCompleted: true },
      { label: "2023", storyCompleted: false },
    ],
    periods.map((p) => ({ label: p.label, storyCompleted: typeof p.storyCompletedAt === "string" })),
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

test("privacy: ava's payload names collaborators; her card's bytes are kept for the mutating run", async ({ browser }) => {
  const ava = await requestAs(browser, AVA);
  const payload = ((await (await ava.get("/api/series-finale/2025")).json()) as { payload?: Payload }).payload;
  const collaborators = [
    ...new Set([...(payload?.crew ?? []).map((m) => m.username), ...(payload?.compare ?? []).map((p) => p.username)]),
  ].filter((username) => username !== AVA);
  check(
    "privacy-payload-has-collaborators",
    "ava's payload names collaborators, cy and bo among them (so a card drawn from them would change when cy opts out or bo renames)",
    { any: true, cy: true, bo: true },
    { any: collaborators.length > 0, cy: collaborators.includes("e2e_cy"), bo: collaborators.includes(BO) },
  );

  // The real privacy check is 80-consent-and-rename's
  // privacy-ava-card-unchanged: ava's card must be byte-identical to
  // cards/ava-2025.png (saved above) after cy's opt-out and bo's rename. This
  // byte scan cannot fail -- Satori draws text as paths, so no name is ever in
  // the PNG as text -- and is kept only as a sanity note.
  const png = await (await ava.get("/api/series-finale/2025/card")).body();
  const leaked = collaborators.filter((username) => png.includes(Buffer.from(username, "utf8")));
  note(
    "privacy-card-bytes-sanity",
    "sanity only (cannot fail: the card's text is drawn as paths): no collaborator username appears as text in ava's card PNG bytes",
    [],
    leaked,
    leaked.length === 0,
  );
});
