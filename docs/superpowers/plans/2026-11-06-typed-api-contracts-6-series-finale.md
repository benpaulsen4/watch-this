# Typed API Contracts: Series Finale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the four Series Finale JSON routes and `useSeriesFinale` onto typed contracts, and switch the PNG card route to Next's route params. This is layer 6 of 8 in the spec's rollout, stacked on PR #61.

**Architecture:** `src/lib/series-finale/contract.ts` and `schemas.ts` define the four JSON endpoints. The `[period]` schema parses the label into a period, so handlers receive a parsed period. Each route uses `authedRoute` with the `headers` option, which keeps `Cache-Control: private, no-store` on every response, including 401s and errors. The card route returns a PNG, so it stays on `withAuth` and reads `ctx.params`. `useSeriesFinale` calls `api()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, success response shapes and status codes do not change. The e2e specs under `e2e/series-finale/` check these statuses.
- Every error body keeps `error` and adds `code`, the card route's included.
- Every response from these five routes carries `Cache-Control: private, no-store`, including 401s and errors.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine.
- Bundle: every page's growth stays under 10 kB gzipped, checked with `node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json` after a build. No chunk contains Zod.
- `useSeriesFinale` keeps its public behaviour: any 404 on the period query throws `SeriesFinaleUnavailableError`, and failed dismissals and completions throw `Dismiss failed` and `Story completion failed`.
- In Vitest commands, pass directory paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,725 tests, plus 17 live checks over HTTP against a production build and a real Postgres. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/series-finale/types.ts` | Adds `SeriesFinaleSnapshotSummary`, the listing row |
| `src/lib/series-finale/schemas.ts`, `contract.ts` (new) | The four JSON endpoints and the `[period]` param |
| `src/app/api/series-finale/route.ts`, `[period]/route.ts`, `[period]/dismiss/route.ts`, `[period]/story-complete/route.ts` | Rewritten on `authedRoute` |
| `src/app/api/series-finale/[period]/card/route.tsx` | Reads `ctx.params`; error bodies gain `code` |
| `src/hooks/useSeriesFinale.ts` | Calls `api()`; `SeriesFinaleListItem` derives from the server type |

`docs/api/openapi.yaml` already documents these routes accurately, including the period pattern and the `Cache-Control` note, so this layer does not change it.

## Behaviour changes, all intended

- **Error bodies:** they carry `code` (`validation`, `notFound`), and a malformed period's body also lists `issues`.
- **Route params:** the period comes from Next's route context instead of the request URL. Status codes, messages and the cache header are unchanged.

---

### Task 1: Series Finale routes

**Files:**
- Modify: `src/lib/series-finale/types.ts`, `src/app/api/series-finale/route.ts`, `src/app/api/series-finale/[period]/route.ts`, `src/app/api/series-finale/[period]/dismiss/route.ts`, `src/app/api/series-finale/[period]/story-complete/route.ts`, `src/app/api/series-finale/[period]/card/route.tsx`, and the four `[period]` route tests: `route.test.ts`, `dismiss/route.test.ts`, `story-complete/route.test.ts`, `card/route.test.ts`
- Create: `src/lib/series-finale/schemas.ts`, `src/lib/series-finale/contract.ts`

**Interfaces:**
- Consumes: from earlier layers, `defineContract`, `schemas`, `type`, `authedRoute` and its `headers` option, `withAuth` with `RouteContext`, `routeContext()` from `@/test/route-context`.
- Produces: contracts `listAvailableSnapshots`, `getOrGenerateSnapshot`, `dismissSeriesFinale`, `completeStory`; type `SeriesFinaleSnapshotSummary`. Task 2 uses all of them.

The existing route tests called handlers with only a request. Each `[period]` test file gains a small `send` helper that passes `routeContext({ period })`, taken from the URL the test built. Assertions on error bodies become `toMatchObject`, because the bodies now include `code`.

- [ ] **Step 1: Update the route tests**

Apply to `src/app/api/series-finale/[period]/route.test.ts`:

