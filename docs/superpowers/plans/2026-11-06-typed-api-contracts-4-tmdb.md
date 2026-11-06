# Typed API Contracts: TMDB and Watch Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 7 TMDB routes and 3 watch-provider routes, and their 5 client callers, onto typed contracts. This is layer 4 of 8 in the spec's rollout, stacked on PR #59, and it removes the last places that detect a TMDB 404 by message text.

**Architecture:** `src/lib/tmdb/contract.ts`, `schemas.ts` and `types.ts` define the 10 endpoints. Each route becomes an `authedRoute` call, but keeps its existing shaping logic (merging, sorting, enriching), since these routes have no service layer and adding one is out of scope. `ContentDetailsModal`, `CastTab`, `EpisodeTracker`, `SearchClient` and `StreamingPreferences` call `api()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, and success response shapes do not change.
- Every error body keeps `error` and adds `code`.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine. Total growth of `.next/static/chunks/*.js` stays under 10 kB gzipped against the 507,379-byte baseline.
- Contract files never import `@/lib/db`, services, `next/server`, or auth server modules. Type-only imports from `@/lib/tmdb/client` are fine.
- Routes and components use `import * as tmdbApi from "@/lib/tmdb/contract"`. These routes have no service functions, so contracts are named after what they fetch.
- Keep deliberate leniency: discover drops an invalid `genre`, `year` or `sort_by` instead of rejecting it, and search treats an unknown `type` as `all`. Callers that tolerated a failed lookup keep doing so.
- Detect a TMDB 404 with `isTMDBHttpError(error) && error.status === 404`, never by message text.
- In Vitest commands, pass directory paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,679 tests, plus 26 live checks over HTTP against a production build. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/tmdb/types.ts` (new) | Response types these routes build: `CastMember`, watch provider responses, `WatchProviderRegion` |
| `src/lib/tmdb/schemas.ts`, `contract.ts` (new) | The 10 endpoints |
| `src/lib/tmdb/client.ts` | `TMDBContentWatchProviders` gains `ads`, which TMDB returns and the modal already shows |
| `src/app/api/tmdb/**/route.ts`, `src/app/api/watch/**/route.ts` | Rewritten on `authedRoute` |
| `CastTab.tsx`, `ContentDetailsModal.tsx`, `EpisodeTracker.tsx` | Content lookups call `api()` |
| `SearchClient.tsx` | Search and discover call `api()`; the dead "Title" sort is removed |
| `StreamingPreferences.tsx` | Regions and providers call `api()` |
| `docs/api/openapi.yaml` | Bounds, defaults, the discover `sort_by` values, and discover's 400 |

## Behaviour changes, all intended

- **TMDB 404s:** `/api/tmdb/details` and `/api/tmdb/episodes/[id]` detect a 404 from the error's status. An unrelated error that mentions "404" now returns 500 instead of "not found".
- **Details failures:** a non-TMDB failure on `/api/tmdb/details` returns `Get content details failed` instead of `Failed to get content details`.
- **Episode numbers:** `/api/tmdb/episodes/[id]` accepts `episode=0`, because some seasons number an episode 0. It used to reject it.
- **IDs:** malformed IDs are rejected consistently. `Number()` used to accept `1e3` and negative IDs for watch content, and `parseInt` read `550abc` as 550.
- **Messages:** a missing `id`, `region` or `season` gets the field's invalid message instead of a "required" one.
- **Search sort:** the search page's "Title" sort is removed. The route never accepted `title.asc` and silently fell back to popularity, so the option never did anything.
- **Callers:** `CastTab`, the details panel and the provider lists still show their empty state when a lookup fails. They now retry once for a server error, as every query does. `EpisodeTracker` skips a season only when TMDB reports it doesn't exist. Any other failure for a season, including a rate limit or an unreachable server, now shows the tracker's error and retry state instead of silently dropping that season.
- **Details rate limit:** `/api/tmdb/details` returns 429 `rateLimited` for a TMDB rate limit instead of 503, matching every other route, so the details query no longer retries it.

---

### Task 1: Content lookups — details, credits, genres, episodes

**Files:**
- Create: `src/lib/tmdb/types.ts`, `src/lib/tmdb/schemas.ts`, `src/lib/tmdb/contract.ts`
- Modify: `src/app/api/tmdb/details/route.ts`, `src/app/api/tmdb/credits/route.ts`, `src/app/api/tmdb/genres/route.ts`, `src/app/api/tmdb/episodes/[id]/route.ts`, `src/components/content/CastTab.tsx`, `src/components/content/ContentDetailsModal.tsx`, `src/components/content/EpisodeTracker.tsx`
- Test: `src/app/api/tmdb/details/route.test.ts`

**Interfaces:**
- Consumes: from earlier layers, `defineContract`, `schemas`, `type`, `q`, `authedRoute`, `api`, `isApiError`, `routeContext()` (`@/test/route-context`), `tmdbError()` (`@/test/tmdb-error`).
- Produces: contracts `getContentDetails`, `getCredits`, `getGenres`, `getSeasonOrEpisode` with their `*Schemas`, the module-private `contentType` schema, and `CastMember` plus three watch types in `types.ts` for Task 3.

`types.ts` already declares the watch-provider types Task 3 uses, so this task creates it whole.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/tmdb/details/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";
import { tmdbError } from "@/test/tmdb-error";

const tmdb = {
  getMovieCredits: vi.fn(),
  getMovieDetails: vi.fn(),
  getMovieGenres: vi.fn(),
  getTVAggregateCredits: vi.fn(),
  getTVEpisodeDetails: vi.fn(),
  getTVGenres: vi.fn(),
  getTVSeasonDetails: vi.fn(),
  getTVShowDetails: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

const details = await import("./route");
const credits = await import("../credits/route");
const genres = await import("../genres/route");
const episodes = await import("../episodes/[id]/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/tmdb/${path}`, { headers });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/tmdb/details", () => {
  it("returns movie details", async () => {
    tmdb.getMovieDetails.mockResolvedValue({ id: 550, title: "Fight Club" });
    const response = await details.GET(get("details?type=movie&id=550"));
    expect(response.status).toBe(200);
    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(550);
  });

  it("maps a TMDB 404 to notFound", async () => {
    tmdb.getTVShowDetails.mockRejectedValue(tmdbError(404));
    const response = await details.GET(get("details?type=tv&id=9"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Content not found",
      code: "notFound",
    });
  });

  it("maps other TMDB failures to 503", async () => {
    tmdb.getTVShowDetails.mockRejectedValue(tmdbError(500));
    const response = await details.GET(get("details?type=tv&id=9"));
    expect(response.status).toBe(503);
  });

  it("does not read an unrelated error that mentions 404 as not found", async () => {
    tmdb.getMovieDetails.mockRejectedValue(new Error("pool 404 timeout"));
    const response = await details.GET(get("details?type=movie&id=9"));
    expect(response.status).toBe(500);
  });

  it.each([
    ["details?type=movie&id=550abc", "Invalid content ID"],
    ["details?type=book&id=550", 'Type must be either "movie" or "tv"'],
  ])("rejects %s", async (path, error) => {
    const response = await details.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/tmdb/credits", () => {
  it("trims TV cast to the first role's character", async () => {
    tmdb.getTVAggregateCredits.mockResolvedValue({
      cast: [
        { id: 1, name: "A", profile_path: null, roles: [{ character: "X" }] },
        { id: 2, name: "B", profile_path: "/b.jpg", roles: [] },
      ],
    });
    const response = await credits.GET(get("credits?type=tv&id=1399"));
    await expect(response.json()).resolves.toEqual({
      cast: [
        { id: 1, name: "A", character: "X", profile_path: null },
        { id: 2, name: "B", character: null, profile_path: "/b.jpg" },
      ],
    });
  });

  it("rejects a missing id", async () => {
    const response = await credits.GET(get("credits?type=movie"));
    expect(response.status).toBe(400);
    expect(tmdb.getMovieCredits).not.toHaveBeenCalled();
  });
});

