#!/usr/bin/env tsx
// Writes the e2e cast into the throwaway database, warms the TMDB caches
// through the app's own code, and pre-generates the 2025 percentile cohort.
//
// Run through `pnpm e2e:seed` (run.ts spawns this with buildE2eEnv(), so
// DATABASE_URL is the e2e database and never .env.local's). The signing-in
// personas must already exist (`pnpm e2e:register`). Re-runnable: every
// seeded user's history, statuses, lists and snapshots are cleared first.
//
//   pnpm e2e:seed                 the whole seed
//   pnpm e2e:seed --resolve-only  just resolve catalogue.lock.json
//
// Everything that touches the database is imported dynamically, AFTER the
// DATABASE_URL guard at the top of main(): a static import of src/lib/db
// would build its pool from whatever DATABASE_URL the process happened to
// have before the guard ran. Importing this module runs nothing.
import { assertE2eDatabaseUrl } from "../env/test-env";
import type { CatalogueEntry } from "./catalogue";
import { generate } from "./generate";
import { PERSONAS, type PersonaSpec, UNKNOWN_RUNTIME_EPISODES } from "./personas";

/**
 * Inserted (non-signing) users get default random ids, except two, pinned to
 * sort last by id: the crew keeps a user's 8 most active consenting
 * collaborators (service.ts `mostActiveCollaborators`), and ava's list has 9.
 * The rule no longer looks at ids (finding F3, fixed), and these two pins are
 * what make that observable every run rather than by luck of registration:
 * - jon's all-f id sorts last, and he watched nothing in 2025, so he is the
 *   one left out of ava's crew under either rule (ruling E5).
 * - dee's sorts last among jon's nine collaborators, so the old id rule left
 *   dee -- one of the most active -- out of jon's crew; the activity rule
 *   keeps her, and 40-recap's `crew-cap-rule` checks that it does.
 */
const FIXED_IDS: Record<string, string> = {
  e2e_jon: "ffffffff-ffff-4fff-bfff-ffffffffffff",
  e2e_dee: "fffffffe-ffff-4fff-bfff-ffffffffffff",
};

/**
 * Who gets a 2025 snapshot before any browser opens, in this order: the pops
 * heaviest first so pop12 sees 11 others and stores a percentile (> 50), then
 * everyone else ava's first generation should rank against. Never ava -- her
 * first generation happens in the browser, which is what the specs time --
 * and never neo, who has no completed year.
 */
const PREGENERATE_ORDER = [
  ...Array.from({ length: 12 }, (_, i) => `e2e_pop${String(i + 1).padStart(2, "0")}`),
  "e2e_dee",
  "e2e_eli",
  "e2e_fay",
  "e2e_gus",
  "e2e_hal",
  "e2e_ivy",
  "e2e_jon",
  "e2e_bo",
  "e2e_cy",
  "e2e_bat",
  "e2e_flo_watches_only_films_and_has_a_long_name",
  "e2e_tia",
];
const NOT_PREGENERATED = new Set(["e2e_ava", "e2e_neo"]);

/**
 * The recaps whose story is marked gone through before any browser opens, so
 * a phone opens them as recaps rather than handing on to the story (Task 3's
 * gate): every non-thin year a read-only phone spec opens as a recap (thin
 * years are never gated). Walking these stories to their summary card then
 * posts nothing, so the read-only projects stay read-only -- the summary
 * card marks completion on any device. e2e_cy is deliberately left out: her
 * 2025 is the one the gate is tested on (52-story-gate, read-only: the phone
 * recap hands on to the story, Close goes to the dashboard) and the one the
 * marking flow completes (85-story-completion, mutating, last).
 *
 * ava's two have no snapshot yet (her first generation is the browser's), so
 * for her the seeder stores the completion on a placeholder row at schema
 * version 0 with an empty payload: the app regenerates any row below its
 * current version on first read (service.ts getOrGenerateSnapshot), and the
 * regeneration's upsert leaves `story_completed_at` alone -- which
 * 20-api-and-card checks. The placeholder is never served: only rows at the
 * current version are read back, or counted in anyone's percentile cohort.
 */
const STORY_COMPLETED: { username: string; year: number; placeholder: boolean }[] = [
  { username: "e2e_ava", year: 2025, placeholder: true },
  { username: "e2e_ava", year: 2024, placeholder: true },
  { username: "e2e_bo", year: 2025, placeholder: false },
  { username: "e2e_bat", year: 2025, placeholder: false },
  { username: "e2e_flo_watches_only_films_and_has_a_long_name", year: 2025, placeholder: false },
];