```diff
diff --git a/src/app/api/series-finale/[period]/route.test.ts b/src/app/api/series-finale/[period]/route.test.ts
index febf65e..e112c76 100644
--- a/src/app/api/series-finale/[period]/route.test.ts
+++ b/src/app/api/series-finale/[period]/route.test.ts
@@ -2,6 +2,8 @@
 import { NextRequest } from "next/server";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
+import { routeContext } from "@/test/route-context";
+
 const mockUser = { id: "user-1" };
 vi.mock("@/lib/auth/webauthn", () => ({
   getCurrentUser: vi.fn(async (token?: string) =>
@@ -20,6 +22,16 @@ vi.mock("@/lib/series-finale/service", () => ({
 
 const { GET } = await import("./route");
 
+// Next passes the `[period]` segment as route context; tests take it from the
+// URL they built.
+function send(
+  handler: (request: NextRequest, context: ReturnType<typeof routeContext>) => Promise<Response>,
+  request: NextRequest,
+) {
+  const period = new URL(request.url).pathname.split("/")[3] ?? "";
+  return handler(request, routeContext({ period }));
+}
+
 function authedRequest(url: string) {
   return new NextRequest(url, { headers: { cookie: "session=valid" } });
 }
@@ -31,12 +43,12 @@ describe("GET /api/series-finale/[period]", () => {
   });
 
   it("rejects a label that is not a plausible year", async () => {
-    const response = await GET(
+    const response = await send(GET, 
       authedRequest("http://localhost/api/series-finale/abcd"),
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid period",
     });
     expect(getOrGenerateSnapshot).not.toHaveBeenCalled();
@@ -48,12 +60,12 @@ describe("GET /api/series-finale/[period]", () => {
   it("maps a null payload to 404", async () => {
     getOrGenerateSnapshot.mockResolvedValue(null);
 
-    const response = await GET(
+    const response = await send(GET, 
       authedRequest("http://localhost/api/series-finale/2025"),
     );
 
     expect(response.status).toBe(404);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Period not available",
     });
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -64,7 +76,7 @@ describe("GET /api/series-finale/[period]", () => {
     getOrGenerateSnapshot.mockResolvedValue(payload);
     loadStoryCompletedAt.mockResolvedValue(null);
 
-    const response = await GET(
+    const response = await send(GET, 
       authedRequest("http://localhost/api/series-finale/2025"),
     );
 
@@ -86,7 +98,7 @@ describe("GET /api/series-finale/[period]", () => {
     getOrGenerateSnapshot.mockResolvedValue(payload);
     loadStoryCompletedAt.mockResolvedValue(completedAt);
 
-    const response = await GET(
+    const response = await send(GET, 
       authedRequest("http://localhost/api/series-finale/2025"),
     );
 
@@ -103,7 +115,7 @@ describe("GET /api/series-finale/[period]", () => {
   it("does not look up story completion when the period is unavailable", async () => {
     getOrGenerateSnapshot.mockResolvedValue(null);
 
-    await GET(authedRequest("http://localhost/api/series-finale/2025"));
+    await send(GET, authedRequest("http://localhost/api/series-finale/2025"));
 
     expect(loadStoryCompletedAt).not.toHaveBeenCalled();
   });
```

Apply to `src/app/api/series-finale/[period]/dismiss/route.test.ts`:

```diff
diff --git a/src/app/api/series-finale/[period]/dismiss/route.test.ts b/src/app/api/series-finale/[period]/dismiss/route.test.ts
index a9b3eba..a616e39 100644
--- a/src/app/api/series-finale/[period]/dismiss/route.test.ts
+++ b/src/app/api/series-finale/[period]/dismiss/route.test.ts
@@ -2,6 +2,8 @@
 import { NextRequest } from "next/server";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
+import { routeContext } from "@/test/route-context";
+
 const mockUser = { id: "user-1" };
 vi.mock("@/lib/auth/webauthn", () => ({
   getCurrentUser: vi.fn(async (token?: string) =>
@@ -46,6 +48,16 @@ vi.mock("drizzle-orm", () => ({
 
 const { POST } = await import("./route");
 
+// Next passes the `[period]` segment as route context; tests take it from the
+// URL they built.
+function send(
+  handler: (request: NextRequest, context: ReturnType<typeof routeContext>) => Promise<Response>,
+  request: NextRequest,
+) {
+  const period = new URL(request.url).pathname.split("/")[3] ?? "";
+  return handler(request, routeContext({ period }));
+}
+
 function authedRequest(url: string) {
   return new NextRequest(url, {
     method: "POST",
@@ -60,12 +72,12 @@ describe("POST /api/series-finale/[period]/dismiss", () => {
   });
 
   it("rejects a label that is not a plausible year", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       authedRequest("http://localhost/api/series-finale/abcd/dismiss"),
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid period",
     });
     expect(whereSpy).not.toHaveBeenCalled();
@@ -73,7 +85,7 @@ describe("POST /api/series-finale/[period]/dismiss", () => {
   });
 
   it("keeps a signed-out 401 out of shared caches too", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       new NextRequest("http://localhost/api/series-finale/2025/dismiss", {
         method: "POST",
       }),
@@ -85,7 +97,7 @@ describe("POST /api/series-finale/[period]/dismiss", () => {
   });
 
   it("marks the recap dismissed for the current user and period", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       authedRequest("http://localhost/api/series-finale/2025/dismiss"),
     );
 
@@ -105,7 +117,7 @@ describe("POST /api/series-finale/[period]/dismiss", () => {
   it("keeps the first dismissal rather than moving it to the latest", async () => {
     // The recap's foot dismisses on every visit that reaches it; a repeat
     // must not rewrite when the banner was first put away.
-    await POST(authedRequest("http://localhost/api/series-finale/2025/dismiss"));
+    await send(POST, authedRequest("http://localhost/api/series-finale/2025/dismiss"));
 
     expect(setSpy).toHaveBeenCalledWith({
       dismissedAt: {
```