describe("GET /api/tmdb/genres", () => {
  it("merges, de-duplicates and sorts both lists by default", async () => {
    tmdb.getMovieGenres.mockResolvedValue({
      genres: [
        { id: 2, name: "Drama" },
        { id: 1, name: "Action" },
      ],
    });
    tmdb.getTVGenres.mockResolvedValue({ genres: [{ id: 2, name: "Drama" }] });
    const response = await genres.GET(get("genres"));
    await expect(response.json()).resolves.toEqual({
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Drama" },
      ],
    });
  });

  it("rejects an unknown type", async () => {
    const response = await genres.GET(get("genres?type=books"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/tmdb/episodes/[id]", () => {
  const getEpisodes = (search: string, id = "1399") =>
    episodes.GET(get(`episodes/${id}?${search}`), routeContext({ id }));

  it("returns a season, including season 0", async () => {
    tmdb.getTVSeasonDetails.mockResolvedValue({ episodes: [] });
    const response = await getEpisodes("season=0");
    await expect(response.json()).resolves.toEqual({
      season: { episodes: [] },
    });
    expect(tmdb.getTVSeasonDetails).toHaveBeenCalledWith(1399, 0);
  });

  it("returns one episode, including episode 0", async () => {
    tmdb.getTVEpisodeDetails.mockResolvedValue({ name: "Pilot" });
    const response = await getEpisodes("season=1&episode=0");
    await expect(response.json()).resolves.toEqual({
      episode: { name: "Pilot" },
    });
    expect(tmdb.getTVEpisodeDetails).toHaveBeenCalledWith(1399, 1, 0);
  });

  it.each([
    ["getTVSeasonDetails", "season=9", "Season not found", "seasonNotFound"],
    [
      "getTVEpisodeDetails",
      "season=1&episode=99",
      "Episode not found",
      "episodeNotFound",
    ],
  ] as const)(
    "maps a TMDB 404 from %s",
    async (method, search, error, code) => {
      tmdb[method].mockRejectedValue(tmdbError(404));
      const response = await getEpisodes(search);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error, code });
    },
  );

  it("rethrows an unrelated error that mentions 404", async () => {
    tmdb.getTVSeasonDetails.mockRejectedValue(new Error("socket 404"));
    const response = await getEpisodes("season=1");
    expect(response.status).toBe(500);
  });

  it.each([
    ["season=1", "abc", "Invalid TV show ID"],
    ["", "1399", "Invalid season number"],
    ["season=-1", "1399", "Invalid season number"],
  ])("rejects %s for id %s", async (search, id, error) => {
    const response = await getEpisodes(search, id);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/tmdb`
Expected: FAIL. Bodies lack `code`, the 404 tests get the old text-matching behaviour, `episode=0` and `550abc` aren't handled as the tests expect, and the episodes route ignores the route context.

- [ ] **Step 3: Write the types, schemas and contract**

Create `src/lib/tmdb/types.ts`:

```ts
import type { TMDBContentWatchProviders, TMDBWatchProvider } from "./client";

/** One cast member, trimmed to what the cast tab shows. */
export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
}

export interface ContentWatchProvidersResponse {
  region: string;
  providers: TMDBContentWatchProviders["results"][string] | null;
}

export interface RegionWatchProvidersResponse {
  results: TMDBWatchProvider[];
}

export interface WatchProviderRegion {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}
```

Create `src/lib/tmdb/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";

const CONTENT_TYPE_INVALID = 'Type must be either "movie" or "tv"';

const contentType = z.enum(["movie", "tv"], CONTENT_TYPE_INVALID);

export const getContentDetailsSchemas = {
  query: z.object({
    id: q.int({ min: 1, message: "Invalid content ID" }),
    type: contentType,
  }),
};

export const getCreditsSchemas = {
  query: z.object({
    id: q.int({ min: 1, message: "Invalid id" }),
    type: z.enum(["movie", "tv"], "Invalid type"),
  }),
};

export const getGenresSchemas = {
  query: z.object({
    type: z
      .enum(["movie", "tv", "all"], 'Type must be "movie", "tv", or "all"')
      .optional(),
  }),
};

// Season 0 holds specials, and some seasons number an episode 0.
export const getSeasonOrEpisodeSchemas = {
  params: z.object({ id: q.int({ min: 1, message: "Invalid TV show ID" }) }),
  query: z.object({
    season: q.int({ min: 0, message: "Invalid season number" }),
    episode: q.int({ min: 0, message: "Invalid episode number" }).optional(),
  }),
};
```

Create `src/lib/tmdb/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  TMDBEpisode,
  TMDBGenre,
  TMDBMovieDetails,
  TMDBSeason,
  TMDBTVShowDetails,
} from "./client";
import type {
  getContentDetailsSchemas,
  getCreditsSchemas,
  getGenresSchemas,
  getSeasonOrEpisodeSchemas,
} from "./schemas";
import type { CastMember } from "./types";

export const getContentDetails = defineContract({
  method: "GET",
  path: "/api/tmdb/details",
  label: "Get content details",
  schemas: schemas<typeof getContentDetailsSchemas>(),
  response: type<TMDBMovieDetails | TMDBTVShowDetails>(),
  errors: { notFound: { status: 404, message: "Content not found" } },
});

export const getCredits = defineContract({
  method: "GET",
  path: "/api/tmdb/credits",
  label: "tmdb/credits",
  schemas: schemas<typeof getCreditsSchemas>(),
  response: type<{ cast: CastMember[] }>(),
});

export const getGenres = defineContract({
  method: "GET",
  path: "/api/tmdb/genres",
  label: "TMDB genres",
  schemas: schemas<typeof getGenresSchemas>(),
  response: type<{ genres: TMDBGenre[] }>(),
});

export const getSeasonOrEpisode = defineContract({
  method: "GET",
  path: "/api/tmdb/episodes/[id]",
  label: "Get TV episodes",
  schemas: schemas<typeof getSeasonOrEpisodeSchemas>(),
  response: type<{ episode: TMDBEpisode } | { season: TMDBSeason }>(),
  errors: {
    episodeNotFound: { status: 404, message: "Episode not found" },
    seasonNotFound: { status: 404, message: "Season not found" },
  },
});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/tmdb/details/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { isTMDBHttpError, tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getContentDetailsSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/details - Movie or TV show details
export const GET = authedRoute(
  tmdbApi.getContentDetails,
  getContentDetailsSchemas,
  async ({ query }) => {
    try {
      return query.type === "movie"
        ? await tmdbClient.getMovieDetails(query.id)
        : await tmdbClient.getTVShowDetails(query.id);
    } catch (error) {
      if (isTMDBHttpError(error) && error.status === 404) return "notFound";
      throw error;
    }
  },
);
```

Replace `src/app/api/tmdb/credits/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import {
  tmdbClient,
  TMDBMovieCastMember,
  TMDBTVAggregateCastMember,
} from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getCreditsSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/credits - Cast for a movie or TV show
export const GET = authedRoute(
  tmdbApi.getCredits,
  getCreditsSchemas,
  async ({ query }) => {
    if (query.type === "movie") {
      const credits = await tmdbClient.getMovieCredits(query.id);
      const cast = (credits.cast as TMDBMovieCastMember[]).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
      }));
      return { cast };
    }

    const credits = await tmdbClient.getTVAggregateCredits(query.id);
    const cast = (credits.cast as TMDBTVAggregateCastMember[]).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.roles?.[0]?.character ?? null,
      profile_path: c.profile_path,
    }));
    return { cast };
  },
);
```

Replace `src/app/api/tmdb/genres/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getGenresSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/genres - Movie, TV, or combined genres
export const GET = authedRoute(
  tmdbApi.getGenres,
  getGenresSchemas,
  async ({ query }) => {
    if (query.type === "movie") return tmdbClient.getMovieGenres();
    if (query.type === "tv") return tmdbClient.getTVGenres();

    // Get both movie and TV genres
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbClient.getMovieGenres(),
      tmdbClient.getTVGenres(),
    ]);

    // Combine and deduplicate genres
    const allGenres = [...movieGenres.genres, ...tvGenres.genres];
    const uniqueGenres = allGenres.filter(
      (genre, index, self) =>
        index === self.findIndex((g) => g.id === genre.id),
    );

    return {
      genres: uniqueGenres.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
);
```

Replace `src/app/api/tmdb/episodes/[id]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { isTMDBHttpError, tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getSeasonOrEpisodeSchemas } from "@/lib/tmdb/schemas";