/** TMDB pacing, as `tools/backfill-runtimes.ts` and the catalogue resolver use. */
const REQUEST_GAP_MS = 250;
const INSERT_CHUNK = 1000;
const ZONE_OFFSET_MINUTES: Record<PersonaSpec["timezone"], number> = { UTC: 0, "Australia/Brisbane": 600 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function log(step: string, message: string): void {
  console.log(`[seed] ${step.padEnd(9)} ${message}`);
}

function chunks<T>(items: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Local midnight of `dateKey` in the persona's zone, as the generator dates it. */
function localMidnight(persona: PersonaSpec, dateKey: string): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - ZONE_OFFSET_MINUTES[persona.timezone] * 60_000);
}

async function exitAfterFlush(code: number): Promise<never> {
  // The postgres-js pool holds open handles, so the process must exit
  // explicitly -- after stdout drains, or the summary is what gets cut off.
  await new Promise<void>((resolve) => process.stdout.write("", () => resolve()));
  process.exit(code);
}

async function main(): Promise<void> {
  assertE2eDatabaseUrl(process.env.DATABASE_URL ?? "");
  const { resolveCatalogue } = await import("./catalogue");

  // 1. The catalogue.
  const entries = await resolveCatalogue();
  const catalogue = new Map<string, CatalogueEntry>(entries.map((entry) => [entry.key, entry]));
  log("catalogue", `${entries.length} titles (${entries.filter((e) => e.type === "tv").length} shows)`);
  if (process.argv.includes("--resolve-only")) return;

  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const {
    db,
    episodeWatchStatus,
    listCollaborators,
    listItems,
    lists,
    seriesFinale,
    tmdbCache,
    tmdbEpisodeRuntime,
    tmdbSeasonFetch,
    userContentStatus,
    users,
  } = await import("../../../src/lib/db");
  const { addToCache } = await import("../../../src/lib/tmdb/cache-utils");
  const { normaliseFilmRuntime, tmdbClient } = await import("../../../src/lib/tmdb/client");
  const { ensureSeasonsCached } = await import("../../../src/lib/series-finale/runtime");
  const { getOrGenerateSnapshot } = await import("../../../src/lib/series-finale/service");
  const { calendarYearPeriod } = await import("../../../src/lib/series-finale/periods");

  const entryByKey = (key: string) => {
    const entry = catalogue.get(key);
    if (!entry) throw new Error(`"${key}" is not in the catalogue`);
    return entry;
  };

  // 2. Users: signing-in personas were registered through the UI; the rest
  // are inserted. Then every one is backdated and given its zone and consent.
  const ids = new Map<string, string>();
  let inserted = 0;
  for (const persona of PERSONAS) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, persona.username));
    const fixedId = FIXED_IDS[persona.username];
    if (existing) {
      if (fixedId && existing.id !== fixedId) {
        throw new Error(`${persona.username} exists with id ${existing.id}, not ${fixedId}; reset the e2e db (pnpm e2e:db:reset)`);
      }
      ids.set(persona.username, existing.id);
      continue;
    }
    if (persona.signsIn) {
      throw new Error(`${persona.username} signs in but is not registered; run pnpm e2e:register first`);
    }
    const [row] = await db
      .insert(users)
      .values({ ...(fixedId ? { id: fixedId } : {}), username: persona.username })
      .returning({ id: users.id });
    ids.set(persona.username, row!.id);
    inserted += 1;
  }
  for (const persona of PERSONAS) {
    await db
      .update(users)
      .set({
        createdAt: localMidnight(persona, persona.createdAt),
        timezone: persona.timezone,
        shareStatsWithCollaborators: persona.shareStatsWithCollaborators ?? true,
      })
      .where(eq(users.id, ids.get(persona.username)!));
  }
  log("users", `${PERSONAS.length} personas (${PERSONAS.length - inserted} existing, ${inserted} inserted)`);

  // Clear everything a previous seed (or a mutating spec) left for these users.
  const seededIds = Array.from(ids.values());
  const cleared = {
    episodes: (await db.delete(episodeWatchStatus).where(inArray(episodeWatchStatus.userId, seededIds)).returning({ id: episodeWatchStatus.id })).length,
    statuses: (await db.delete(userContentStatus).where(inArray(userContentStatus.userId, seededIds)).returning({ id: userContentStatus.id })).length,
    snapshots: (await db.delete(seriesFinale).where(inArray(seriesFinale.userId, seededIds)).returning({ id: seriesFinale.id })).length,
    collaborators: (await db.delete(listCollaborators).where(inArray(listCollaborators.userId, seededIds)).returning({ id: listCollaborators.id })).length,
    // Items, collaborators and recommendation caches cascade from the list.
    lists: (await db.delete(lists).where(inArray(lists.ownerId, seededIds)).returning({ id: lists.id })).length,
  };
  log("clear", Object.entries(cleared).map(([name, count]) => `${count} ${name}`).join(", "));

  // 3. History.
  const perUser = new Map<string, { episodes: number; statuses: number }>();
  for (const persona of PERSONAS) {
    const userId = ids.get(persona.username)!;
    const rows = generate(persona, catalogue);
    for (const part of chunks(rows.episodes)) {
      await db.insert(episodeWatchStatus).values(
        part.map((row) => ({
          userId,
          tmdbId: row.tmdbId,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          watched: true,
          watchedAt: row.watchedAt,
        })),
      );
    }
    for (const part of chunks(rows.statuses)) {
      await db.insert(userContentStatus).values(
        part.map((row) => ({
          userId,
          tmdbId: row.tmdbId,
          contentType: row.contentType,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      );
    }
    perUser.set(persona.username, { episodes: rows.episodes.length, statuses: rows.statuses.length });
  }
  const totals = Array.from(perUser.values()).reduce((a, b) => ({ episodes: a.episodes + b.episodes, statuses: a.statuses + b.statuses }));
  log("history", `${totals.episodes} watched episodes, ${totals.statuses} statuses`);

  // 4. Lists.
  let listCount = 0;
  let collaboratorCount = 0;
  let itemCount = 0;
  for (const persona of PERSONAS) {
    for (const spec of persona.lists ?? []) {
      const [list] = await db
        .insert(lists)
        .values({ ownerId: ids.get(persona.username)!, name: spec.name, listType: "mixed" })
        .returning({ id: lists.id });
      const listId = list!.id;
      for (const username of spec.collaborators) {
        const userId = ids.get(username);
        if (!userId) throw new Error(`${persona.username}'s "${spec.name}": ${username} is not a persona`);
        await db.insert(listCollaborators).values({ listId, userId, permissionLevel: "collaborator" });
        collaboratorCount += 1;
      }
      for (const key of spec.items) {
        const entry = entryByKey(key);
        await db.insert(listItems).values({ listId, tmdbId: entry.tmdbId, contentType: entry.type });
        itemCount += 1;
      }
      listCount += 1;
    }
  }
  log("lists", `${listCount} list(s), ${collaboratorCount} collaborators, ${itemCount} items`);

  // 5. Title metadata, through the app's own caching path. Every catalogue
  // entry any persona references, by episode, status or list item.
  const referenced = new Map<string, CatalogueEntry>();
  const byTmdb = new Map(entries.map((entry) => [`${entry.type}:${entry.tmdbId}`, entry]));
  const refer = (type: string, tmdbId: number) => {
    const entry = byTmdb.get(`${type}:${tmdbId}`);
    if (!entry) throw new Error(`${type} ${tmdbId} is referenced but not in the catalogue`);
    referenced.set(entry.key, entry);
  };
  for (const row of await db.selectDistinct({ tmdbId: episodeWatchStatus.tmdbId }).from(episodeWatchStatus).where(inArray(episodeWatchStatus.userId, seededIds))) {
    refer("tv", row.tmdbId);
  }
  for (const row of await db
    .selectDistinct({ tmdbId: userContentStatus.tmdbId, contentType: userContentStatus.contentType })
    .from(userContentStatus)
    .where(inArray(userContentStatus.userId, seededIds))) {
    refer(row.contentType, row.tmdbId);
  }
  for (const row of await db
    .selectDistinct({ tmdbId: listItems.tmdbId, contentType: listItems.contentType })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .where(inArray(lists.ownerId, seededIds))) {
    refer(row.contentType, row.tmdbId);
  }

  const uncachedKeys = new Set(
    PERSONAS.flatMap((persona) => Object.values(persona.years).flatMap((year) => year.shows.filter((show) => show.uncached).map((show) => show.key))),
  );
  let warmed = 0;
  let alreadyCached = 0;
  for (const entry of referenced.values()) {
    const [cached] = await db
      .select({ id: tmdbCache.id })
      .from(tmdbCache)
      .where(and(eq(tmdbCache.tmdbId, entry.tmdbId), eq(tmdbCache.contentType, entry.type)));
    if (cached) {
      alreadyCached += 1;
      continue;
    }
    if (warmed > 0) await sleep(REQUEST_GAP_MS);
    await addToCache(entry.tmdbId, entry.type);
    warmed += 1;
  }
  log("metadata", `${referenced.size} titles referenced: ${warmed} cached via addToCache, ${alreadyCached} already cached`);

  for (const key of uncachedKeys) {
    const entry = entryByKey(key);
    const removed = await db
      .delete(tmdbCache)
      .where(and(eq(tmdbCache.tmdbId, entry.tmdbId), eq(tmdbCache.contentType, entry.type)))
      .returning({ id: tmdbCache.id });
    log("metadata", `removed the tmdb_cache row of ${entry.title} (${entry.type} ${entry.tmdbId}): ${removed.length} row`);
  }

  // 6. Runtimes: every watched season through the app's own fetcher, then the
  // film loop of tools/backfill-runtimes.ts (not importable: it runs main() at
  // load), mirrored here.
  const pairs = await db
    .selectDistinct({ tmdbId: episodeWatchStatus.tmdbId, seasonNumber: episodeWatchStatus.seasonNumber })
    .from(episodeWatchStatus);
  const seasons = await ensureSeasonsCached(pairs);
  log("seasons", `${pairs.length} considered: ${seasons.fetched} fetched, ${seasons.skipped} already cached, ${seasons.failed} failed`);
  if (seasons.failed > 0) throw new Error(`${seasons.failed} season(s) failed to cache; re-run the seed`);

  const films = await db
    .selectDistinct({ tmdbId: userContentStatus.tmdbId })
    .from(userContentStatus)
    .where(eq(userContentStatus.contentType, "movie"));
  const filmCounts = { fetched: 0, alreadyCached: 0, noCacheRow: 0, failed: 0 };
  for (const film of films) {
    const movieRow = and(eq(tmdbCache.tmdbId, film.tmdbId), eq(tmdbCache.contentType, "movie"));
    const cached = await db.select({ runtime: tmdbCache.runtime }).from(tmdbCache).where(movieRow);
    if (cached[0]?.runtime != null) {
      filmCounts.alreadyCached += 1;
      continue;
    }
    if (cached.length === 0) {
      filmCounts.noCacheRow += 1;
      continue;
    }
    try {
      const details = await tmdbClient.getMovieDetails(film.tmdbId);
      await db.update(tmdbCache).set({ runtime: normaliseFilmRuntime(details.runtime), updatedAt: new Date() }).where(movieRow);
      filmCounts.fetched += 1;
    } catch (error) {
      filmCounts.failed += 1;
      console.error(`[seed] film ${film.tmdbId} failed:`, error instanceof Error ? error.message : error);
    }
    await sleep(REQUEST_GAP_MS);
  }
  log(
    "films",
    `${films.length} considered: ${filmCounts.fetched} fetched, ${filmCounts.alreadyCached} already cached, ` +
      `${filmCounts.noCacheRow} with no cache row, ${filmCounts.failed} failed`,
  );
  if (filmCounts.failed > 0 || filmCounts.noCacheRow > 0) throw new Error("film runtimes are incomplete; re-run the seed");

  // 7. Degrade: three of ava's episodes lose their runtime. Their season's
  // tmdb_season_fetch row stays, so generation treats them as "asked, TMDB
  // does not know" and never refetches them.
  for (const episode of UNKNOWN_RUNTIME_EPISODES) {
    const tmdbId = entryByKey(episode.key).tmdbId;
    const updated = await db
      .update(tmdbEpisodeRuntime)
      .set({ runtime: null })
      .where(
        and(
          eq(tmdbEpisodeRuntime.tmdbId, tmdbId),
          eq(tmdbEpisodeRuntime.seasonNumber, episode.season),
          eq(tmdbEpisodeRuntime.episodeNumber, episode.episode),
        ),
      )
      .returning({ id: tmdbEpisodeRuntime.id });
    const [fetchRow] = await db
      .select({ id: tmdbSeasonFetch.id })
      .from(tmdbSeasonFetch)
      .where(and(eq(tmdbSeasonFetch.tmdbId, tmdbId), eq(tmdbSeasonFetch.seasonNumber, episode.season)));
    if (updated.length !== 1 || !fetchRow) {
      throw new Error(`could not null ${episode.key} S${episode.season}E${episode.episode} (runtime rows ${updated.length}, fetch row ${fetchRow ? "yes" : "no"})`);
    }
  }
  log("degrade", `${UNKNOWN_RUNTIME_EPISODES.length} runtimes nulled: ${UNKNOWN_RUNTIME_EPISODES.map((e) => `${e.key} S${e.season}E${e.episode}`).join(", ")}`);

  // 8. The 2025 cohort and collaborators, through the app's own gated path.
  const covered = new Set([...PREGENERATE_ORDER, ...NOT_PREGENERATED]);
  const missing = PERSONAS.filter((p) => !covered.has(p.username)).map((p) => p.username);
  if (missing.length > 0) throw new Error(`PREGENERATE_ORDER does not account for: ${missing.join(", ")}`);

  const period = calendarYearPeriod(2025);
  const snapshots = new Map<string, { thin: boolean; minutes: number; hours: number; percentile: number | null }>();
  for (const username of PREGENERATE_ORDER) {
    const payload = await getOrGenerateSnapshot(ids.get(username)!, period);
    if (!payload) throw new Error(`${username}: no 2025 snapshot (not available?)`);
    const { minutes, hours, percentile } = payload.headline;
    snapshots.set(username, { thin: payload.thin, minutes, hours, percentile });
    log("snapshot", `${username} 2025: thin=${payload.thin} minutes=${minutes} (${hours} h) percentile=${percentile ?? "null"}`);
  }

  // 9. Story completion, for the recaps a read-only phone spec opens (STORY_COMPLETED).
  for (const { username, year, placeholder } of STORY_COMPLETED) {
    const userId = ids.get(username)!;
    const yearPeriod = calendarYearPeriod(year);
    const completedAt = new Date();
    if (placeholder) {
      await db.insert(seriesFinale).values({
        userId,
        periodStart: yearPeriod.start,
        periodEnd: yearPeriod.end,
        periodLabel: yearPeriod.label,
        payload: {},
        schemaVersion: 0,
        storyCompletedAt: completedAt,
      });
    } else {
      const updated = await db
        .update(seriesFinale)
        .set({ storyCompletedAt: completedAt })
        .where(and(eq(seriesFinale.userId, userId), eq(seriesFinale.periodStart, yearPeriod.start), eq(seriesFinale.periodEnd, yearPeriod.end)))
        .returning({ id: seriesFinale.id });
      if (updated.length !== 1) throw new Error(`${username} ${year}: no snapshot to mark story-completed`);
    }
    log("story", `${username} ${year}: story completed${placeholder ? " (on a placeholder row the app regenerates on first read)" : ""}`);
  }

  // 10. Summary.
  const snapshotCount = await db.select({ count: sql<number>`count(*)::int` }).from(seriesFinale).where(inArray(seriesFinale.userId, seededIds));
  console.log("");
  console.log("[seed] summary");
  const header = ["username", "tz", "created", "signs in", "episodes", "statuses", "2025 thin", "2025 hours", "percentile"];
  const table = PERSONAS.map((persona) => {
    const counts = perUser.get(persona.username)!;
    const snapshot = snapshots.get(persona.username);
    return [
      persona.username,
      persona.timezone === "UTC" ? "UTC" : "Brisbane",
      persona.createdAt,
      persona.signsIn ? "yes" : "",
      String(counts.episodes),
      String(counts.statuses),
      snapshot ? String(snapshot.thin) : "-",
      snapshot ? String(snapshot.hours) : "-",
      snapshot ? String(snapshot.percentile ?? "null") : "-",
    ];
  });
  const widths = header.map((title, i) => Math.max(title.length, ...table.map((row) => row[i]!.length)));
  for (const row of [header, ...table]) console.log(`  ${row.map((cell, i) => cell.padEnd(widths[i]!)).join("  ")}`);
  console.log(`  ${snapshotCount[0]?.count ?? 0} snapshots stored (ava's are generated in the browser; her two placeholders included)`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .then(() => exitAfterFlush(0))
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      await exitAfterFlush(1);
    });
}