Apply to `src/app/api/series-finale/[period]/story-complete/route.test.ts`:

```diff
diff --git a/src/app/api/series-finale/[period]/story-complete/route.test.ts b/src/app/api/series-finale/[period]/story-complete/route.test.ts
index 96581dc..817cb50 100644
--- a/src/app/api/series-finale/[period]/story-complete/route.test.ts
+++ b/src/app/api/series-finale/[period]/story-complete/route.test.ts
@@ -2,6 +2,8 @@
 import { NextRequest } from "next/server";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
+import { routeContext } from "@/test/route-context";
+
 const mockUser = { id: "user-1" };
 vi.mock("@/lib/auth/webauthn", () => ({
   getCurrentUser: vi.fn(async (token?: string) =>
@@ -57,6 +59,16 @@ vi.mock("drizzle-orm", () => ({
 
 const { POST } = await import("./route");
 
+// Next passes the `[period]` segment as route context; tests take it from the
+// URL they built.
+function send(
+  handler: (request: NextRequest, context: ReturnType<typeof routeContext>) => Promise<Response>,
+  request: NextRequest,
+) {
+  const period = new URL(request.url).pathname.split("/")[3] ?? "";
+  return handler(request, routeContext({ period }));
+}
+
 function authedRequest(url: string) {
   return new NextRequest(url, {
     method: "POST",
@@ -72,7 +84,7 @@ describe("POST /api/series-finale/[period]/story-complete", () => {
   });
 
   it("rejects a request with no session", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       new NextRequest("http://localhost/api/series-finale/2025/story-complete", {
         method: "POST",
       }),
@@ -84,21 +96,21 @@ describe("POST /api/series-finale/[period]/story-complete", () => {
   });
 
   it("rejects a label that is not a plausible year", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       authedRequest(
         "http://localhost/api/series-finale/abcd/story-complete",
       ),
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid period",
     });
     expect(whereSpy).not.toHaveBeenCalled();
   });
 
   it("marks the story completed for the current user and period", async () => {
-    const response = await POST(
+    const response = await send(POST, 
       authedRequest(
         "http://localhost/api/series-finale/2025/story-complete",
       ),
@@ -122,7 +134,7 @@ describe("POST /api/series-finale/[period]/story-complete", () => {
   // read-then-write, so it asserts the SET argument carries a `sql` fragment
   // rather than asserting on a stored value the mock DB doesn't model.
   it("uses coalesce so the first completion timestamp wins", async () => {
-    await POST(
+    await send(POST, 
       authedRequest(
         "http://localhost/api/series-finale/2025/story-complete",
       ),
@@ -134,14 +146,14 @@ describe("POST /api/series-finale/[period]/story-complete", () => {
   it("returns 404 when the user has no snapshot for the period", async () => {
     returningResult = [];
 
-    const response = await POST(
+    const response = await send(POST, 
       authedRequest(
         "http://localhost/api/series-finale/2025/story-complete",
       ),
     );
 
     expect(response.status).toBe(404);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Period not available",
     });
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
```

Apply to `src/app/api/series-finale/[period]/card/route.test.ts`:

