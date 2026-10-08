// The e2e catalogue: real TMDB titles, pinned in catalogue.lock.json so a run
// never depends on what TMDB's search happens to rank first today.
//
// `resolveCatalogue()` fills in any lock entry that has no `tmdbId` yet (an
// exact title match with the same first-air/release year) plus a TV show's
// season shapes, and rewrites the lock. Entries already resolved are returned
// as they are, with no TMDB traffic at all.
//
// Run directly to resolve the lock once. It needs TMDB_API_KEY, so launch it
// with buildE2eEnv() (the key comes from .env.local via readTmdbKey(); it is
// never printed):
//   pnpm e2e:seed --resolve-only   (once Task 4 wires the flag)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tmdbClient, type TMDBTVShowDetails } from "../../../src/lib/tmdb/client";
import { E2E_DIR } from "../env/test-env";

export interface CatalogueEntry {
  key: string;
  title: string;
  year: number;
  type: "tv" | "movie";
  tmdbId: number;
  /** TV only: aired episodes per season (season 0 specials excluded). */
  seasons?: { season: number; episodes: number }[];
}

/** A lock entry before resolution: everything but the TMDB facts. */
type LockEntry = Omit<CatalogueEntry, "tmdbId"> & { tmdbId?: number };

interface LockFile {
  _notes: string[];
  entries: LockEntry[];
}

export const LOCK_PATH = join(E2E_DIR, "seed", "catalogue.lock.json");

/** TMDB's pacing request, as `tools/backfill-runtimes.ts` does. */
const REQUEST_GAP_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readLock(): LockFile {
  return JSON.parse(readFileSync(LOCK_PATH, "utf8")) as LockFile;
}

function writeLock(lock: LockFile): void {
  writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}

function isResolved(entry: LockEntry): entry is CatalogueEntry {
  return entry.tmdbId !== undefined && (entry.type === "movie" || entry.seasons !== undefined);
}

/**
 * The lock as it stands, without touching TMDB. Throws if any entry is still
 * unresolved -- the generator needs every show's season shapes.
 */
export function loadCatalogue(): Map<string, CatalogueEntry> {
  const lock = readLock();
  const catalogue = new Map<string, CatalogueEntry>();
  for (const entry of lock.entries) {
    if (!isResolved(entry)) {
      throw new Error(`catalogue.lock.json: "${entry.key}" is unresolved; run resolveCatalogue() first`);
    }
    if (catalogue.has(entry.key)) throw new Error(`catalogue.lock.json: duplicate key "${entry.key}"`);
    catalogue.set(entry.key, entry);
  }
  return catalogue;
}

const sameText = (a: string | undefined, b: string) =>
  a !== undefined && a.normalize("NFC").trim() === b.normalize("NFC").trim();

const yearOf = (date: string | undefined) => (date ? Number.parseInt(date.slice(0, 4), 10) : NaN);

// Search results carry more than the client's truncated types declare; these
// are the extra fields an exact match is judged on.
interface SearchHit {
  id: number;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
}

async function findExactMatch(entry: LockEntry): Promise<number> {
  const search = entry.type === "tv" ? tmdbClient.searchTVShows : tmdbClient.searchMovies;
  const result = await search.call(tmdbClient, entry.title, 1, entry.year);
  const hits = result.results as SearchHit[];

  const matches = hits.filter((hit) => {
    const names = entry.type === "tv" ? [hit.name, hit.original_name] : [hit.title, hit.original_title];
    const date = entry.type === "tv" ? hit.first_air_date : hit.release_date;
    return names.some((name) => sameText(name, entry.title)) && yearOf(date) === entry.year;
  });

  // Two exact matches do happen (a short sharing a feature's title and year);
  // the one with the most votes is the title anyone means.
  const [match] = matches.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
  if (match === undefined) {
    const seen = hits
      .slice(0, 5)
      .map((hit) => `${hit.id} "${hit.title ?? hit.name}" (${hit.release_date ?? hit.first_air_date ?? "?"})`)
      .join("; ");
    throw new Error(
      `No exact TMDB match for ${entry.type} "${entry.title}" (${entry.year}); ` +
        `top results: ${seen || "none"}. ` +
        "Replace it in catalogue.lock.json with another real title of the same kind and note it in _notes.",
    );
  }
  return match.id;
}

type ShowDetails = TMDBTVShowDetails & {
  seasons?: { season_number: number; episode_count: number }[];
};

/**
 * Aired episodes per season. Seasons after the last aired episode, and that
 * season's unaired tail, are left out, so every (season, episode) the
 * generator produces exists on TMDB and has already aired.
 */
async function fetchSeasons(tmdbId: number): Promise<{ season: number; episodes: number }[]> {
  const details = (await tmdbClient.getTVShowDetails(tmdbId)) as ShowDetails;
  const last = details.last_episode_to_air;
  if (!last) throw new Error(`TMDB tv ${tmdbId} has no aired episodes`);

  return (details.seasons ?? [])
    .filter((season) => season.season_number >= 1 && season.season_number <= last.season_number)
    .map((season) => ({
      season: season.season_number,
      episodes: season.season_number === last.season_number ? last.episode_number : season.episode_count,
    }))
    .filter((season) => season.episodes > 0)
    .sort((a, b) => a.season - b.season);
}

/**
 * Every catalogue entry, resolving (and rewriting into the lock) any that do
 * not yet carry their TMDB id or season shapes. Fails loudly on a title with
 * no exact match rather than guessing.
 */
export async function resolveCatalogue(): Promise<CatalogueEntry[]> {
  const lock = readLock();
  let requests = 0;
  const paced = async <T>(call: () => Promise<T>): Promise<T> => {
    if (requests > 0) await sleep(REQUEST_GAP_MS);
    requests += 1;
    return call();
  };

  for (const entry of lock.entries) {
    if (isResolved(entry)) continue;
    const tmdbId = entry.tmdbId ?? (await paced(() => findExactMatch(entry)));
    entry.tmdbId = tmdbId;
    if (entry.type === "tv") entry.seasons = await paced(() => fetchSeasons(tmdbId));
    // Written after every entry, so a failure part-way keeps what resolved.
    writeLock(lock);
  }

  return Array.from(loadCatalogue().values());
}

if (process.argv[1]?.endsWith("catalogue.ts")) {
  resolveCatalogue()
    .then((entries) => {
      for (const entry of entries) {
        const episodes = entry.seasons?.reduce((sum, season) => sum + season.episodes, 0);
        console.log(
          `${entry.type.padEnd(5)} ${String(entry.tmdbId).padStart(7)}  ${entry.key.padEnd(18)} ${entry.title} (${entry.year})` +
            (episodes === undefined ? "" : `  ${entry.seasons?.length} seasons, ${episodes} episodes`),
        );
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