const isNotFound = (error: unknown) =>
  isTMDBHttpError(error) && error.status === 404;

// GET /api/tmdb/episodes/[id] - A season with its episodes, or one episode
// when `episode` is given
export const GET = authedRoute(
  tmdbApi.getSeasonOrEpisode,
  getSeasonOrEpisodeSchemas,
  async ({ params, query }) => {
    if (query.episode !== undefined) {
      try {
        return {
          episode: await tmdbClient.getTVEpisodeDetails(
            params.id,
            query.season,
            query.episode,
          ),
        };
      } catch (error) {
        if (isNotFound(error)) return "episodeNotFound";
        throw error;
      }
    }

    try {
      return {
        season: await tmdbClient.getTVSeasonDetails(params.id, query.season),
      };
    } catch (error) {
      if (isNotFound(error)) return "seasonNotFound";
      throw error;
    }
  },
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/content/CastTab.tsx`:

```diff
diff --git a/src/components/content/CastTab.tsx b/src/components/content/CastTab.tsx
index 849233e..6a0da3c 100644
--- a/src/components/content/CastTab.tsx
+++ b/src/components/content/CastTab.tsx
@@ -5,7 +5,9 @@ import { ChevronLeft, ChevronRight, User } from "lucide-react";
 import Image from "next/image";
 import { useState } from "react";
 
+import { api } from "@/lib/api/client";
 import { getImageUrl } from "@/lib/tmdb/client";
+import * as tmdbApi from "@/lib/tmdb/contract";
 
 import { Button } from "../ui/Button";
 import { LoadingSpinner } from "../ui/LoadingSpinner";
@@ -19,21 +21,15 @@ export function CastTab({ contentType, contentId }: CastTabProps) {
   const [page, setPage] = useState<number>(1);
   const PER_PAGE = 12;
 
-  const castQuery = useQuery<{
-    cast: {
-      id: number;
-      name: string;
-      character: string | null;
-      profile_path: string | null;
-    }[];
-  }>({
+  // A failed lookup shows the empty state, as a missing cast does.
+  const castQuery = useQuery({
     queryKey: ["tmdb", "credits", contentType, contentId],
-    queryFn: async () => {
-      const res = await fetch(
-        `/api/tmdb/credits?type=${contentType}&id=${contentId}`,
-      );
-      return res.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        tmdbApi.getCredits,
+        { query: { type: contentType, id: contentId } },
+        { signal },
+      ),
   });
 
   const castList = castQuery.data?.cast || [];
```

Apply to `src/components/content/ContentDetailsModal.tsx`:

```diff
diff --git a/src/components/content/ContentDetailsModal.tsx b/src/components/content/ContentDetailsModal.tsx
index 4e9a448..83b774e 100644
--- a/src/components/content/ContentDetailsModal.tsx
+++ b/src/components/content/ContentDetailsModal.tsx
@@ -26,6 +26,7 @@ import type {
   UserStreamingProvider,
 } from "@/lib/tmdb/client";
 import { getImageUrl } from "@/lib/tmdb/client";
+import * as tmdbApi from "@/lib/tmdb/contract";
 import { cn, formatVoteAverage } from "@/lib/utils";
 
 import { useStreamingPreferences } from "../providers/AuthProvider";
@@ -67,15 +68,15 @@ export function ContentDetailsModal({
   const year = new Date(content.releaseDate).getFullYear();
 
   // Type-specific data from detailed content
-  const detailsQuery = useQuery<TMDBMovieDetails | TMDBTVShowDetails>({
+  const detailsQuery = useQuery({
     queryKey: ["tmdb", "details", content.contentType, content.tmdbId],
     enabled: isOpen,
-    queryFn: async () => {
-      const res = await fetch(
-        `/api/tmdb/details?type=${content.contentType}&id=${content.tmdbId}`,
-      );
-      return res.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        tmdbApi.getContentDetails,
+        { query: { type: content.contentType, id: content.tmdbId } },
+        { signal },
+      ),
   });
   const detailedContent: TMDBMovieDetails | TMDBTVShowDetails | null =
     detailsQuery.data ?? null;
```

Apply to `src/components/content/EpisodeTracker.tsx`:

```diff
diff --git a/src/components/content/EpisodeTracker.tsx b/src/components/content/EpisodeTracker.tsx
index 4c6f257..49dc419 100644
--- a/src/components/content/EpisodeTracker.tsx
+++ b/src/components/content/EpisodeTracker.tsx
@@ -12,11 +12,12 @@ import {
 } from "lucide-react";
 import { useState } from "react";
 
-import { api } from "@/lib/api/client";
+import { api, isApiError } from "@/lib/api/client";
 import { WatchStatusEnum } from "@/lib/db";
 import * as episodesApi from "@/lib/episodes/contract";
 import type { EpisodeStatusItem } from "@/lib/episodes/types";
 import type { TMDBSeason, TMDBTVShowDetails } from "@/lib/tmdb/client";
+import * as tmdbApi from "@/lib/tmdb/contract";
 import { cn } from "@/lib/utils";
 
 import { Button } from "../ui/Button";
@@ -66,8 +67,10 @@ export function EpisodeTracker({
         { query: { tmdbId: tvShowId } },
       );
 
+      // A season TMDB cannot return is left out rather than failing the
+      // whole tracker. Only an unreachable server fails it.
       const seasonPromises: Array<
-        Promise<{ seasonNumber: number; season: TMDBSeason }>
+        Promise<{ seasonNumber: number; season: TMDBSeason } | null>
       > = [];
       for (
         let seasonNum = 1;
@@ -75,15 +78,30 @@ export function EpisodeTracker({
         seasonNum++
       ) {
         seasonPromises.push(
-          fetch(`/api/tmdb/episodes/${tvShowId}?season=${seasonNum}`)
-            .then((res) => res.json())
-            .then((data) => ({ seasonNumber: seasonNum, ...data })),
+          api(tmdbApi.getSeasonOrEpisode, {
+            params: { id: tvShowId },
+            query: { season: seasonNum },
+          })
+            .then((data) =>
+              "season" in data
+                ? { seasonNumber: seasonNum, season: data.season }
+                : null,
+            )
+            .catch((error: unknown) => {
+              if (
+                isApiError(error, tmdbApi.getSeasonOrEpisode) &&
+                error.code !== "network"
+              ) {
+                return null;
+              }
+              throw error;
+            }),
         );
       }
 
       const seasonResults = await Promise.all(seasonPromises);
       const seasonsData: SeasonData[] = seasonResults
-        .filter((result) => result.season)
+        .filter((result) => result !== null)
         .map((result) => ({
           season: result.season,
           watchStatuses: watchStatuses.filter(
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/tmdb src/components/content src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tmdb src/app/api/tmdb src/components/content/CastTab.tsx src/components/content/ContentDetailsModal.tsx src/components/content/EpisodeTracker.tsx
git commit -m "refactor: move TMDB content lookups onto typed contracts"
```

---

### Task 2: Search, discover and trending

**Files:**
- Modify: `src/lib/tmdb/schemas.ts`, `src/lib/tmdb/contract.ts`, `src/app/api/tmdb/search/route.ts`, `src/app/api/tmdb/discover/route.ts`, `src/app/api/tmdb/trending/route.ts`, `src/components/search/SearchClient.tsx`
- Test: `src/app/api/tmdb/search/route.test.ts`

**Interfaces:**
- Consumes: `contentType` (Task 1, `schemas.ts`), the contract file from Task 1.
- Produces: contracts `discoverContent`, `searchContent`, `getTrending` and their `*Schemas`.

The year bound uses `refine`, so the "five years from now" limit is checked on each request rather than fixed when the server starts. These routes no longer use `validatePagination`, but it stays in `api-middleware.ts` until the last layer removes it.

The `SearchClient` diff also removes the "Title" sort option. The route never accepted `title.asc`, so typing the call exposed it. The diff edits the `SortBy` type and the options list.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/tmdb/search/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const tmdb = {
  discoverMovies: vi.fn(),
  discoverTVShows: vi.fn(),
  getTrending: vi.fn(),
  searchMovies: vi.fn(),
  searchMulti: vi.fn(),
  searchTVShows: vi.fn(),
};
const mapAllWithContentStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

vi.mock("@/lib/content-status/service", () => ({
  mapAllWithContentStatus: (...args: unknown[]) =>
    mapAllWithContentStatus(...args),
}));

const search = await import("./route");
const discover = await import("../discover/route");
const trending = await import("../trending/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/tmdb/${path}`, { headers });

const page = (results: unknown[] = []) => ({
  page: 1,
  results,
  total_pages: 2,
  total_results: 30,
});

describe("GET /api/tmdb/search", () => {
  it("searches everything by default and enriches results", async () => {
    tmdb.searchMulti.mockResolvedValue(page([{ id: 1 }]));
    mapAllWithContentStatus.mockResolvedValue([{ tmdbId: 1 }]);
    const response = await search.GET(get("search?q=%20dune%20"));
    expect(tmdb.searchMulti).toHaveBeenCalledWith("dune", 1);
    expect(mapAllWithContentStatus).toHaveBeenCalledWith([{ id: 1 }], "user-1");
    await expect(response.json()).resolves.toEqual({
      page: 1,
      results: [{ tmdbId: 1 }],
      totalPages: 2,
      totalResults: 30,
    });
  });

  it("passes year and page to a typed search", async () => {
    tmdb.searchMovies.mockResolvedValue(page());
    await search.GET(get("search?q=dune&type=movie&year=2021&page=2"));
    expect(tmdb.searchMovies).toHaveBeenCalledWith("dune", 2, 2021);
    expect(mapAllWithContentStatus).not.toHaveBeenCalled();
  });

  it("treats an unknown type as all", async () => {
    tmdb.searchMulti.mockResolvedValue(page());
    const response = await search.GET(get("search?q=dune&type=books"));
    expect(response.status).toBe(200);
    expect(tmdb.searchMulti).toHaveBeenCalled();
  });

  it.each([
    ["search?q=%20%20", "Search query is required"],
    ["search?q=dune&year=2021", "Year cannot be used with multi search"],
    ["search?q=dune&type=tv&year=1899", "Year must be between 1900 and next 5 years"],
    ["search?q=dune&type=tv&year=3000", "Year must be between 1900 and next 5 years"],
    ["search?q=dune&page=0", "Page must be between 1 and 1000"],
    ["search?q=dune&page=1001", "Page must be between 1 and 1000"],
  ])("rejects %s", async (path, error) => {
    const response = await search.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/tmdb/discover", () => {
  it("passes valid filters through", async () => {
    tmdb.discoverMovies.mockResolvedValue(page());
    await discover.GET(
      get("discover?type=movie&genre=18&year=1999&sort_by=vote_average.desc&page=3"),
    );
    expect(tmdb.discoverMovies).toHaveBeenCalledWith({
      page: 3,
      genre: 18,
      year: 1999,
      sortBy: "vote_average.desc",
    });
  });

  it("drops invalid filters instead of rejecting them", async () => {
    tmdb.discoverTVShows.mockResolvedValue(page());
    const response = await discover.GET(
      get("discover?type=tv&genre=abc&year=1800&sort_by=title.asc"),
    );
    expect(response.status).toBe(200);
    expect(tmdb.discoverTVShows).toHaveBeenCalledWith({
      page: 1,
      genre: undefined,
      year: undefined,
      sortBy: undefined,
    });
  });

  it("merges both types by popularity when no type is given", async () => {
    tmdb.discoverMovies.mockResolvedValue({
      ...page([{ id: 1, popularity: 1 }]),
      total_pages: 2,
    });
    tmdb.discoverTVShows.mockResolvedValue({
      ...page([{ id: 2, popularity: 5 }]),
      total_pages: 3,
    });
    mapAllWithContentStatus.mockImplementation(async (items) => items);
    const response = await discover.GET(get("discover"));
    const body = await response.json();
    expect(body.results.map((r: { id: number }) => r.id)).toEqual([2, 1]);
    expect(body.totalPages).toBe(5);
  });

  it("still rejects an unknown type", async () => {
    const response = await discover.GET(get("discover?type=books"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/tmdb/trending", () => {
  it("defaults to all and week", async () => {
    tmdb.getTrending.mockResolvedValue(page());
    await trending.GET(get("trending"));
    expect(tmdb.getTrending).toHaveBeenCalledWith("all", "week");
  });

  it.each([
    ["trending?media_type=books", 'Media type must be "all", "movie", or "tv"'],
    ["trending?time_window=month", 'Time window must be "day" or "week"'],
  ])("rejects %s", async (path, error) => {
    const response = await trending.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/tmdb/search`
Expected: FAIL. Bodies lack `code`, discover's call arguments differ, since it used to omit invalid keys rather than pass `undefined`, and the search error assertions don't all match yet.

- [ ] **Step 3: Extend the schemas and contract**

Apply to `src/lib/tmdb/schemas.ts`:

```diff
diff --git a/src/lib/tmdb/schemas.ts b/src/lib/tmdb/schemas.ts
index 1bbd6fd..f02a5c8 100644
--- a/src/lib/tmdb/schemas.ts
+++ b/src/lib/tmdb/schemas.ts
@@ -36,3 +36,70 @@ export const getSeasonOrEpisodeSchemas = {
     episode: q.int({ min: 0, message: "Invalid episode number" }).optional(),
   }),
 };
+
+const PAGE_INVALID = "Page must be between 1 and 1000";
+const YEAR_INVALID = "Year must be between 1900 and next 5 years";
+
+const page = q.int({ min: 1, max: 1000, message: PAGE_INVALID }).default(1);
+
+/** Checked on each request, so the upper bound moves with the calendar. */
+const year = q
+  .int({ min: 1900, message: YEAR_INVALID })
+  .refine((value) => value <= new Date().getFullYear() + 5, YEAR_INVALID);
+
+const DISCOVER_SORTS = [
+  "popularity.desc",
+  "popularity.asc",
+  "vote_average.desc",
+  "vote_average.asc",
+  "release_date.desc",
+  "release_date.asc",
+  "first_air_date.desc",
+  "first_air_date.asc",
+] as const;
+
+// Deliberately forgiving: a genre, year or sort this route can't use is
+// dropped rather than rejected, so the search page's other filters still apply.
+export const discoverContentSchemas = {
+  query: z.object({
+    type: contentType.optional(),
+    page,
+    genre: q.int({ min: 1 }).optional().catch(undefined),
+    year: year.optional().catch(undefined),
+    sort_by: z.enum(DISCOVER_SORTS).optional().catch(undefined),
+  }),
+};
+
+export const searchContentSchemas = {
+  query: z
+    .object({
+      q: z
+        .string("Search query is required")
+        .trim()
+        .min(1, "Search query is required"),
+      // An unknown type falls back to searching everything, as it always has.
+      type: z.enum(["all", "movie", "tv"]).default("all").catch("all"),
+      year: year.optional(),
+      page,
+    })
+    .superRefine((query, context) => {
+      if (query.year !== undefined && query.type === "all") {
+        context.addIssue({
+          code: "custom",
+          path: ["year"],
+          message: "Year cannot be used with multi search",
+        });
+      }
+    }),
+};
+
+export const getTrendingSchemas = {
+  query: z.object({
+    media_type: z
+      .enum(["all", "movie", "tv"], 'Media type must be "all", "movie", or "tv"')
+      .default("all"),
+    time_window: z
+      .enum(["day", "week"], 'Time window must be "day" or "week"')
+      .default("week"),
+  }),
+};
```

Apply to `src/lib/tmdb/contract.ts`:

```diff
diff --git a/src/lib/tmdb/contract.ts b/src/lib/tmdb/contract.ts
index 362b40c..c156866 100644
--- a/src/lib/tmdb/contract.ts
+++ b/src/lib/tmdb/contract.ts
@@ -1,4 +1,5 @@
 import { defineContract, schemas, type } from "../api/contract";
+import type { TMDBContentSearchResult } from "../content-status/types";
 import type {
   TMDBEpisode,
   TMDBGenre,
@@ -7,10 +8,13 @@ import type {
   TMDBTVShowDetails,
 } from "./client";
 import type {
+  discoverContentSchemas,
   getContentDetailsSchemas,
   getCreditsSchemas,
   getGenresSchemas,
   getSeasonOrEpisodeSchemas,
+  getTrendingSchemas,
+  searchContentSchemas,
 } from "./schemas";
 import type { CastMember } from "./types";
 
@@ -50,3 +54,27 @@ export const getSeasonOrEpisode = defineContract({
     seasonNotFound: { status: 404, message: "Season not found" },
   },
 });
+
+export const discoverContent = defineContract({
+  method: "GET",
+  path: "/api/tmdb/discover",
+  label: "TMDB discover",
+  schemas: schemas<typeof discoverContentSchemas>(),
+  response: type<TMDBContentSearchResult>(),
+});
+
+export const searchContent = defineContract({
+  method: "GET",
+  path: "/api/tmdb/search",
+  label: "TMDB search",
+  schemas: schemas<typeof searchContentSchemas>(),
+  response: type<TMDBContentSearchResult>(),
+});
+
+export const getTrending = defineContract({
+  method: "GET",
+  path: "/api/tmdb/trending",
+  label: "TMDB trending",
+  schemas: schemas<typeof getTrendingSchemas>(),
+  response: type<TMDBContentSearchResult>(),
+});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/tmdb/search/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient, TMDBSearchResult } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { searchContentSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/search - Search movies, TV shows, or both, with the user's
// watch status on each result
export const GET = authedRoute(
  tmdbApi.searchContent,
  searchContentSchemas,
  async ({ user, query }) => {
    let intermediateResults: TMDBSearchResult;

    switch (query.type) {
      case "movie":
        intermediateResults = await tmdbClient.searchMovies(
          query.q,
          query.page,
          query.year,
        );
        break;
      case "tv":
        intermediateResults = await tmdbClient.searchTVShows(
          query.q,
          query.page,
          query.year,
        );
        break;
      case "all":
        intermediateResults = await tmdbClient.searchMulti(query.q, query.page);
        break;
    }

    return {
      page: intermediateResults.page,
      results:
        intermediateResults.results?.length > 0
          ? await mapAllWithContentStatus(intermediateResults.results, user.id)
          : [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };
  },
);
```

Replace `src/app/api/tmdb/discover/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient, TMDBSearchResult } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { discoverContentSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/discover - Browse movies, TV shows, or both, with the user's
// watch status on each result
export const GET = authedRoute(
  tmdbApi.discoverContent,
  discoverContentSchemas,
  async ({ user, query }) => {
    const params = {
      page: query.page,
      genre: query.genre,
      year: query.year,
      sortBy: query.sort_by,
    };

    let intermediateResults: TMDBSearchResult;

    if (query.type === "movie") {
      intermediateResults = await tmdbClient.discoverMovies(params);
    } else if (query.type === "tv") {
      intermediateResults = await tmdbClient.discoverTVShows(params);
    } else {
      const [movies, tvShows] = await Promise.all([
        tmdbClient.discoverMovies(params),
        tmdbClient.discoverTVShows(params),
      ]);
      const combinedDiscover = [...movies.results, ...tvShows.results].sort(
        (a, b) => b.popularity - a.popularity,
      );

      intermediateResults = {
        page: query.page,
        results: combinedDiscover,
        total_pages: movies.total_pages + tvShows.total_pages,
        total_results: movies.total_results + tvShows.total_results,
      };
    }

    return {
      page: intermediateResults.page,
      results:
        intermediateResults.results?.length > 0
          ? await mapAllWithContentStatus(intermediateResults.results, user.id)
          : [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };
  },
);
```

Replace `src/app/api/tmdb/trending/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getTrendingSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/trending - Trending content with the user's watch status
export const GET = authedRoute(
  tmdbApi.getTrending,
  getTrendingSchemas,
  async ({ user, query }) => {
    const intermediateResults = await tmdbClient.getTrending(
      query.media_type,
      query.time_window,
    );

    return {
      page: intermediateResults.page,
      results:
        intermediateResults.results?.length > 0
          ? await mapAllWithContentStatus(intermediateResults.results, user.id)
          : [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };
  },
);
```

- [ ] **Step 5: Update the search page**

Apply to `src/components/search/SearchClient.tsx`:

```diff
diff --git a/src/components/search/SearchClient.tsx b/src/components/search/SearchClient.tsx
index d9c9958..1b89b11 100644
--- a/src/components/search/SearchClient.tsx
+++ b/src/components/search/SearchClient.tsx
@@ -8,8 +8,9 @@ import { SearchInput } from "@/components/search/SearchInput";
 import { Button } from "@/components/ui/Button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
 import Dropdown from "@/components/ui/Dropdown";
-import { TMDBContentSearchResult } from "@/lib/content-status/types";
+import { api } from "@/lib/api/client";
 import type { TMDBGenre } from "@/lib/tmdb/client";
+import * as tmdbApi from "@/lib/tmdb/contract";
 
 import { ContentCard } from "../content/ContentCard";
 import { ContentCardSkeleton } from "../content/ContentCardSkeleton";
@@ -19,8 +20,7 @@ type ContentType = "all" | "movie" | "tv";
 type SortBy =
   | "popularity.desc"
   | "vote_average.desc"
-  | "release_date.desc"
-  | "title.asc";
+  | "release_date.desc";
 
 export interface SearchClientProps {
   genres: TMDBGenre[];
@@ -35,25 +35,26 @@ export function SearchClient({ genres, children }: SearchClientProps) {
   const [sortBy, setSortBy] = useState<SortBy>("popularity.desc");
   const [showFilters, setShowFilters] = useState(false);
 
-  const discoverQuery = useInfiniteQuery<TMDBContentSearchResult>({
+  const discoverQuery = useInfiniteQuery({
     queryKey: [
       "tmdb",
       "discover",
       { contentType, sortBy, selectedGenre, selectedYear },
     ],
-    queryFn: async ({ pageParam = 1 }) => {
-      const pageNum = typeof pageParam === "number" ? pageParam : 1;
-      const params = new URLSearchParams({
-        page: pageNum.toString(),
-        sort_by: sortBy,
-      });
-      if (contentType !== "all") params.append("type", contentType);
-      if (selectedGenre) params.append("genre", selectedGenre);
-      if (selectedYear) params.append("year", selectedYear);
-      const response = await fetch(`/api/tmdb/discover?${params}`);
-      if (!response.ok) throw new Error("Failed to load discover content");
-      return response.json();
-    },
+    queryFn: ({ pageParam, signal }) =>
+      api(
+        tmdbApi.discoverContent,
+        {
+          query: {
+            page: pageParam,
+            sort_by: sortBy,
+            type: contentType === "all" ? undefined : contentType,
+            genre: selectedGenre || undefined,
+            year: selectedYear || undefined,
+          },
+        },
+        { signal },
+      ),
     initialPageParam: 1,
     getNextPageParam: (lastPage, pages) => {
       const currentPage = pages.length;
@@ -63,17 +64,22 @@ export function SearchClient({ genres, children }: SearchClientProps) {
     },
   });
 
-  const searchResultsQuery = useQuery<TMDBContentSearchResult>({
+  const searchResultsQuery = useQuery({
     queryKey: ["tmdb", "search", { q: searchQuery, contentType, selectedYear }],
     enabled: !!searchQuery.trim(),
-    queryFn: async () => {
-      const params = new URLSearchParams({ q: searchQuery, type: contentType });
-      if (selectedYear && contentType !== "all")
-        params.append("year", selectedYear);
-      const response = await fetch(`/api/tmdb/search?${params}`);
-      if (!response.ok) throw new Error("Search failed");
-      return response.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        tmdbApi.searchContent,
+        {
+          query: {
+            q: searchQuery,
+            type: contentType,
+            year:
+              selectedYear && contentType !== "all" ? selectedYear : undefined,
+          },
+        },
+        { signal },
+      ),
   });
 
   const handleSearch = useCallback((query: string) => {
@@ -214,7 +220,6 @@ export function SearchClient({ genres, children }: SearchClientProps) {
                       { key: "popularity.desc", label: "Popularity" },
                       { key: "vote_average.desc", label: "Rating" },
                       { key: "release_date.desc", label: "Release Date" },
-                      { key: "title.asc", label: "Title" },
                     ]}
                   />
                 </div>
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/tmdb src/components/search src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tmdb src/app/api/tmdb src/components/search/SearchClient.tsx
git commit -m "refactor: move TMDB search, discover and trending onto typed contracts"
```

---

### Task 3: Watch providers

**Files:**
- Modify: `src/lib/tmdb/schemas.ts`, `src/lib/tmdb/contract.ts`, `src/lib/tmdb/client.ts`, `src/app/api/watch/content/route.ts`, `src/app/api/watch/providers/route.ts`, `src/app/api/watch/regions/route.ts`, `src/components/profile/StreamingPreferences.tsx`, `src/components/content/ContentDetailsModal.tsx`
- Test: `src/app/api/watch/content/route.test.ts`

**Interfaces:**
- Consumes: the watch types in `types.ts` (Task 1), the contract file.
- Produces: contracts `getContentWatchProviders`, `getRegionWatchProviders`, `getWatchProviderRegions` and their `*Schemas`.

`ContentDetailsModal` already reads `providers.ads`. Typing the call surfaced that `TMDBContentWatchProviders` omitted it, so `client.ts` gains the field.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/watch/content/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const tmdb = {
  getContentWatchProviders: vi.fn(),
  getWatchProviderRegions: vi.fn(),
  getWatchProviders: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

const content = await import("./route");
const providers = await import("../providers/route");
const regions = await import("../regions/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/watch/${path}`, { headers });

const provider = (id: number, name: string) => ({
  provider_id: id,
  provider_name: name,
  logo_path: null,
  display_priority: id,
});

describe("GET /api/watch/content", () => {
  it("upper-cases the region and returns that region's providers", async () => {
    tmdb.getContentWatchProviders.mockResolvedValue({
      results: { AU: { flatrate: [provider(8, "Netflix")] } },
    });
    const response = await content.GET(get("content?type=tv&id=1399&region=au"));
    expect(tmdb.getContentWatchProviders).toHaveBeenCalledWith("tv", 1399);
    await expect(response.json()).resolves.toEqual({
      region: "AU",
      providers: { flatrate: [provider(8, "Netflix")] },
    });
  });

  it("returns null providers for a region with none", async () => {
    tmdb.getContentWatchProviders.mockResolvedValue({ results: {} });
    const response = await content.GET(get("content?type=movie&id=1&region=US"));
    await expect(response.json()).resolves.toEqual({
      region: "US",
      providers: null,
    });
  });

  it.each([
    ["content?type=book&id=1&region=US", "type must be 'movie' or 'tv'"],
    ["content?type=tv&id=-1&region=US", "id must be a valid number"],
    ["content?type=tv&id=1", "region is required"],
    ["content?type=tv&id=1&region=%20", "region is required"],
  ])("rejects %s", async (path, error) => {
    const response = await content.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/watch/providers", () => {
  it("merges movie and TV providers without duplicates", async () => {
    tmdb.getWatchProviders.mockImplementation(async (type: string) => ({
      results:
        type === "movie"
          ? [provider(8, "Netflix"), provider(9, "Prime")]
          : [provider(8, "Netflix"), provider(10, "Stan")],
    }));
    const response = await providers.GET(get("providers?region=AU"));
    const body = await response.json();
    expect(body.results.map((p: { provider_id: number }) => p.provider_id)).toEqual(
      [8, 9, 10],
    );
    expect(tmdb.getWatchProviders).toHaveBeenCalledWith("movie", "AU");
  });

  it("requires a region", async () => {
    const response = await providers.GET(get("providers"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "region query parameter is required",
    );
  });
});

describe("GET /api/watch/regions", () => {
  it("returns TMDB's regions", async () => {
    tmdb.getWatchProviderRegions.mockResolvedValue({ results: [] });
    const response = await regions.GET(get("regions"));
    await expect(response.json()).resolves.toEqual({ results: [] });
  });

  it("requires a session", async () => {
    const response = await regions.GET(
      new NextRequest("http://localhost/api/watch/regions"),
    );
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/watch`
Expected: FAIL. A negative `id` and a blank `region` pass, and bodies lack `code`.

- [ ] **Step 3: Extend the schemas, contract and TMDB type**

Apply to `src/lib/tmdb/schemas.ts`:

```diff
diff --git a/src/lib/tmdb/schemas.ts b/src/lib/tmdb/schemas.ts
index f02a5c8..2cbd9f0 100644
--- a/src/lib/tmdb/schemas.ts
+++ b/src/lib/tmdb/schemas.ts
@@ -103,3 +103,24 @@ export const getTrendingSchemas = {
       .default("week"),
   }),
 };
+
+export const getContentWatchProvidersSchemas = {
+  query: z.object({
+    type: z.enum(["movie", "tv"], "type must be 'movie' or 'tv'"),
+    id: q.int({ min: 1, message: "id must be a valid number" }),
+    region: z
+      .string("region is required")
+      .trim()
+      .min(1, "region is required")
+      .transform((region) => region.toUpperCase()),
+  }),
+};
+
+export const getRegionWatchProvidersSchemas = {
+  query: z.object({
+    region: z
+      .string("region query parameter is required")
+      .trim()
+      .min(1, "region query parameter is required"),
+  }),
+};
```

Apply to `src/lib/tmdb/contract.ts`:

```diff
diff --git a/src/lib/tmdb/contract.ts b/src/lib/tmdb/contract.ts
index c156866..79e8377 100644
--- a/src/lib/tmdb/contract.ts
+++ b/src/lib/tmdb/contract.ts
@@ -10,13 +10,20 @@ import type {
 import type {
   discoverContentSchemas,
   getContentDetailsSchemas,
+  getContentWatchProvidersSchemas,
   getCreditsSchemas,
   getGenresSchemas,
+  getRegionWatchProvidersSchemas,
   getSeasonOrEpisodeSchemas,
   getTrendingSchemas,
   searchContentSchemas,
 } from "./schemas";
-import type { CastMember } from "./types";
+import type {
+  CastMember,
+  ContentWatchProvidersResponse,
+  RegionWatchProvidersResponse,
+  WatchProviderRegion,
+} from "./types";
 
 export const getContentDetails = defineContract({
   method: "GET",
@@ -78,3 +85,26 @@ export const getTrending = defineContract({
   schemas: schemas<typeof getTrendingSchemas>(),
   response: type<TMDBContentSearchResult>(),
 });
+
+export const getContentWatchProviders = defineContract({
+  method: "GET",
+  path: "/api/watch/content",
+  label: "Fetch content watch providers",
+  schemas: schemas<typeof getContentWatchProvidersSchemas>(),
+  response: type<ContentWatchProvidersResponse>(),
+});
+
+export const getRegionWatchProviders = defineContract({
+  method: "GET",
+  path: "/api/watch/providers",
+  label: "Fetch watch providers for region",
+  schemas: schemas<typeof getRegionWatchProvidersSchemas>(),
+  response: type<RegionWatchProvidersResponse>(),
+});
+
+export const getWatchProviderRegions = defineContract({
+  method: "GET",
+  path: "/api/watch/regions",
+  label: "Fetch watch provider regions",
+  response: type<{ results: WatchProviderRegion[] }>(),
+});
```

Apply to `src/lib/tmdb/client.ts`:

```diff
diff --git a/src/lib/tmdb/client.ts b/src/lib/tmdb/client.ts
index fef6417..edb1fae 100644
--- a/src/lib/tmdb/client.ts
+++ b/src/lib/tmdb/client.ts
@@ -150,6 +150,7 @@ export interface TMDBContentWatchProviders {
     [region: string]: {
       link?: string;
       flatrate?: TMDBWatchProvider[];
+      ads?: TMDBWatchProvider[];
       rent?: TMDBWatchProvider[];
       buy?: TMDBWatchProvider[];
     };
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/watch/content/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getContentWatchProvidersSchemas } from "@/lib/tmdb/schemas";

// GET /api/watch/content?type=movie|tv&id=123&region=US
export const GET = authedRoute(
  tmdbApi.getContentWatchProviders,
  getContentWatchProvidersSchemas,
  async ({ query }) => {
    const data = await tmdbClient.getContentWatchProviders(
      query.type,
      query.id,
    );
    return {
      region: query.region,
      providers: data?.results?.[query.region] || null,
    };
  },
);
```

Replace `src/app/api/watch/providers/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { tmdbClient, type TMDBWatchProvider } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getRegionWatchProvidersSchemas } from "@/lib/tmdb/schemas";

// GET /api/watch/providers?region=US - Movie and TV providers in a region
export const GET = authedRoute(
  tmdbApi.getRegionWatchProviders,
  getRegionWatchProvidersSchemas,
  async ({ query }) => {
    const [movieProviders, tvProviders] = await Promise.all([
      tmdbClient.getWatchProviders("movie", query.region),
      tmdbClient.getWatchProviders("tv", query.region),
    ]);

    // Merge and de-duplicate providers by provider_id
    const map = new Map<number, TMDBWatchProvider>();
    [...movieProviders.results, ...tvProviders.results].forEach((p) => {
      if (!map.has(p.provider_id)) {
        map.set(p.provider_id, p);
      }
    });

    return { results: Array.from(map.values()) };
  },
);
```

Replace `src/app/api/watch/regions/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";

// GET /api/watch/regions - Regions TMDB has watch providers for
export const GET = authedRoute(tmdbApi.getWatchProviderRegions, {}, () =>
  tmdbClient.getWatchProviderRegions(),
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/profile/StreamingPreferences.tsx`:

```diff
diff --git a/src/components/profile/StreamingPreferences.tsx b/src/components/profile/StreamingPreferences.tsx
index c311ad7..32355b3 100644
--- a/src/components/profile/StreamingPreferences.tsx
+++ b/src/components/profile/StreamingPreferences.tsx
@@ -8,8 +8,10 @@ import { useEffect, useMemo, useState } from "react";
 import { Button } from "@/components/ui/Button";
 import Dropdown from "@/components/ui/Dropdown";
 import { Input } from "@/components/ui/Input";
+import { api } from "@/lib/api/client";
 import type { StreamingPreferences as StreamingPreferencesType } from "@/lib/profile/streaming/types";
 import { getImageUrl } from "@/lib/tmdb/client";
+import * as tmdbApi from "@/lib/tmdb/contract";
 
 import { useStreamingPreferences } from "../providers/AuthProvider";
 import { LoadingSpinner } from "../ui/LoadingSpinner";
@@ -43,10 +45,13 @@ export function StreamingPreferences() {
   // React Query: regions
   const regionsQuery = useQuery<Region[]>({
     queryKey: ["watch", "regions"],
-    queryFn: async () => {
-      const regionsRes = await fetch("/api/watch/regions");
-      const regionsData = await regionsRes.json();
-      return (regionsData?.results || []) as Region[];
+    queryFn: async ({ signal }) => {
+      const regionsData = await api(
+        tmdbApi.getWatchProviderRegions,
+        {},
+        { signal },
+      );
+      return regionsData.results;
     },
   });
 
@@ -54,10 +59,13 @@ export function StreamingPreferences() {
   const providersQuery = useQuery<Provider[]>({
     queryKey: ["watch", "providers", region],
     enabled: !!region,
-    queryFn: async () => {
-      const res = await fetch(`/api/watch/providers?region=${region}`);
-      const data = await res.json();
-      return (data?.results || []) as Provider[];
+    queryFn: async ({ signal }) => {
+      const data = await api(
+        tmdbApi.getRegionWatchProviders,
+        { query: { region } },
+        { signal },
+      );
+      return data.results;
     },
   });
 
```

Apply to `src/components/content/ContentDetailsModal.tsx`:

```diff
diff --git a/src/components/content/ContentDetailsModal.tsx b/src/components/content/ContentDetailsModal.tsx
index 83b774e..0a453fc 100644
--- a/src/components/content/ContentDetailsModal.tsx
+++ b/src/components/content/ContentDetailsModal.tsx
@@ -93,30 +93,7 @@ export function ContentDetailsModal({
       ? detailedContent.number_of_episodes
       : null;
 
-  const contentProvidersQuery = useQuery<{
-    providers: {
-      flatrate?: Array<{
-        provider_id: number;
-        provider_name: string;
-        logo_path: string | null;
-      }>;
-      ads?: Array<{
-        provider_id: number;
-        provider_name: string;
-        logo_path: string | null;
-      }>;
-      buy?: Array<{
-        provider_id: number;
-        provider_name: string;
-        logo_path: string | null;
-      }>;
-      rent?: Array<{
-        provider_id: number;
-        provider_name: string;
-        logo_path: string | null;
-      }>;
-    } | null;
-  }>({
+  const contentProvidersQuery = useQuery({
     queryKey: [
       "watch",
       "content",
@@ -125,13 +102,18 @@ export function ContentDetailsModal({
       streamingPreferences?.country?.toUpperCase() ?? null,
     ],
     enabled: isOpen && !!streamingPreferences?.country,
-    queryFn: async () => {
-      const region = streamingPreferences!.country!.toUpperCase();
-      const providersRes = await fetch(
-        `/api/watch/content?type=${content.contentType}&id=${content.tmdbId}&region=${region}`,
-      );
-      return providersRes.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        tmdbApi.getContentWatchProviders,
+        {
+          query: {
+            type: content.contentType,
+            id: content.tmdbId,
+            region: streamingPreferences!.country!.toUpperCase(),
+          },
+        },
+        { signal },
+      ),
   });
   const streamingLoading = contentProvidersQuery.isLoading;
   const contentStreaming = contentProvidersQuery.data?.providers || null;
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/watch src/components src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tmdb src/app/api/watch src/components/profile/StreamingPreferences.tsx src/components/content/ContentDetailsModal.tsx
git commit -m "refactor: move watch providers onto typed contracts"
```

---

### Task 4: API docs and final checks

**Files:**
- Modify: `docs/api/openapi.yaml`

**Interfaces:**
- Consumes: everything above. Produces nothing later tasks use.

- [ ] **Step 1: Update the API docs**

Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index b0ff170..222719d 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -2907,17 +2907,23 @@ paths:
           required: false
           schema:
             type: string
+            default: all
             enum: [all, movie, tv]
         - in: query
           name: year
           required: false
           schema:
             type: integer
+            minimum: 1900
+            description: "At most five years from now. Not allowed when type is all."
         - in: query
           name: page
           required: false
           schema:
             type: integer
+            minimum: 1
+            maximum: 1000
+            default: 1
       responses:
         "200":
           description: Search results
@@ -2973,21 +2979,38 @@ paths:
           required: false
           schema:
             type: integer
+            minimum: 1
+            description: Ignored when invalid.
         - in: query
           name: year
           required: false
           schema:
             type: integer
+            minimum: 1900
+            description: At most five years from now. Ignored when invalid.
         - in: query
           name: sort_by
           required: false
           schema:
             type: string
+            enum:
+              - popularity.desc
+              - popularity.asc
+              - vote_average.desc
+              - vote_average.asc
+              - release_date.desc
+              - release_date.asc
+              - first_air_date.desc
+              - first_air_date.asc
+            description: Ignored when invalid.
         - in: query
           name: page
           required: false
           schema:
             type: integer
+            minimum: 1
+            maximum: 1000
+            default: 1
       responses:
         "200":
           description: Discover results
@@ -2995,6 +3018,12 @@ paths:
             application/json:
               schema:
                 $ref: "#/components/schemas/TMDBContentSearchResult"
+        "400":
+          description: Invalid type or page
+          content:
+            application/json:
+              schema:
+                $ref: "#/components/schemas/ErrorResponse"
         "401":
           description: Authentication required
           content:
@@ -3025,12 +3054,14 @@ paths:
           required: false
           schema:
             type: string
+            default: all
             enum: [all, movie, tv]
         - in: query
           name: time_window
           required: false
           schema:
             type: string
+            default: week
             enum: [day, week]
       responses:
         "200":
@@ -3075,6 +3106,7 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: type
           required: true
@@ -3135,6 +3167,7 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
       responses:
         "200":
           description: Cast list
@@ -3233,16 +3266,19 @@ paths:
         required: true
         schema:
           type: integer
+          minimum: 1
       - in: query
         name: season
         required: true
         schema:
           type: integer
+          minimum: 0
       - in: query
         name: episode
         required: false
         schema:
           type: integer
+          minimum: 0
     get:
       tags: [TMDB]
       summary: Get TV season or episode details
@@ -3388,6 +3424,7 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: region
           required: true
```

- [ ] **Step 2: Confirm no hand parsing or text matching remains**

Run: `grep -rnE 'parseInt|searchParams|includes\("404"\)|TMDB API error|split\("/"\)' src/app/api/tmdb src/app/api/watch --include=route.ts`
Expected: no output.

- [ ] **Step 3: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,679 passing tests. Report any failure with its output.

- [ ] **Step 4: Check the bundle**

Run this in a POSIX shell, using `bash -c` if your shell is fish:

```bash
find .next/static/chunks -name '*.js' | xargs -I{} sh -c 'gzip -c "{}" | wc -c' | awk '{s+=$1} END {print "gz:", s, "delta:", s-507379}'
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: delta about 6,200 and under 10,000; `0` chunks containing Zod. If a command is blocked, report it rather than finding another way to run it.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: document bounds and defaults on the TMDB and watch routes"
```