```diff
diff --git a/src/app/api/series-finale/[period]/card/route.test.ts b/src/app/api/series-finale/[period]/card/route.test.ts
index b2970a2..8a35b1d 100644
--- a/src/app/api/series-finale/[period]/card/route.test.ts
+++ b/src/app/api/series-finale/[period]/card/route.test.ts
@@ -5,6 +5,7 @@ import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
 
 import { shareQrDataUrl } from "@/lib/series-finale/share";
 import type { SeriesFinalePayload } from "@/lib/series-finale/types";
+import { routeContext } from "@/test/route-context";
 
 const mockUser = { id: "user-1", username: "benjamin" };
 vi.mock("@/lib/auth/webauthn", () => ({
@@ -55,6 +56,16 @@ vi.mock("next/og", () => ({
 
 const { GET } = await import("./route");
 
+// Next passes the `[period]` segment as route context; tests take it from the
+// URL they built.
+function send(
+  handler: (request: NextRequest, context: ReturnType<typeof routeContext>) => Promise<Response>,
+  request: NextRequest,
+) {
+  const period = new URL(request.url).pathname.split("/")[3] ?? "";
+  return handler(request, routeContext({ period }));
+}
+
 function authedRequest(url: string) {
   return new NextRequest(url, { headers: { cookie: "session=valid" } });
 }
@@ -193,7 +204,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   });
 
   it("requires a session, and still forbids caching the refusal", async () => {
-    const response = await GET(new NextRequest(CARD_URL));
+    const response = await send(GET, new NextRequest(CARD_URL));
 
     expect(response.status).toBe(401);
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -201,12 +212,12 @@ describe("GET /api/series-finale/[period]/card", () => {
   });
 
   it("rejects a label that is not a plausible year", async () => {
-    const response = await GET(
+    const response = await send(GET, 
       authedRequest("http://localhost/api/series-finale/abcd/card"),
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid period",
     });
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -216,7 +227,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("maps a null payload to 404", async () => {
     getOrGenerateSnapshot.mockResolvedValue(null);
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(404);
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -226,7 +237,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("refuses a thin year rather than drawing a card for it", async () => {
     getOrGenerateSnapshot.mockResolvedValue({ ...payload(), thin: true });
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(404);
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -236,7 +247,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("renders the requested period's card as a private 1080x1350 PNG", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(response.headers.get("Content-Type")).toBe("image/png");
@@ -258,7 +269,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("draws nobody else's name, only the viewer's", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     const text = textOf(lastTree()).join("\n");
     expect(text).not.toContain("crewmate-quentin");
@@ -273,7 +284,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("inlines the top show's w342 poster, fetched with a timeout", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     expect(fetchMock).toHaveBeenCalledWith(
       "https://image.tmdb.org/t/p/w342/bear-poster.jpg",
@@ -285,7 +296,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("refuses to follow a redirect off the TMDB image host", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     expect(fetchMock).toHaveBeenCalledWith(
       expect.any(String),
@@ -301,7 +312,7 @@ describe("GET /api/series-finale/[period]/card", () => {
       }),
     );
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     expect(imageSources(lastTree())).toContain(POSTER_DATA_URL);
   });
@@ -312,7 +323,7 @@ describe("GET /api/series-finale/[period]/card", () => {
       new Response(POSTER_BYTES, { headers: { "content-type": "image/png" } }),
     );
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     expect(imageSources(lastTree())).toContain(
       `data:image/png;base64,${Buffer.from(POSTER_BYTES).toString("base64")}`,
@@ -325,7 +336,7 @@ describe("GET /api/series-finale/[period]/card", () => {
       new Response(POSTER_BYTES, { headers: { "content-type": "image/webp" } }),
     );
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(
@@ -346,7 +357,7 @@ describe("GET /api/series-finale/[period]/card", () => {
       }),
     );
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(imageSources(lastTree())).not.toContain(POSTER_DATA_URL);
@@ -356,7 +367,7 @@ describe("GET /api/series-finale/[period]/card", () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
     fetchMock.mockRejectedValue(new Error("network down"));
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(
@@ -371,7 +382,7 @@ describe("GET /api/series-finale/[period]/card", () => {
     if (withoutPoster.topShow) withoutPoster.topShow.posterPath = null;
     getOrGenerateSnapshot.mockResolvedValue(withoutPoster);
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(fetchMock).not.toHaveBeenCalled();
@@ -385,7 +396,7 @@ describe("GET /api/series-finale/[period]/card", () => {
       new Response(oversized, { headers: { "content-type": "image/jpeg" } }),
     );
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(
@@ -398,7 +409,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("points the QR at the site's front page, not at anything of the user's", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     expect(getSiteUrl).toHaveBeenCalledWith("/");
     const expected = await shareQrDataUrl(SITE_SENTINEL);
@@ -409,7 +420,7 @@ describe("GET /api/series-finale/[period]/card", () => {
   it("carries the QR and the TMDB attribution as inline images", async () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
 
-    await GET(authedRequest(CARD_URL));
+    await send(GET, authedRequest(CARD_URL));
 
     const sources = imageSources(lastTree());
     expect(sources.some((src) => src.startsWith("data:image/png"))).toBe(true);
@@ -422,7 +433,7 @@ describe("GET /api/series-finale/[period]/card", () => {
     getOrGenerateSnapshot.mockResolvedValue(payload());
     renderFailure.error = new Error("Expected <div> to have explicit display");
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(500);
     expect(response.headers.get("Cache-Control")).toBe("private, no-store");
@@ -435,7 +446,7 @@ describe("GET /api/series-finale/[period]/card", () => {
     renderFailure.error = new Error("Unsupported image type");
     renderFailure.times = 1;
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(200);
     expect(rendered).toHaveLength(2);
@@ -450,7 +461,7 @@ describe("GET /api/series-finale/[period]/card", () => {
     getOrGenerateSnapshot.mockResolvedValue(withoutPoster);
     renderFailure.error = new Error("Expected <div> to have explicit display");
 
-    const response = await GET(authedRequest(CARD_URL));
+    const response = await send(GET, authedRequest(CARD_URL));
 
     expect(response.status).toBe(500);
     expect(rendered).toHaveLength(1);
```

