import { and, eq, inArray, or } from "drizzle-orm";

import { mapToContent } from "@/lib/tmdb/cache-utils";
import { tmdbClient } from "@/lib/tmdb/client";

import { enrichAllWithContentStatus } from "../content-status/service";
import type { TMDBCache } from "../db";
import {
  ContentType,
  ContentTypeEnum,
  db,
  listItems,
  ListType,
  tmdbCache,
} from "../db";
import { getList } from "./service";

type CacheEquivalent = Omit<TMDBCache, "id" | "createdAt" | "updatedAt">;

function pickTopIdsByCount(tally: Map<number, number>): number[] {
  const sorted = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const take = Math.min(3, sorted.length);
  return sorted.slice(0, take);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }).map(() =>
      worker()
    )
  );

  return results;
}

function getYearCutoffDate(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

async function fetchCacheRowsByIds(
  toFetch: { tmdbId: number; contentType: ContentTypeEnum }[]
): Promise<TMDBCache[]> {
  const movieIds = toFetch
    .filter((c) => c.contentType === ContentType.MOVIE)
    .map((c) => c.tmdbId);
  const tvIds = toFetch
    .filter((c) => c.contentType === ContentType.TV)
    .map((c) => c.tmdbId);

  const conditions = [];
  if (movieIds.length) {
    conditions.push(
      and(
        eq(tmdbCache.contentType, ContentType.MOVIE),
        inArray(tmdbCache.tmdbId, movieIds)
      )
    );
  }
  if (tvIds.length) {
    conditions.push(
      and(
        eq(tmdbCache.contentType, ContentType.TV),
        inArray(tmdbCache.tmdbId, tvIds)
      )
    );
  }

  if (!conditions.length) return [];

  return db
    .select()
    .from(tmdbCache)
    .where(or(...conditions));
}

function scoreCandidate(
  candidate: CacheEquivalent,
  tallies: {
    cast: Map<number, number>;
    genres: Map<number, number>;
    keywords: Map<number, number>;
  }
): number {
  let score = 0;

  for (const genreId of candidate.genreIds ?? []) {
    const count = tallies.genres.get(genreId);
    if (count) score += 3 * count;
  }

  for (const keywordId of candidate.keywordIds ?? []) {
    const count = tallies.keywords.get(keywordId);
    if (count) score += 2 * count;
  }

  for (const castId of candidate.castIds ?? []) {
    const count = tallies.cast.get(castId);
    if (count) score += 1 * count;
  }

  const voteAverage = Number(candidate.voteAverage);
  const voteCount = candidate.voteCount ?? 0;
  const voteWeight = Math.min(1, Math.max(0, voteCount / 100));
  score += voteAverage * voteWeight;

  const popularity = Number(candidate.popularity);
  score += Math.min(5, popularity * 0.01);

  const cutoff = getYearCutoffDate(5);
  if (candidate.releaseDate >= cutoff) score += 5;

  return score;
}

export async function getListRecommendations(userId: string, listId: string) {
  const list = await getList(userId, listId);
  if (list === "notFound") return "notFound" as const;

  const rawListItems = await db
    .select({
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
    })
    .from(listItems)
    .where(eq(listItems.listId, listId));

  if (rawListItems.length === 0) return [];

  const listKeys = new Set(
    rawListItems.map((i) => `${i.contentType}:${i.tmdbId}`)
  );

  const listToFetch = rawListItems.map((i) => ({
    tmdbId: i.tmdbId,
    contentType: i.contentType as ContentTypeEnum,
  }));

  const listRowsWithExtras = await fetchCacheRowsByIds(listToFetch);

  const movieTallies = {
    cast: new Map<number, number>(),
    genres: new Map<number, number>(),
    keywords: new Map<number, number>(),
  };
  const tvTallies = {
    cast: new Map<number, number>(),
    genres: new Map<number, number>(),
    keywords: new Map<number, number>(),
  };

  const inc = (m: Map<number, number>, id: number) =>
    m.set(id, (m.get(id) ?? 0) + 1);

  for (const row of listRowsWithExtras) {
    const contentType = row.contentType as ContentTypeEnum;
    const tallies =
      contentType === ContentType.MOVIE ? movieTallies : tvTallies;

    for (const genreId of row.genreIds ?? []) inc(tallies.genres, genreId);
    for (const keywordId of row.keywordIds ?? [])
      inc(tallies.keywords, keywordId);
    for (const castId of row.castIds ?? []) inc(tallies.cast, castId);
  }

  const allowMovies =
    list.listType === ListType.MOVIE || list.listType === ListType.MIXED;
  const allowTV =
    list.listType === ListType.TV || list.listType === ListType.MIXED;

  const movieTop = {
    cast: pickTopIdsByCount(movieTallies.cast),
    genres: pickTopIdsByCount(movieTallies.genres),
    keywords: pickTopIdsByCount(movieTallies.keywords),
  };
  const tvTop = {
    genres: pickTopIdsByCount(tvTallies.genres),
    keywords: pickTopIdsByCount(tvTallies.keywords),
  };

  console.log("movie top", movieTop);
  console.log("tv top", tvTop);

  const discoverPromises: Promise<
    { tmdbId: number; contentType: ContentTypeEnum }[]
  >[] = [];

  if (allowMovies) {
    if (movieTop.cast.length) {
      Array.from({ length: 4 }).forEach((_, i) => {
        discoverPromises.push(
          tmdbClient
            .discoverMovies({
              page: i + 1,
              sortBy: "popularity.desc",
              withCast: movieTop.cast,
            })
            .then((r) =>
              r.results.map((m) => ({
                tmdbId: m.id,
                contentType: ContentType.MOVIE,
              }))
            )
        );
      });
    }

    if (movieTop.keywords.length) {
      Array.from({ length: 4 }).forEach((_, i) => {
        discoverPromises.push(
          tmdbClient
            .discoverMovies({
              page: i + 1,
              sortBy: "popularity.desc",
              withKeywords: movieTop.keywords,
            })
            .then((r) =>
              r.results.map((m) => ({
                tmdbId: m.id,
                contentType: ContentType.MOVIE,
              }))
            )
        );
      });
    }

    if (movieTop.genres.length) {
      Array.from({ length: 4 }).forEach((_, i) => {
        discoverPromises.push(
          tmdbClient
            .discoverMovies({
              page: i + 1,
              sortBy: "popularity.desc",
              withGenres: movieTop.genres,
            })
            .then((r) =>
              r.results.map((m) => ({
                tmdbId: m.id,
                contentType: ContentType.MOVIE,
              }))
            )
        );
      });
    }
  }

  if (allowTV) {
    if (tvTop.keywords.length) {
      Array.from({ length: 4 }).forEach((_, i) => {
        discoverPromises.push(
          tmdbClient
            .discoverTVShows({
              page: i + 1,
              sortBy: "popularity.desc",
              withKeywords: tvTop.keywords,
            })
            .then((r) =>
              r.results.map((t) => ({
                tmdbId: t.id,
                contentType: ContentType.TV,
              }))
            )
        );
      });
    }

    if (tvTop.genres.length) {
      Array.from({ length: 4 }).forEach((_, i) => {
        discoverPromises.push(
          tmdbClient
            .discoverTVShows({
              page: i + 1,
              sortBy: "popularity.desc",
              withGenres: tvTop.genres,
            })
            .then((r) =>
              r.results.map((t) => ({
                tmdbId: t.id,
                contentType: ContentType.TV,
              }))
            )
        );
      });
    }
  }

  if (!discoverPromises.length) return [];

  const discovered = (await Promise.all(discoverPromises)).flat();
  const discoveredUnique = new Map<
    string,
    { tmdbId: number; contentType: ContentTypeEnum }
  >();
  for (const d of discovered) {
    const key = `${d.contentType}:${d.tmdbId}`;
    if (!discoveredUnique.has(key)) discoveredUnique.set(key, d);
  }

  const candidates = Array.from(discoveredUnique.values()).filter(
    (c) => !listKeys.has(`${c.contentType}:${c.tmdbId}`)
  );

  if (!candidates.length) return [];

  const movieIds = candidates
    .filter((c) => c.contentType === ContentType.MOVIE)
    .map((c) => c.tmdbId);
  const tvIds = candidates
    .filter((c) => c.contentType === ContentType.TV)
    .map((c) => c.tmdbId);

  const [movieDetails, tvDetails] = await Promise.all([
    mapWithConcurrency(movieIds, 3, (id) =>
      tmdbClient.getExtendedMovieDetails(id)
    ),
    mapWithConcurrency(tvIds, 3, (id) =>
      tmdbClient.getExtendedTVShowDetails(id)
    ),
  ]);

  const candidateDetails: CacheEquivalent[] = [];
  movieDetails.forEach((m) => {
    candidateDetails.push({
      tmdbId: m.id,
      contentType: ContentType.MOVIE,
      title: m.title,
      overview: m.overview,
      posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      genreIds: m.genres?.map((g) => g.id) ?? [],
      castIds: m.credits?.cast?.slice(0, 50).map((c) => c.id) ?? [],
      keywordIds: m.keywords?.keywords?.map((k) => k.id) ?? [],
      releaseDate: m.release_date ? new Date(m.release_date) : new Date(0),
      voteAverage: m.vote_average.toString(),
      voteCount: m.vote_count,
      popularity: m.popularity.toString(),
      adult: m.adult,
    });
  });

  tvDetails.forEach((t) => {
    candidateDetails.push({
      tmdbId: t.id,
      contentType: ContentType.TV,
      title: t.name,
      overview: t.overview,
      posterPath: t.poster_path,
      backdropPath: t.backdrop_path,
      genreIds: t.genres?.map((g) => g.id) ?? [],
      castIds: t.aggregate_credits?.cast?.slice(0, 50).map((c) => c.id) ?? [],
      keywordIds: t.keywords?.results?.map((k) => k.id) ?? [],
      releaseDate: t.first_air_date ? new Date(t.first_air_date) : new Date(0),
      voteAverage: t.vote_average.toString(),
      voteCount: t.vote_count,
      popularity: t.popularity.toString(),
      adult: false,
    });
  });

  const scored = candidateDetails
    .map((c) => {
      const tallies =
        c.contentType === ContentType.MOVIE ? movieTallies : tvTallies;
      return {
        content: c,
        score: scoreCandidate(c, tallies),
      };
    })
    .sort((a, b) => b.score - a.score);

  console.log(
    "scored",
    scored.map((s) => ({ title: s.content.title, score: s.score }))
  );

  const take = Math.min(12, Math.max(6, scored.length));
  const top = scored
    .slice(0, take)
    .map((s) => mapToContent(s.content as TMDBCache));

  return enrichAllWithContentStatus(top, userId);
}