- [ ] **Step 2: Run them**

Run: `pnpm exec vitest run src/app/api/series-finale`
Expected: the old routes ignore the route context and parse the URL, so most tests still pass. That is expected for a move that keeps behaviour. Record the result either way.

- [ ] **Step 3: Write the types, schemas and contract**

Apply to `src/lib/series-finale/types.ts`:

```diff
diff --git a/src/lib/series-finale/types.ts b/src/lib/series-finale/types.ts
index 5be9910..48b4459 100644
--- a/src/lib/series-finale/types.ts
+++ b/src/lib/series-finale/types.ts
@@ -313,3 +313,12 @@ export interface SeriesFinalePayload {
 export function titleKey(tmdbId: number, contentType: "movie" | "tv"): string {
   return `${contentType}:${tmdbId}`;
 }
+
+/** One period in the dashboard and profile listing, read from the row. */
+export interface SeriesFinaleSnapshotSummary {
+  label: string;
+  generatedAt: Date;
+  dismissedAt: Date | null;
+  storyCompletedAt: Date | null;
+  headline: SeriesFinalePayload["headline"];
+}
```

Create `src/lib/series-finale/schemas.ts`:

```ts
import { z } from "zod";

import { parsePeriodLabel } from "./periods";

/** The `[period]` segment, parsed into the period it names. */
const periodParams = z.object({
  period: z.string().transform((label, context) => {
    const period = parsePeriodLabel(label);
    if (!period) {
      context.addIssue({ code: "custom", message: "Invalid period" });
      return z.NEVER;
    }
    return period;
  }),
});

export const getOrGenerateSnapshotSchemas = { params: periodParams };
export const dismissSeriesFinaleSchemas = { params: periodParams };
export const completeStorySchemas = { params: periodParams };
```

Create `src/lib/series-finale/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  completeStorySchemas,
  dismissSeriesFinaleSchemas,
  getOrGenerateSnapshotSchemas,
} from "./schemas";
import type { SeriesFinalePayload, SeriesFinaleSnapshotSummary } from "./types";

const PERIOD_NOT_AVAILABLE = { status: 404, message: "Period not available" };

export const listAvailableSnapshots = defineContract({
  method: "GET",
  path: "/api/series-finale",
  label: "Series Finale list",
  response: type<{ periods: SeriesFinaleSnapshotSummary[] }>(),
});

export const getOrGenerateSnapshot = defineContract({
  method: "GET",
  path: "/api/series-finale/[period]",
  label: "Series Finale payload",
  schemas: schemas<typeof getOrGenerateSnapshotSchemas>(),
  response: type<{
    payload: SeriesFinalePayload;
    storyCompletedAt: Date | null;
  }>(),
  errors: { notFound: PERIOD_NOT_AVAILABLE },
});

export const dismissSeriesFinale = defineContract({
  method: "POST",
  path: "/api/series-finale/[period]/dismiss",
  label: "Series Finale dismiss",
  schemas: schemas<typeof dismissSeriesFinaleSchemas>(),
  response: type<{ success: true }>(),
});

export const completeStory = defineContract({
  method: "POST",
  path: "/api/series-finale/[period]/story-complete",
  label: "Series Finale story complete",
  schemas: schemas<typeof completeStorySchemas>(),
  response: type<{ success: true }>(),
  errors: { notFound: PERIOD_NOT_AVAILABLE },
});
```

- [ ] **Step 4: Rewrite the JSON routes**

Replace `src/app/api/series-finale/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { listAvailableSnapshots } from "@/lib/series-finale/service";

// GET /api/series-finale - available periods for the current user; feeds the
// dashboard banner and profile rows. Generates any snapshot that is missing
// or stale (see `listAvailableSnapshots`) -- this is the feature's only entry
// point, so it cannot return placeholders for periods nobody has opened.
//
// Every response carries one user's recap data (or its absence) at a URL that
// is the same for every user, so no shared cache may keep it -- 401s and
// errors included, which `headers` covers.
export const GET = authedRoute(
  seriesFinaleApi.listAvailableSnapshots,
  {},
  async ({ user }) => ({ periods: await listAvailableSnapshots(user.id) }),
  { headers: { "Cache-Control": "private, no-store" } },
);
```

Replace `src/app/api/series-finale/[period]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { getOrGenerateSnapshotSchemas } from "@/lib/series-finale/schemas";
import {
  getOrGenerateSnapshot,
  loadStoryCompletedAt,
} from "@/lib/series-finale/service";

// GET /api/series-finale/[period] - the frozen payload, generated if absent.
//
// Every response carries one user's recap data (or its absence) at a URL that
// is the same for every user, so no shared cache may keep it -- 401s and
// errors included, which `headers` covers.
export const GET = authedRoute(
  seriesFinaleApi.getOrGenerateSnapshot,
  getOrGenerateSnapshotSchemas,
  async ({ user, params }) => {
    // `getOrGenerateSnapshot` is the one authority on whether this period is
    // over -- it gates in the user's own timezone, not UTC. A route-level
    // completeness check here would judge the wrong clock.
    const payload = await getOrGenerateSnapshot(user.id, params.period);
    if (!payload) return "notFound";

    // Row metadata, read the same way `listSnapshots` reads `dismissedAt` --
    // never folded into the frozen payload itself (task-2-brief.md).
    const storyCompletedAt = await loadStoryCompletedAt(user.id, params.period);

    return { payload, storyCompletedAt };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
```

Replace `src/app/api/series-finale/[period]/dismiss/route.ts` with:

```ts
import { and, eq, sql } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { dismissSeriesFinaleSchemas } from "@/lib/series-finale/schemas";

// POST /api/series-finale/[period]/dismiss - hide the dashboard banner. Sent
// by "Not now", and by the recap page once its foot is reached (seeing the
// year puts the banner away too).
//
// The first dismissal wins (COALESCE, as story-complete does): the recap
// sends this on every visit that reaches its foot, and a repeat must not
// rewrite when the banner was first put away.
//
// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included, which `headers` covers.
export const POST = authedRoute(
  seriesFinaleApi.dismissSeriesFinale,
  dismissSeriesFinaleSchemas,
  async ({ user, params: { period } }) => {
    await db
      .update(seriesFinale)
      .set({ dismissedAt: sql`coalesce(${seriesFinale.dismissedAt}, now())` })
      .where(
        and(
          eq(seriesFinale.userId, user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      );

    return { success: true as const };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
```

Replace `src/app/api/series-finale/[period]/story-complete/route.ts` with:

```ts
import { and, eq, sql } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { completeStorySchemas } from "@/lib/series-finale/schemas";

// POST /api/series-finale/[period]/story-complete - record that the viewer
// has gone through the whole story. Task 3 reads this to gate the phone
// recap, which defaults to the story and unlocks once it has been completed
// -- remembered on the account so it holds across devices, the way
// `dismissedAt` remembers "Not now".
//
// Idempotent via COALESCE rather than a read-then-write: the first completed
// timestamp wins, and two racing requests (e.g. a slow tab still open after
// the story finished elsewhere) can't overwrite it with a later one.
//
// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included, which `headers` covers.
export const POST = authedRoute(
  seriesFinaleApi.completeStory,
  completeStorySchemas,
  async ({ user, params: { period } }) => {
    const [updated] = await db
      .update(seriesFinale)
      .set({
        storyCompletedAt: sql`coalesce(${seriesFinale.storyCompletedAt}, now())`,
      })
      .where(
        and(
          eq(seriesFinale.userId, user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      )
      .returning({ id: seriesFinale.id });

    if (!updated) return "notFound";

    return { success: true as const };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
```

- [ ] **Step 5: Move the card route onto route params**

Apply to `src/app/api/series-finale/[period]/card/route.tsx`:

```diff
diff --git a/src/app/api/series-finale/[period]/card/route.tsx b/src/app/api/series-finale/[period]/card/route.tsx
index 006a42b..97b66d9 100644
--- a/src/app/api/series-finale/[period]/card/route.tsx
+++ b/src/app/api/series-finale/[period]/card/route.tsx
@@ -4,6 +4,7 @@ import { type NextRequest, NextResponse } from "next/server";
 import {
   AuthenticatedRequest,
   handleApiError,
+  type RouteContext,
   withAuth,
 } from "@/lib/auth/api-middleware";
 import { getSiteUrl } from "@/lib/seo/site";
@@ -68,16 +69,18 @@ async function posterDataUrl(
 }
 
 // GET /api/series-finale/[period]/card - the viewer's 1080x1350 share image.
-// The period is the segment before "card", parsed from `request.url` for the
-// same reason as the payload route beside this one: `withAuth` wraps a
-// single-argument handler.
-const handler = withAuth(async (request: AuthenticatedRequest) => {
+// A PNG, not JSON, so this route uses `withAuth` directly rather than a
+// contract; its error bodies follow the contract shape all the same.
+const handler = withAuth(async (request: AuthenticatedRequest, context) => {
   try {
-    const label = new URL(request.url).pathname.split("/").at(-2) ?? "";
-    const period = parsePeriodLabel(label);
+    const { period: label } = await context.params;
+    const period = typeof label === "string" ? parsePeriodLabel(label) : null;
 
     if (!period) {
-      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
+      return NextResponse.json(
+        { error: "Invalid period", code: "validation" },
+        { status: 400 },
+      );
     }
 
     const full = await getOrGenerateSnapshot(request.user.id, period);
@@ -86,7 +89,7 @@ const handler = withAuth(async (request: AuthenticatedRequest) => {
     // card announcing "3 hours" is exactly what the thin rule exists to avoid.
     if (!full || full.thin) {
       return NextResponse.json(
-        { error: "Period not available" },
+        { error: "Period not available", code: "notFound" },
         { status: 404 },
       );
     }
@@ -137,8 +140,11 @@ const handler = withAuth(async (request: AuthenticatedRequest) => {
 
 // The image is one user's recap at a URL that is the same for every user, so
 // no shared cache may keep it -- 401s and errors included.
-export async function GET(request: NextRequest): Promise<NextResponse> {
-  const response = await handler(request);
+export async function GET(
+  request: NextRequest,
+  context: RouteContext,
+): Promise<NextResponse> {
+  const response = await handler(request, context);
   response.headers.set("Cache-Control", "private, no-store");
   return response;
 }
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/series-finale src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors. The hook still calls the routes with plain `fetch` until Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/lib/series-finale src/app/api/series-finale
git commit -m "refactor: move Series Finale routes onto typed contracts"
```

---

### Task 2: `useSeriesFinale`

**Files:**
- Modify: `src/hooks/useSeriesFinale.ts`, `src/hooks/useSeriesFinale.test.tsx`

**Interfaces:**
- Consumes: Task 1's contracts and `SeriesFinaleSnapshotSummary`; `api`, `isApiError` and `Jsonify` from layer 1.
- Produces: the same exports as before. `SeriesFinaleListItem` becomes `Jsonify<SeriesFinaleSnapshotSummary>`, which matches its old shape.

The old `getJson` turned any 404 into `SeriesFinaleUnavailableError`, which `RecapClient` and `StoryReel` check for. The new query does the same by status, so a 404 without the contract's code, such as a proxy's page, still counts. Mutations keep their fixed failure messages, with the underlying error as `cause`. The body-reading behaviour the old `post` helper documented is now `api()`'s.

- [ ] **Step 1: Update the test**

Apply to `src/hooks/useSeriesFinale.test.tsx`:

```diff
diff --git a/src/hooks/useSeriesFinale.test.tsx b/src/hooks/useSeriesFinale.test.tsx
index f98cf5e..9f7a06b 100644
--- a/src/hooks/useSeriesFinale.test.tsx
+++ b/src/hooks/useSeriesFinale.test.tsx
@@ -52,7 +52,10 @@ describe("useSeriesFinale", () => {
     const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });
 
     await waitFor(() => expect(result.current.isSuccess).toBe(true));
-    expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026");
+    expect(fetchMock).toHaveBeenCalledWith(
+      "/api/series-finale/2026",
+      expect.objectContaining({ method: "GET" }),
+    );
   });
 
   it("surfaces a 404 as SeriesFinaleUnavailableError", async () => {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/hooks`
Expected: FAIL in "requests the given period", which now expects `fetch` to receive request options.

- [ ] **Step 3: Migrate the hook**

Apply to `src/hooks/useSeriesFinale.ts`:

```diff
diff --git a/src/hooks/useSeriesFinale.ts b/src/hooks/useSeriesFinale.ts
index 56815e0..b5ea6f9 100644
--- a/src/hooks/useSeriesFinale.ts
+++ b/src/hooks/useSeriesFinale.ts
@@ -7,15 +7,15 @@ import {
   useQueryClient,
 } from "@tanstack/react-query";
 
-import type { SeriesFinalePayload } from "@/lib/series-finale/types";
+import { api, isApiError } from "@/lib/api/client";
+import type { Jsonify } from "@/lib/api/contract";
+import * as seriesFinaleApi from "@/lib/series-finale/contract";
+import type {
+  SeriesFinalePayload,
+  SeriesFinaleSnapshotSummary,
+} from "@/lib/series-finale/types";
 
-export interface SeriesFinaleListItem {
-  label: string;
-  generatedAt: string;
-  dismissedAt: string | null;
-  storyCompletedAt: string | null;
-  headline: SeriesFinalePayload["headline"];
-}
+export type SeriesFinaleListItem = Jsonify<SeriesFinaleSnapshotSummary>;
 
 /**
  * A 404 from `GET /api/series-finale/[period]` means the period is not
@@ -29,29 +29,18 @@ export class SeriesFinaleUnavailableError extends Error {
   }
 }
 
-async function getJson<T>(url: string): Promise<T> {
-  const response = await fetch(url);
-  if (!response.ok) {
-    if (response.status === 404) {
-      throw new SeriesFinaleUnavailableError();
-    }
-    throw new Error(`Request failed: ${response.status}`);
-  }
-  return (await response.json()) as T;
-}
-
 /**
- * POST to `url`, resolving once the response has been read to its end, and
- * throwing `failure` on a non-2xx. Nothing uses the body (`{ success: true }`),
- * but it is read anyway: an unread fetch body leaves the request open in the
- * browser, so a page that has posted never goes network-idle -- and the recap
- * posts a dismissal whenever its foot is reached. A body that is not JSON (a
- * proxy's error page) is read all the same and ignored.
+ * Run a dismissal or completion POST, failing with `failure`. The client reads
+ * the response body to its end even when unused: an unread body leaves the
+ * request open in the browser, so a page that has posted never goes
+ * network-idle -- and the recap posts a dismissal whenever its foot is reached.
  */
-async function post(url: string, failure: string): Promise<void> {
-  const response = await fetch(url, { method: "POST" });
-  await response.json().catch(() => undefined);
-  if (!response.ok) throw new Error(failure);
+async function post(request: Promise<unknown>, failure: string): Promise<void> {
+  try {
+    await request;
+  } catch (error) {
+    throw new Error(failure, { cause: error });
+  }
 }
 
 const LIST_KEY = ["series-finale", "list"] as const;
@@ -59,9 +48,11 @@ const LIST_KEY = ["series-finale", "list"] as const;
 export function useSeriesFinaleList() {
   return useQuery({
     queryKey: LIST_KEY,
-    queryFn: async () => {
-      const data = await getJson<{ periods: SeriesFinaleListItem[] }>(
-        "/api/series-finale",
+    queryFn: async ({ signal }) => {
+      const data = await api(
+        seriesFinaleApi.listAvailableSnapshots,
+        {},
+        { signal },
       );
       return data.periods;
     },
@@ -83,8 +74,25 @@ const periodQueryKey = (period: string) => ["series-finale", period] as const;
 function periodQueryOptions(period: string) {
   return queryOptions({
     queryKey: periodQueryKey(period),
-    queryFn: () =>
-      getJson<SeriesFinalePeriodResponse>(`/api/series-finale/${period}`),
+    queryFn: async ({ signal }) => {
+      try {
+        return await api(
+          seriesFinaleApi.getOrGenerateSnapshot,
+          { params: { period } },
+          { signal },
+        );
+      } catch (error) {
+        // Any 404 means "not available", as before -- a body without the
+        // contract's code (a proxy's page) included.
+        if (
+          isApiError(error, seriesFinaleApi.getOrGenerateSnapshot) &&
+          error.status === 404
+        ) {
+          throw new SeriesFinaleUnavailableError();
+        }
+        throw error;
+      }
+    },
     // A snapshot is frozen, so there is nothing to refetch for.
     staleTime: Infinity,
     // A 404 means "not available", not "try again" -- and the first
@@ -127,7 +135,10 @@ export function useDismissSeriesFinale() {
 
   return useMutation({
     mutationFn: (period: string) =>
-      post(`/api/series-finale/${period}/dismiss`, "Dismiss failed"),
+      post(
+        api(seriesFinaleApi.dismissSeriesFinale, { params: { period } }),
+        "Dismiss failed",
+      ),
     onMutate: async (period: string) => {
       // An in-flight list fetch would land after this and overwrite it.
       await queryClient.cancelQueries({ queryKey: LIST_KEY });
@@ -171,7 +182,7 @@ export function useCompleteStory() {
   return useMutation({
     mutationFn: (period: string) =>
       post(
-        `/api/series-finale/${period}/story-complete`,
+        api(seriesFinaleApi.completeStory, { params: { period } }),
         "Story completion failed",
       ),
     onMutate: async (period: string) => {
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm exec vitest run src/hooks src/components/series-finale src/app/api/series-finale && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSeriesFinale.ts src/hooks/useSeriesFinale.test.tsx
git commit -m "refactor: move useSeriesFinale onto the typed client"
```

---

### Task 3: Final checks

**Files:** none.

- [ ] **Step 1: Confirm no URL parsing remains in these routes**

Run: `grep -rnE 'split\("/"\)|new URL\(request\.url\)' src/app/api/series-finale --include='route.ts*'`
Expected: no output.

- [ ] **Step 2: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,725 passing tests. Report any failure with its output.

- [ ] **Step 3: Check the bundle**

```bash
node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: the largest growth is about 3,500 bytes, and the Series Finale pages grow about 1,300 bytes; the second command prints `0`. If a command is blocked, report it rather than finding another way to run it. Nothing to commit.
