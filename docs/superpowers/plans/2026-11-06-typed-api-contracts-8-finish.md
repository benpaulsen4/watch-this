# Typed API Contracts: Guards, Expired Sessions and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the typed API contracts rollout. Handle sessions that expire while a page is open, add lint and test guards that keep new code on the contract pattern, give the last uncoded errors a `code`, remove `validatePagination`, and update the docs. This is layer 8 of 8 in the spec's rollout, stacked on PR #63.

**Architecture:** `AuthProvider` subscribes to React Query's query and mutation caches. On an `unauthenticated` or `invalidSession` error while it holds a user, it asks `GET /api/auth/session` once; if the server confirms the session is gone, it drops the user and calls `router.refresh()`, so the page's `requireUser` redirects to `/auth`. An ESLint rule bans the `fetch` global in components and hooks. A text-reading test requires every API route to use `authedRoute` or `publicRoute`, with an allowlist of two.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, ESLint 9, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, success response shapes, status codes and error messages do not change. Error bodies that lack `code` gain one.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine.
- Bundle: every page's growth stays under 10 kB gzipped, checked with `node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json` after a build. No chunk contains Zod.
- In Vitest commands, pass directory or file paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,845 tests, lint, typecheck and build. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/providers/AuthProvider.tsx` | Re-checks the session after a 401 from any query or mutation |
| `eslint.config.mjs` | Bans the `fetch` global in `src/components` and `src/hooks` |
| `src/lib/api/contracts.test.ts` | Requires every route to use a wrapper, with an allowlist of two |
| `src/app/api/profile/import/route.ts` | Error bodies carry `code` |
| `src/lib/auth/api-middleware.ts` | `validatePagination` removed |
| `docs/api/openapi.yaml` | `ErrorResponse.code` required; import's 413 documented |
| `docs/**` | Describe contracts, `authedRoute` and `api()` instead of `withAuth` |
| `src/app/(authenticated)/requireUser.ts` | `toClientUser` keeps a missing picture `null` |

## Rulings made while prototyping

- **Redirect via `router.refresh()`.** The spec says "the authenticated layout's existing redirect takes over", but there is no such layout: each page calls `requireUser` during its server render. Refreshing the route re-runs it, which redirects with the right `?redirect` path. Public pages are unaffected.
- **Confirm with the server, not `getCurrentSession`.** `getCurrentSession` returns `null` for any failure, so a network blip after a 401 would sign the user out. The check calls `api(authApi.getSession)` and signs out only on an `unauthenticated` or `invalidSession` answer.
- **One check at a time.** A dead session fails every request on the page together; a ref keeps it to one session request.
- **Import codes:** `validation` (with `issues`) for a missing file or a non-JSON format, `invalidFile` for unparsable JSON, `tooLarge` (413) for both size limits, and `internal`.
- **Lint exemptions are per line**, so the rest of `ShareButton` and `DataExportImport` stays covered.
- **No query-key constants are added.** The spec adds them only where a key is shared between files, and none is.

## Behaviour changes, all intended

- A signed-in user whose session expires or is revoked is signed out and sent to `/auth` the next time a React Query request fails with a 401, instead of seeing scattered errors.
- Import error bodies carry `code`; the missing-field 400s also carry `issues`.
- Server-seeded `User` objects carry `profilePictureUrl: null` instead of `""` for no picture, matching the session route.

---

### Task 1: Expired-session handling in AuthProvider

**Files:**
- Modify: `src/components/providers/AuthProvider.tsx`
- Test: `src/components/providers/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError` from `@/lib/api/client`; `authApi.getSession` from layer 7; `useProgressRouter`.
- Produces: nothing new is exported. The provider now subscribes to the query and mutation caches.

The test file gains a `next/navigation` mock, because the provider now calls `useProgressRouter`. Each new test waits for the provider's async check, so they take about a second each when the behaviour is missing.

- [ ] **Step 1: Write the failing tests**

Apply to `src/components/providers/AuthProvider.test.tsx`:

```diff
diff --git a/src/components/providers/AuthProvider.test.tsx b/src/components/providers/AuthProvider.test.tsx
index 5944839..146e60b 100644
--- a/src/components/providers/AuthProvider.test.tsx
+++ b/src/components/providers/AuthProvider.test.tsx
@@ -4,12 +4,16 @@ import userEvent from "@testing-library/user-event";
 import { type ReactElement, useState } from "react";
 import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
 
+import { ApiError } from "@/lib/api/client";
 import { getCurrentSession } from "@/lib/auth/client";
 
 import { AuthProvider, useAuth, useStreamingPreferences } from "./AuthProvider";
 
 vi.mock("@/lib/auth/client", () => ({ getCurrentSession: vi.fn() }));
 
+const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
+vi.mock("next/navigation", () => ({ useRouter: () => router }));
+
 const signedIn = {
   user: {
     id: "u1",
@@ -266,4 +270,162 @@ describe("AuthProvider", () => {
       expect(client.getQueryData(SEEDED)).toBe("alice's card");
     });
   });
+
+  describe("a 401 while signed in", () => {
+    const SEEDED = ["cached-for-alice"];
+    const expired = () =>
+      new ApiError("unauthenticated", 401, "Authentication required");
+
+    function UserProbe() {
+      const { user, loading } = useAuth();
+      return (
+        <span data-testid="who">
+          {loading ? "loading" : (user?.username ?? "signed-out")}
+        </span>
+      );
+    }
+    const who = () => screen.getByTestId("who").textContent;
+
+    /** The streaming preferences load succeeds; the session check answers `session`. */
+    function stubFetch(session: { ok: boolean; status: number; body: unknown }) {
+      const fetchMock = vi.fn(async (url: string) =>
+        url === "/api/auth/session"
+          ? { ok: session.ok, status: session.status, json: async () => session.body }
+          : {
+              ok: true,
+              status: 200,
+              json: async () => ({ country: "GB", providers: [] }),
+            },
+      );
+      vi.spyOn(global, "fetch").mockImplementation(fetchMock as any);
+      return () =>
+        fetchMock.mock.calls.filter(([url]) => url === "/api/auth/session")
+          .length;
+    }
+    const sessionGone = {
+      ok: false,
+      status: 401,
+      body: { error: "Invalid session", code: "invalidSession" },
+    };
+
+    async function renderSignedIn(client = new QueryClient()) {
+      render(
+        <AuthProvider>
+          <UserProbe />
+        </AuthProvider>,
+        client,
+      );
+      await waitFor(() => expect(who()).toBe("alice"));
+      return client;
+    }
+
+    const failQuery = (client: QueryClient, key: string, error: Error) =>
+      client
+        .fetchQuery({
+          queryKey: [key],
+          queryFn: () => Promise.reject(error),
+          retry: false,
+        })
+        .catch(() => {});
+
+    it("signs out, clears the cache and refreshes the route when the server confirms", async () => {
+      const sessionChecks = stubFetch(sessionGone);
+      const client = await renderSignedIn();
+      client.setQueryData(SEEDED, "alice's data");
+
+      await failQuery(client, "lists", expired());
+
+      await waitFor(() => expect(who()).toBe("signed-out"));
+      expect(router.refresh).toHaveBeenCalledTimes(1);
+      expect(client.getQueryData(SEEDED)).toBeUndefined();
+      expect(sessionChecks()).toBe(1);
+    });
+
+    it("reacts to a failed mutation too", async () => {
+      stubFetch(sessionGone);
+      const client = await renderSignedIn();
+
+      await client
+        .getMutationCache()
+        .build(client, { mutationFn: () => Promise.reject(expired()) })
+        .execute(undefined)
+        .catch(() => {});
+
+      await waitFor(() => expect(who()).toBe("signed-out"));
+      expect(router.refresh).toHaveBeenCalledTimes(1);
+    });
+
+    it("keeps the user when the session is still valid", async () => {
+      const sessionChecks = stubFetch({
+        ok: true,
+        status: 200,
+        body: signedIn,
+      });
+      const client = await renderSignedIn();
+
+      await failQuery(client, "lists", expired());
+      await waitFor(() => expect(sessionChecks()).toBe(1));
+      await new Promise((resolve) => setTimeout(resolve, 20));
+
+      expect(who()).toBe("alice");
+      expect(router.refresh).not.toHaveBeenCalled();
+    });
+
+    it("keeps the user when the session check itself fails", async () => {
+      const sessionChecks = stubFetch({ ok: false, status: 503, body: {} });
+      const client = await renderSignedIn();
+
+      await failQuery(client, "lists", expired());
+      await waitFor(() => expect(sessionChecks()).toBe(1));
+      await new Promise((resolve) => setTimeout(resolve, 20));
+
+      expect(who()).toBe("alice");
+      expect(router.refresh).not.toHaveBeenCalled();
+    });
+
+    it("checks once when many requests fail together", async () => {
+      const sessionChecks = stubFetch(sessionGone);
+      const client = await renderSignedIn();
+
+      await Promise.all([
+        failQuery(client, "a", expired()),
+        failQuery(client, "b", expired()),
+        failQuery(client, "c", expired()),
+      ]);
+
+      await waitFor(() => expect(who()).toBe("signed-out"));
+      expect(sessionChecks()).toBe(1);
+      expect(router.refresh).toHaveBeenCalledTimes(1);
+    });
+
+    it("ignores other errors", async () => {
+      const sessionChecks = stubFetch(sessionGone);
+      const client = await renderSignedIn();
+
+      await failQuery(client, "a", new ApiError("notFound", 404, "Not found"));
+      await new Promise((resolve) => setTimeout(resolve, 20));
+
+      expect(sessionChecks()).toBe(0);
+      expect(who()).toBe("alice");
+    });
+
+    it("does nothing for an anonymous visitor", async () => {
+      (getCurrentSession as any).mockResolvedValue(null);
+      const sessionChecks = stubFetch(sessionGone);
+      const client = new QueryClient();
+      render(
+        <AuthProvider>
+          <UserProbe />
+        </AuthProvider>,
+        client,
+      );
+      await waitFor(() => expect(who()).toBe("signed-out"));
+
+      await failQuery(client, "a", expired());
+      await new Promise((resolve) => setTimeout(resolve, 20));
+
+      expect(sessionChecks()).toBe(0);
+      expect(router.refresh).not.toHaveBeenCalled();
+    });
+  });
 });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/components/providers/AuthProvider.test.tsx`
Expected: the five tests that expect a session check or a sign-out fail; `ignores other errors` and `does nothing for an anonymous visitor` pass on the old code, as characterization tests.

- [ ] **Step 3: Implement**

Apply to `src/components/providers/AuthProvider.tsx`:

```diff
diff --git a/src/components/providers/AuthProvider.tsx b/src/components/providers/AuthProvider.tsx
index 911557b..3635271 100644
--- a/src/components/providers/AuthProvider.tsx
+++ b/src/components/providers/AuthProvider.tsx
@@ -11,8 +11,10 @@ import React, {
   useState,
 } from "react";
 
+import { useProgressRouter } from "@/hooks/useProgressRouter";
 import { api, ApiError, errorMessage } from "@/lib/api/client";
 import { getCurrentSession, User } from "@/lib/auth/client";
+import * as authApi from "@/lib/auth/contract";
 import * as streamingApi from "@/lib/profile/streaming/contract";
 import { StreamingPreferences } from "@/lib/profile/streaming/types";
 
@@ -37,6 +39,14 @@ interface AuthContextType extends AuthState {
   clearAuth: () => void;
 }
 
+/** The answer to a request made without a valid session. */
+function isSignedOut(error: unknown) {
+  return (
+    error instanceof ApiError &&
+    (error.code === "unauthenticated" || error.code === "invalidSession")
+  );
+}
+
 const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
 export function AuthProvider({ children }: { children: React.ReactNode }) {
@@ -153,6 +163,55 @@ export function AuthProvider({ children }: { children: React.ReactNode }) {
     if (previous !== undefined && previous !== userId) queryClient.clear();
   }, [state.loading, userId, queryClient]);
 
+  // A query or mutation answered 401: the session may have expired, or been
+  // revoked from another device, while this page was open. Ask the server. If
+  // it confirms the session is gone, drop the user (which clears the cache above) and
+  // refresh the route, so an authenticated page's `requireUser` redirects to
+  // /auth with this page as `?redirect`. Only while a user is held: an
+  // anonymous visitor's 401s are expected. One check at a time, because a
+  // dead session fails every request on the page at once.
+  const router = useProgressRouter();
+  const heldUser = useRef(false);
+  useEffect(() => {
+    heldUser.current = state.user !== null;
+  }, [state.user]);
+  const checkingSession = useRef(false);
+  useEffect(() => {
+    const onError = async (error: unknown) => {
+      if (!isSignedOut(error) || !heldUser.current || checkingSession.current) {
+        return;
+      }
+      checkingSession.current = true;
+      try {
+        await api(authApi.getSession);
+      } catch (sessionError) {
+        // Only the server saying so ends the session; a failed check does not.
+        if (isSignedOut(sessionError)) {
+          clearAuth();
+          router.refresh();
+        }
+      } finally {
+        checkingSession.current = false;
+      }
+    };
+    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
+      if (event.type === "updated" && event.action.type === "error") {
+        void onError(event.action.error);
+      }
+    });
+    const unsubscribeMutations = queryClient
+      .getMutationCache()
+      .subscribe((event) => {
+        if (event.type === "updated" && event.action.type === "error") {
+          void onError(event.action.error);
+        }
+      });
+    return () => {
+      unsubscribeQueries();
+      unsubscribeMutations();
+    };
+  }, [queryClient, clearAuth, router]);
+
   // Load streaming preferences once the user is known. The guard is
   // `streamingLoaded`, not `streamingPreferences`: a failed request leaves the
   // preferences null and clears the loading flag, which restores the entry
```

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run src/components/providers`
Expected: all pass, and `pnpm typecheck` and `pnpm lint:ci` are clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sign out and redirect when a request finds the session expired"
```

### Task 2: Lint and consistency guards

**Files:**
- Modify: `eslint.config.mjs`, `src/components/profile/DataExportImport.tsx`, `src/components/series-finale/ShareButton.tsx`
- Test: `src/lib/api/contracts.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `fetch` lint rule and the route wrapper test.

The new route test reads route files as text, like the contract test above it, so it loads no database code. The two exempt `fetch` calls disable the rule on their line rather than per file, so the rest of each file stays covered.

- [ ] **Step 1: Write the failing tests**

Apply to `src/lib/api/contracts.test.ts`:

```diff
diff --git a/src/lib/api/contracts.test.ts b/src/lib/api/contracts.test.ts
index 99475c1..351528c 100644
--- a/src/lib/api/contracts.test.ts
+++ b/src/lib/api/contracts.test.ts
@@ -58,3 +58,43 @@ describe("contracts", () => {
     );
   });
 });
+
+const API = path.join(process.cwd(), "src/app/api");
+
+const routeFiles = readdirSync(API, { recursive: true, encoding: "utf8" })
+  .filter((entry) => /^route\.tsx?$/.test(path.basename(entry)))
+  .map((entry) => entry.split(path.sep).join("/"));
+
+/**
+ * Routes `authedRoute` and `publicRoute` do not fit: the share card answers
+ * with a PNG, and import reads a multipart upload. Both still use `withAuth`.
+ */
+const NOT_ON_A_WRAPPER = [
+  "series-finale/[period]/card/route.tsx",
+  "profile/import/route.ts",
+];
+
+const HANDLER = /export (?:const|(?:async )?function) (GET|POST|PUT|PATCH|DELETE)\b(.*)/g;
+
+describe("routes", () => {
+  it("finds routes to check", () => {
+    expect(routeFiles.length).toBeGreaterThan(0);
+  });
+
+  it.each(NOT_ON_A_WRAPPER)("%s still exists", (file) => {
+    expect(routeFiles).toContain(file);
+  });
+
+  // Read as text so this test does not load database code.
+  it.each(routeFiles.filter((file) => !NOT_ON_A_WRAPPER.includes(file)))(
+    "%s uses authedRoute or publicRoute for every method",
+    (file) => {
+      const source = readFileSync(path.join(API, file), "utf8");
+      const handlers = [...source.matchAll(HANDLER)];
+      expect(handlers.length, "no route handlers found").toBeGreaterThan(0);
+      for (const [, method, rest] of handlers) {
+        expect(rest, method).toMatch(/^ = (authedRoute|publicRoute)\(/);
+      }
+    },
+  );
+});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/lib/api/contracts.test.ts`
Expected: it passes on the current tree: every route except the two allowlisted ones already uses a wrapper. It is a guard against regressions. To see it fail, temporarily add `src/app/api/zzprobe/route.ts` exporting `export async function GET() { return Response.json({}); }`, run the test, see `zzprobe/route.ts uses authedRoute or publicRoute for every method` fail, then delete the probe directory.

- [ ] **Step 3: Add the lint rule and the two exemptions**

Apply to `eslint.config.mjs`:

```diff
diff --git a/eslint.config.mjs b/eslint.config.mjs
index 5602fb0..d5ae797 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -118,6 +118,31 @@ const config = [
       ],
     },
   },
+  {
+    // Components and hooks call the API through `api()` and a contract, which
+    // gives them typed inputs, typed error codes and an always-read body. The
+    // two responses `api()` cannot handle, the share card's PNG and the import's
+    // multipart upload, disable this on their line.
+    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
+    ignores: ["**/*.test.ts", "**/*.test.tsx"],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        {
+          name: "fetch",
+          message: "Use api() from @/lib/api/client with the endpoint's contract.",
+        },
+      ],
+      "no-restricted-properties": [
+        "error",
+        ...["window", "globalThis", "self"].map((object) => ({
+          object,
+          property: "fetch",
+          message: "Use api() from @/lib/api/client with the endpoint's contract.",
+        })),
+      ],
+    },
+  },
   {
     // A contract is imported by client code, so it must not reach server modules.
     files: ["src/lib/**/contract.ts"],
```

Apply to `src/components/profile/DataExportImport.tsx`:

```diff
diff --git a/src/components/profile/DataExportImport.tsx b/src/components/profile/DataExportImport.tsx
index 7d3b024..8a24468 100644
--- a/src/components/profile/DataExportImport.tsx
+++ b/src/components/profile/DataExportImport.tsx
@@ -94,6 +94,8 @@ export function DataExportImport() {
       const formData = new FormData();
       formData.append("file", file);
       formData.append("format", "json");
+      // A multipart upload, which api() does not send.
+      // eslint-disable-next-line no-restricted-globals
       const response = await fetch("/api/profile/import", {
         method: "POST",
         body: formData,
```

Apply to `src/components/series-finale/ShareButton.tsx`:

```diff
diff --git a/src/components/series-finale/ShareButton.tsx b/src/components/series-finale/ShareButton.tsx
index 9b1de0d..005820d 100644
--- a/src/components/series-finale/ShareButton.tsx
+++ b/src/components/series-finale/ShareButton.tsx
@@ -22,6 +22,8 @@ function errorName(error: unknown): string | undefined {
 }
 
 async function fetchCardFile(period: string): Promise<File> {
+  // A PNG, which api() does not read.
+  // eslint-disable-next-line no-restricted-globals
   const response = await fetch(`/api/series-finale/${period}/card`);
   if (!response.ok) throw new Error(`Card failed: ${response.status}`);
 
```

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run src/lib/api/contracts.test.ts && pnpm lint:ci`
Expected: all pass, and `pnpm typecheck` and `pnpm lint:ci` are clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ban raw fetch in components and hooks, and require route wrappers"
```

### Task 3: Import error codes, required `code`, and `validatePagination` removal

**Files:**
- Modify: `src/app/api/profile/import/route.ts`, `src/lib/auth/api-middleware.ts`, `docs/api/openapi.yaml`
- Test: `src/app/api/profile/import/route.test.ts` (new)

**Interfaces:**
- Consumes: `ApiErrorBody` from `@/lib/api/errors`.
- Produces: import error codes `validation`, `tooLarge`, `invalidFile`, `internal`.

Import stays on `withAuth` because it reads a multipart upload and checks the size before reading it. Its messages and statuses do not change; each body gains `code`, and the two 400s for missing fields gain `issues`. Nothing imports `validatePagination` any more.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/profile/import/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1", username: "benjamin" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const importUserData = vi.fn();
vi.mock("@/lib/profile/data/service", () => ({
  importUserData: (...args: unknown[]) => importUserData(...args),
}));

const { POST } = await import("./route");

function upload(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new NextRequest("http://localhost/api/profile/import", {
    method: "POST",
    headers: { cookie: "session=valid" },
    body: form,
  });
}

const json = (content: string) =>
  new File([content], "export.json", { type: "application/json" });

describe("POST /api/profile/import", () => {
  beforeEach(() => {
    importUserData.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("imports the file for the signed-in user", async () => {
    importUserData.mockResolvedValue({ imported: 1 });

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 1 });
    expect(importUserData).toHaveBeenCalledWith("user-1", "{}");
  });

  it.each([
    [{ format: "json" }, "file", "File is required"],
    [{ file: json("{}"), format: "csv" }, "format", "Only JSON format is supported for imports"],
  ])("rejects %j as a validation error", async (fields, path, message) => {
    const response = await POST(upload(fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: message,
      code: "validation",
      issues: [{ path, message }],
    });
  });

  it("answers tooLarge for a file over 1 MB", async () => {
    const response = await POST(
      upload({ file: json("x".repeat(1024 * 1024 + 1)), format: "json" }),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("tooLarge");
    expect(importUserData).not.toHaveBeenCalled();
  });

  it.each([
    ["parseError", 400, "invalidFile"],
    ["tooLarge", 413, "tooLarge"],
  ])("maps %s to %i %s", async (result, status, code) => {
    importUserData.mockResolvedValue(result);

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("answers internal when the import throws", async () => {
    importUserData.mockRejectedValue(new Error("db down"));

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to import data",
      code: "internal",
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/profile/import`
Expected: the success test passes; the tests asserting `code` fail because the old bodies have none.

- [ ] **Step 3: Implement**

Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index 4e7a898..3838835 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -38,7 +38,7 @@ components:
   schemas:
     ErrorResponse:
       type: object
-      required: [error]
+      required: [error, code]
       properties:
         error:
           type: string
@@ -2799,7 +2799,13 @@ paths:
               schema:
                 $ref: "#/components/schemas/ImportResult"
         "400":
-          description: Validation or parse error
+          description: "`validation` for a missing file or a format other than json; `invalidFile` when the file is not valid JSON"
+          content:
+            application/json:
+              schema:
+                $ref: "#/components/schemas/ErrorResponse"
+        "413":
+          description: "`tooLarge`: the file is over 1 MB or has too many entries"
           content:
             application/json:
               schema:
```

Apply to `src/app/api/profile/import/route.ts`:

```diff
diff --git a/src/app/api/profile/import/route.ts b/src/app/api/profile/import/route.ts
index 8861099..6029639 100644
--- a/src/app/api/profile/import/route.ts
+++ b/src/app/api/profile/import/route.ts
@@ -1,53 +1,62 @@
 import { NextResponse } from "next/server";
 
-import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
+import type { ApiErrorBody } from "@/lib/api/errors";
+import { AuthenticatedRequest, withAuth } from "@/lib/auth/api-middleware";
 import { importUserData } from "@/lib/profile/data/service";
 
 // Maximum accepted import file size (API-03). Reject anything larger before
 // reading it into memory or processing it.
 const MAX_IMPORT_BYTES = 1024 * 1024; // 1 MB
 
-// POST /api/profile/import - Import user's lists data from JSON only
+function failure(status: number, body: ApiErrorBody) {
+  return NextResponse.json(body, { status });
+}
+
+function invalidField(path: string, message: string) {
+  return failure(400, {
+    error: message,
+    code: "validation",
+    issues: [{ path, message }],
+  });
+}
+
+// POST /api/profile/import - Import user's lists data from JSON only. A
+// multipart upload, so it stays on `withAuth` rather than a contract, but its
+// errors carry the same `code`s.
 export const POST = withAuth(async (request: AuthenticatedRequest) => {
   try {
     const formData = await request.formData();
     const file = formData.get("file") as File;
     const format = formData.get("format") as string;
     if (!file) {
-      return NextResponse.json({ error: "File is required" }, { status: 400 });
+      return invalidField("file", "File is required");
     }
     if (!format || format !== "json") {
-      return NextResponse.json(
-        { error: "Only JSON format is supported for imports" },
-        { status: 400 }
-      );
+      return invalidField("format", "Only JSON format is supported for imports");
     }
     if (file.size > MAX_IMPORT_BYTES) {
-      return NextResponse.json(
-        { error: "Import file is too large (max 1MB)" },
-        { status: 413 }
-      );
+      return failure(413, {
+        error: "Import file is too large (max 1MB)",
+        code: "tooLarge",
+      });
     }
     const fileContent = await file.text();
     const result = await importUserData(request.user.id, fileContent);
     if (result === "parseError") {
-      return NextResponse.json(
-        { error: `Failed to parse JSON file` },
-        { status: 400 }
-      );
+      return failure(400, {
+        error: "Failed to parse JSON file",
+        code: "invalidFile",
+      });
     }
     if (result === "tooLarge") {
-      return NextResponse.json(
-        { error: "Import file contains too many entries" },
-        { status: 413 }
-      );
+      return failure(413, {
+        error: "Import file contains too many entries",
+        code: "tooLarge",
+      });
     }
     return NextResponse.json(result);
   } catch (error) {
     console.error("Import data error:", error);
-    return NextResponse.json(
-      { error: "Failed to import data" },
-      { status: 500 }
-    );
+    return failure(500, { error: "Failed to import data", code: "internal" });
   }
 });
```

Apply to `src/lib/auth/api-middleware.ts`:

```diff
diff --git a/src/lib/auth/api-middleware.ts b/src/lib/auth/api-middleware.ts
index b2ee58b..f537e7b 100644
--- a/src/lib/auth/api-middleware.ts
+++ b/src/lib/auth/api-middleware.ts
@@ -104,28 +104,3 @@ export function handleApiError(error: unknown, context: string): NextResponse {
     { status: 500 },
   );
 }
-
-/**
- * Utility function to validate pagination parameters
- * @param page - Page number from query params
- * @param maxPage - Maximum allowed page number (default: 1000)
- * @returns Validation result with page number or error response
- */
-export function validatePagination(
-  page: string | null,
-  maxPage: number = 1000,
-): { page: number; error?: NextResponse } {
-  const pageNum = parseInt(page || "1");
-
-  if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPage) {
-    return {
-      page: 1,
-      error: NextResponse.json(
-        { error: `Page must be between 1 and ${maxPage}` },
-        { status: 400 },
-      ),
-    };
-  }
-
-  return { page: pageNum };
-}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run src/app/api/profile src/lib/auth`
Expected: all pass, and `pnpm typecheck` and `pnpm lint:ci` are clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: give import errors codes, require code in the API docs, drop validatePagination"
```

### Task 4: Docs and the client user projection

**Files:**
- Modify: `docs/api/conventions.md`, `docs/architecture/routing-and-rendering.md`, `docs/architecture/state-and-data-flow.md`, `docs/auth/overview.md`, `docs/domain/{activity,content-status,episodes,lists,profile,schedules,series-finale}.md`, `docs/runbooks/troubleshooting.md`, `src/app/(authenticated)/requireUser.ts`
- Test: `src/app/(authenticated)/requireUser.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

`toClientUser` sent `""` for a missing picture because the client type used to be `string`. Since layer 7 the client type is `string | null`, like the session route, so it now passes `null` through. Every consumer tests the value for truthiness. The docs also correct two existing errors: there is no authenticated route-group layout, and pages are guarded by `requireUser`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/app/(authenticated)/requireUser.test.tsx`:

```diff
diff --git a/src/app/(authenticated)/requireUser.test.tsx b/src/app/(authenticated)/requireUser.test.tsx
index 972da97..9b6b588 100644
--- a/src/app/(authenticated)/requireUser.test.tsx
+++ b/src/app/(authenticated)/requireUser.test.tsx
@@ -110,6 +110,10 @@ describe("toClientUser", () => {
     updatedAt: new Date("2024-01-01T00:00:00.000Z"),
   };
 
+  it("keeps a missing profile picture null, as the session route does", () => {
+    expect(toClientUser(dbUser).profilePictureUrl).toBeNull();
+  });
+
   it("mirrors shareStatsWithCollaborators", () => {
     expect(toClientUser(dbUser).shareStatsWithCollaborators).toBe(false);
     expect(
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/\(authenticated\)/requireUser.test.tsx`
Expected: `keeps a missing profile picture null, as the session route does` fails: it receives `""`.

- [ ] **Step 3: Update the docs and the projection**

Apply to `docs/api/conventions.md`:

```diff
diff --git a/docs/api/conventions.md b/docs/api/conventions.md
index d60cc00..fef649b 100644
--- a/docs/api/conventions.md
+++ b/docs/api/conventions.md
@@ -2,178 +2,195 @@
 
 This repository implements HTTP APIs as Next.js App Router route handlers under `src/app/api/**/route.ts`.
 
-All endpoints are JSON APIs and should respond using `NextResponse.json(...)` with stable, client-friendly payload shapes and status codes.
+Every endpoint is described by a **contract**: its method, path, inputs, response type and failure codes. The server wraps its handler with the contract, and client code calls it through `api()` with the same contract, so both sides agree on types and error codes at compile time.
 
 ## Location & Naming
 
 - Route handlers live under `src/app/api/<path>/route.ts`.
-- Each file can export one or more HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) supported by that route.
+- Each file exports one or more HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
+- A feature keeps its API pieces in `src/lib/<feature>/`:
+  - `contract.ts`: the contracts. Client-safe: client code imports it.
+  - `schemas.ts`: the Zod schemas. Server-only.
+  - `types.ts`: request and response types.
+  - `service.ts`: business logic and data access.
+- Contracts are named after the service function they call (`getSchedules`, `addSchedule`) and imported by namespace: `import * as schedulesApi from "@/lib/schedules/contract"`.
 
-## Handler Shapes
-
-There are two common handler shapes in this codebase:
-
-### Public routes
-
-Public endpoints export standard route handler functions:
-
-```ts
-export async function GET(request: NextRequest) {
-  return NextResponse.json({ ... });
-}
-```
-
-Example: [auth/session/route.ts](../../src/app/api/auth/session/route.ts)
-
-### Authenticated routes
-
-Authenticated endpoints must wrap their handler with `withAuth`, which guarantees a user and injects it as `request.user`:
+## Contracts and Schemas
 
 ```ts
-import { AuthenticatedRequest, withAuth } from "@/lib/auth/api-middleware";
-
-export const GET = withAuth(async (request: AuthenticatedRequest) => {
-  const userId = request.user.id;
-  return NextResponse.json({ userId });
+// src/lib/schedules/schemas.ts - server only
+export const addScheduleSchemas = {
+  body: z.object({
+    tmdbId: z.number().int().positive(),
+    dayOfWeek: z.number().int().min(0).max(6),
+  }),
+};
+
+// src/lib/schedules/contract.ts - client-safe; the schemas import is type-only
+import type { addScheduleSchemas } from "./schemas";
+
+export const addSchedule = defineContract({
+  method: "POST",
+  path: "/api/schedules",
+  label: "Add show to schedule",
+  status: 201,
+  schemas: schemas<typeof addScheduleSchemas>(),
+  response: type<ScheduleItem>(),
+  errors: {
+    notFound: { status: 404, message: "TV show not found in your library. ..." },
+    duplicate: { status: 409, message: "Show is already scheduled for this day" },
+  },
 });
 ```
 
-Example: [lists/route.ts](../../src/app/api/lists/route.ts)
-
-## Business Logic & Data Access
-
-Keep route handlers thin:
+| Field | Required | Purpose |
+| --- | --- | --- |
+| `method`, `path` | Yes | `path` uses folder syntax, e.g. `/api/lists/[id]/items`. |
+| `label` | Yes | Used for logging and the 500 message, `"<label> failed"`. |
+| `schemas` | No | `schemas<typeof x>()`, pointing at the endpoint's `{ params, query, body }` schemas by type. `params` keys must equal the path's `[segments]`. |
+| `response` | Yes | `type<T>()`. `T` must be an object or array type. |
+| `status` | No | Success status, defaulting to 200. |
+| `errors` | No | The route's own failure codes, each with a status and a message. |
 
-- Put business logic in `src/lib/<feature>/service.ts` (and related `types.ts`) and call those functions from the route handler.
-- Use the shared Drizzle database instance from `src/lib/db` for queries/transactions.
+Contracts reference schemas with `import type`, which is erased. A runtime import of Zod or a `schemas.ts` from client code adds about 55 KB gzipped to the bundle, so lint rules forbid it in contracts, components and hooks. A contract must not import server modules either (`db`, `service`, `next/server`).
 
-Examples:
+### Validation
 
-- List operations live in [lists/service.ts](../../src/lib/lists/service.ts) and are called by [lists/route.ts](../../src/app/api/lists/route.ts).
-- Database wiring is defined in [db/index.ts](../../src/lib/db/index.ts).
+- Params that hold a `uuid` primary key use `z.uuid()`, so a malformed ID is a 400 instead of reaching Postgres. TMDB IDs are integers.
+- Query strings are converted to an object first: `?x=` counts as absent, and a repeated key becomes an array. Use the helpers in [query.ts](../../src/lib/api/query.ts):
+  - `q.int({ min, max })` accepts whole digit strings only (`12abc`, `2.5` and `""` fail). Use it for `page`, `limit` and numeric IDs in queries.
+  - `q.list(schema)` accepts one value or many and outputs an array. `q.list(schema, { dropInvalid: true })` silently drops invalid elements.
+  - An optional param with a default that also tolerates bad values: `z.enum([...]).default("x").catch("x")`.
+- Reject input that is nonsense or would crash; keep leniency that is deliberate, such as unknown filter values in old URLs.
+- Messages users see need custom wording in the schema. Zod's defaults are not written for end users.
 
-## Authentication
+## Handler Shapes
 
-Most endpoints require authentication via the `session` cookie (httpOnly).
+```ts
+export const POST = authedRoute(
+  schedulesApi.addSchedule,
+  addScheduleSchemas,
+  ({ user, body }) => createSchedule(user.id, body),
+);
+```
 
-- Auth middleware: [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
-- Wrapper: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)
-- Injected type: [AuthenticatedRequest](../../src/lib/auth/api-middleware.ts#L7-L13)
+`authedRoute(contract, schemas, handler, options?)` and `publicRoute(contract, schemas, handler, options?)` from [route.ts](../../src/lib/api/route.ts) return the Next route handler. The schemas are passed at runtime because the contract holds only their type; a contract with no schemas passes `{}`. In order, the wrapper:
 
-Behavior:
+1. **Authenticates** (`authedRoute` only) through `withAuth`. This runs before validation, so anonymous callers learn nothing about the inputs.
+2. **Validates** the route params, then the query, then the body. Unparseable JSON is a validation failure.
+3. **Calls the handler** with `{ request, user, params, query, body }`, all parsed and typed. `user` is absent for `publicRoute`.
+4. **Builds the response** from what the handler returned:
+   - an object or array becomes JSON with the contract's status;
+   - a string must be one of the contract's `errors` keys and becomes that error;
+   - a `NextResponse` passes through untouched, for responses that set cookies.
+5. **Catches anything thrown** and passes it to `handleApiError` with the contract's `label`.
 
-- Missing `session` cookie: `401 { "error": "Authentication required" }`
-- Invalid session: `401 { "error": "Invalid session" }` and the `session` cookie is cleared
-- Middleware failures: `500 { "error": "Authentication failed" }`
+`options.headers` sets headers on every response, including 401s and errors. The Series Finale routes use it for `Cache-Control: private, no-store`.
 
-Exceptions:
+A test in [contracts.test.ts](../../src/lib/api/contracts.test.ts) requires every route to use one of the two wrappers, and every contract to have a route exporting its method.
 
-- Some auth-adjacent endpoints (e.g. session inspection/update) manually read the cookie rather than using `withAuth`. See [auth/session/route.ts](../../src/app/api/auth/session/route.ts).
+Keep handlers thin: put business logic in `src/lib/<feature>/service.ts` and use the shared Drizzle instance from [db/index.ts](../../src/lib/db/index.ts). Services return a failure code string (`"notFound"`) and the route returns it as is.
 
-### Admin authentication (header-based)
+### Routes that do not fit
 
-Admin endpoints do not use `withAuth`. They authenticate using a shared secret in the `x-admin-secret` request header and compare it to `process.env.ADMIN_API_SECRET`.
+| Route | Approach |
+| --- | --- |
+| `series-finale/[period]/card` | Returns a PNG, so it has no contract. Uses `withAuth` directly and validates its period with the shared schema. |
+| `profile/import` | Reads a multipart upload and checks its size before reading it. Uses `withAuth` directly; its errors still carry a `code`. |
+| `auth/*` routes that set cookies | Return `NextResponse.json(data satisfies T)` with the cookies set. |
+| `auth/signout` | Has no body schema: it reads an optional body itself and tolerates a bad one. |
+| `admin/device-claim` | `publicRoute` with no body schema. It checks the `x-admin-secret` header in constant time and logs failed attempts first, then parses the body with `adminDeviceClaimBody` and `invalidInput()`. A body schema would answer unauthorized callers with schema issues and skip the audit log. |
 
-Example: [admin/device-claim/route.ts](../../src/app/api/admin/device-claim/route.ts)
+## Authentication
 
-## Request Parsing & Validation
+Most endpoints require the `session` cookie (httpOnly). `authedRoute` uses `withAuth` from [api-middleware.ts](../../src/lib/auth/api-middleware.ts), which answers:
 
-General guidelines:
+- missing `session` cookie: `401 { "error": "Authentication required", "code": "unauthenticated" }`;
+- invalid session: `401 { "error": "Invalid session", "code": "invalidSession" }`, and the cookie is cleared;
+- failure while checking the session: `500 { "error": "Authentication failed", "code": "internal" }`.
 
-- Parse query parameters using `new URL(request.url).searchParams`.
-- Parse JSON bodies using `await request.json()` (for `POST`/`PUT`/`PATCH`).
-- Validate inputs early and return a `400` with `{ error: string }` when invalid.
-- Use `409` for uniqueness/constraint conflicts (e.g. username already taken).
+Admin endpoints authenticate with a shared secret in the `x-admin-secret` header, compared to `process.env.ADMIN_API_SECRET`. See [admin/device-claim/route.ts](../../src/app/api/admin/device-claim/route.ts).
 
-Examples:
+## Responses
 
-- Query parameter validation: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts)
-- Body validation + conflict: [auth/session/route.ts](../../src/app/api/auth/session/route.ts)
+### Success
 
-### Path parameters
+Success responses are JSON objects or arrays, typed by the contract's `response`. Common patterns:
 
-When working with dynamic routes (e.g. `src/app/api/lists/[id]/route.ts`), path parameters are currently extracted by parsing `request.url` and splitting the pathname.
+- wrapped resources: `{ list: ... }`, `{ lists: [...] }`, `{ user: ... }`;
+- direct payloads for query endpoints, such as the activity timeline or TMDB search results.
 
-This is the existing convention for authenticated routes because `withAuth` currently wraps handlers in a way that does not expose the App Router handler context (`{ params }`) to the inner handler.
+The client receives `Jsonify<T>`: a `Date` in `T` arrives as a `string`.
 
-Potential improvement: extend `withAuth` to support the full route handler signature (including context/params) so new code can use typed params instead of string-splitting.
+### Errors
 
-## Response Conventions
+Every failure has this shape:
 
-### Success responses
+```json
+{ "error": "Human-readable message", "code": "notFound", "issues": [{ "path": "id", "message": "..." }] }
+```
 
-Success responses are JSON. Common patterns:
+`code` is always present; branch on it, never on `error`. `issues` is present only for `validation`. Never return raw upstream errors or stack traces.
 
-- Wrapped resource(s): `{ list: ... }`, `{ lists: [...] }`, `{ user: ... }`
-- Direct typed payloads for query endpoints: some endpoints return a typed object directly (e.g. activity timeline or TMDB search results)
+Any route can return these codes, in addition to its contract's own:
 
-Examples:
+| Code | Status | Source |
+| --- | --- | --- |
+| `validation` | 400 | The wrapper. `error` is the first issue's message; `issues` lists all of them. |
+| `unauthenticated` | 401 | `withAuth`, no cookie. |
+| `invalidSession` | 401 | `withAuth`, bad session. |
+| `rateLimited` | 429 | `handleApiError` for a TMDB 429, and the proxy's rate limit. |
+| `internal` | 500 | `handleApiError` for unknown failures (`"<label> failed"`), and `withAuth`. |
+| `upstreamUnavailable` | 503 | `handleApiError` for other TMDB failures. |
 
-- Wrapped lists: [lists/route.ts](../../src/app/api/lists/route.ts)
-- Direct payload (activity): [activity/route.ts](../../src/app/api/activity/route.ts)
-- Direct payload (TMDB search): [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts)
+## Calling the API from the client
 
-If an endpoint creates a resource, return `201` when appropriate.
+```ts
+const schedule = await api(schedulesApi.addSchedule, {
+  body: { tmdbId, dayOfWeek },
+});
+```
 
-### Error responses
+`api(contract, input?, { signal }?)` from [client.ts](../../src/lib/api/client.ts) builds the URL (encoding `params`, writing arrays as repeated `query` keys), sends `body` as JSON, always reads the response body, and returns `Jsonify<T>`. It does not validate on the client; the server is the authority.
 
-Error responses must use the shape:
+On any failure it throws `ApiError` with `code`, `status`, `message` and `issues`. Two codes exist only on the client: `network` (the request never got a response, `status` 0) and `invalidResponse` (the body was not an error body, such as a proxy's HTML page).
 
-```json
-{ "error": "Human-readable message" }
+```ts
+onError: (err) => {
+  if (isApiError(err, schedulesApi.addSchedule) && err.code === "duplicate") { ... }
+  setError(errorMessage(err, "Failed to add schedule"));
+},
 ```
 
-Avoid returning raw upstream errors or stack traces to clients.
+`isApiError(err, contract)` narrows `code` to that contract's codes plus the universal ones. `errorMessage(err, fallback)` gives the error's message or the fallback.
+
+- Inside React Query, pass the query's `signal`: `queryFn: ({ signal }) => api(contract, input, { signal })`. The default retry policy retries once, but never a 4xx `ApiError`.
+- A lint rule bans the `fetch` global in `src/components` and `src/hooks`. The share card's PNG download and the import upload disable it on their line, since `api()` handles neither.
+- When a query or mutation fails with `unauthenticated` or `invalidSession` while a user is signed in, `AuthProvider` re-checks the session. If the server confirms it is gone, the user is signed out and the page refreshes, so an authenticated page redirects to `/auth`.
 
 ## Common Status Codes
 
 - `200`: success
 - `201`: created
-- `400`: validation errors, missing parameters, malformed requests
+- `400`: validation errors, malformed requests
 - `401`: unauthenticated, invalid session, invalid admin secret
-- `404`: resource not found (or user does not have access, depending on endpoint semantics)
+- `404`: resource not found (or not visible to this user)
 - `409`: conflict (e.g. uniqueness constraints)
-- `429`: rate-limited (primarily external integrations)
+- `413`: upload too large
+- `429`: rate-limited
 - `500`: unexpected server error
 - `503`: external service unavailable (e.g. TMDB)
 
 ## Pagination
 
-This codebase uses two pagination styles:
-
 ### Page-based (`page`)
 
-Integration-backed endpoints often accept a `page` query param and validate it with the shared helper:
-
-- [validatePagination](../../src/lib/auth/api-middleware.ts#L94-L111)
-- Example usage: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts#L50-L56)
-
-Typical responses include `page`, `totalPages`, and `totalResults` when mirroring upstream pagination.
+TMDB-backed endpoints accept a `page` query param, validated with `q.int({ min: 1, max: 1000 })`, and return `page`, `totalPages` and `totalResults` from upstream. Example: [tmdb/search](../../src/lib/tmdb/schemas.ts).
 
 ### Cursor-based (`cursor` + `limit`)
 
-Some “timeline” endpoints use cursor pagination with `cursor` and `limit`, returning `nextCursor` / `hasMore` as part of the payload.
-
-Example: [activity/route.ts](../../src/app/api/activity/route.ts)
-
-## Error Helpers (External Integrations)
-
-When an endpoint depends on an external integration (e.g. TMDB), use the shared error normalizer so clients get stable responses:
-
-- [handleApiError](../../src/lib/auth/api-middleware.ts#L66-L86)
-
-`handleApiError(error, context)` maps common upstream failures to:
-
-- `503 { error: "External service unavailable" }` for TMDB failures
-- `429 { error: "Rate limit exceeded. Please try again later." }` for rate limits
-- `500 { error: "<context> failed" }` for unknown failures
-
-Example usage: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts#L99-L101)
+Timeline endpoints use `cursor` and `limit`, returning `nextCursor` / `hasMore`. Example: [activity/route.ts](../../src/app/api/activity/route.ts).
 
 ## OpenAPI
 
-The repository includes an OpenAPI 3.1 schema describing the API surface:
-
-- [openapi.yaml](./openapi.yaml)
-
-The spec is maintained manually. When adding or changing endpoints, keep the OpenAPI schema in sync (including the appropriate security scheme: cookie-based `session` vs `x-admin-secret`).
+[openapi.yaml](./openapi.yaml) describes the API surface in OpenAPI 3.1. It is maintained by hand: when adding or changing an endpoint, update it too, including its error codes and security scheme (cookie `session` or `x-admin-secret`).
```

Apply to `docs/architecture/routing-and-rendering.md`:

```diff
diff --git a/docs/architecture/routing-and-rendering.md b/docs/architecture/routing-and-rendering.md
index 4f18982..0091d34 100644
--- a/docs/architecture/routing-and-rendering.md
+++ b/docs/architecture/routing-and-rendering.md
@@ -5,7 +5,7 @@ WatchThis uses the Next.js App Router with route groups to separate public and a
 ## Route Groups
 
 - **Public**: `src/app/(public)` contains public routes and layout.
-- **Authenticated**: `src/app/(authenticated)` contains protected pages and a wrapper layout.
+- **Authenticated**: `src/app/(authenticated)` contains protected pages, each guarded by `requireUser`.
 
 Route-group directory names (like `(authenticated)`) are not part of the URL path; they are only for organization. For example, `src/app/(authenticated)/dashboard/page.tsx` routes to `/dashboard`.
 
@@ -22,13 +22,13 @@ Practical examples:
 
 There are two distinct enforcement layers:
 
-- **API protection** is enforced on the server using `withAuth` in `src/lib/auth/api-middleware.ts`.
-- **Page protection** is primarily handled via the authenticated route-group layout.
+- **API protection** is enforced on the server by `authedRoute`, which authenticates through `withAuth` before validating any input.
+- **Page protection** is enforced during each authenticated page's server render by `requireUser(pathname)`, which redirects to `/auth?redirect=<path>`. If the session expires while a page is open, `AuthProvider` refreshes the route so the same check runs.
 
 Relevant code:
 
-- Authenticated layout: [layout.tsx](../../src/app/%28authenticated%29/layout.tsx)
-- API middleware: [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
+- Page guard: [requireUser.ts](../../src/app/%28authenticated%29/requireUser.ts)
+- API wrappers: [route.ts](../../src/lib/api/route.ts) and [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
 
 ## Rendering Model (Mental Model)
 
```

Apply to `docs/architecture/state-and-data-flow.md`:

```diff
diff --git a/docs/architecture/state-and-data-flow.md b/docs/architecture/state-and-data-flow.md
index c50b3ee..4d64880 100644
--- a/docs/architecture/state-and-data-flow.md
+++ b/docs/architecture/state-and-data-flow.md
@@ -3,7 +3,7 @@
 WatchThis keeps most state server-side (Postgres via Drizzle) and uses client-side state primarily for UI concerns and caching. The high-level mental model is:
 
 - Server components and API routes read/write the database as the source of truth.
-- Client components fetch/mutate via `/api/**` and rely on React Query for caching and request lifecycle.
+- Client components fetch/mutate via `/api/**`, calling `api()` with each endpoint's contract, and rely on React Query for caching and request lifecycle.
 - Authentication state is derived from a `session` cookie (JWT) and exposed to client components via a small auth context.
 
 Related docs: [overview.md](./overview.md), [routing-and-rendering.md](./routing-and-rendering.md)
@@ -12,7 +12,8 @@ Related docs: [overview.md](./overview.md), [routing-and-rendering.md](./routing
 
 - **Server-side source of truth**: persisted domain state lives in Postgres; UI state is ephemeral.
 - **Server components first**: pages render on the server by default; client components are “islands” for interactivity.
-- **Thin API routes**: API handlers mostly validate inputs, call a service, and return JSON.
+- **Thin API routes**: API handlers declare their inputs in a contract, call a service, and return JSON. The wrapper validates the inputs.
+- **One contract per endpoint**: the server route and the client call share a typed contract, so inputs, responses and error codes are checked at compile time. See [conventions.md](../api/conventions.md).
 - **Explicit caching**: React Query caches client fetches; server-side caches exist where external APIs are expensive.
 
 ## Where State Lives
@@ -35,7 +36,7 @@ Authentication is cookie-based:
 Relevant code:
 
 - Session verification + current user: [webauthn.ts](../../src/lib/auth/webauthn.ts)
-- API auth wrapper: [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
+- API route wrappers: [route.ts](../../src/lib/api/route.ts) (`authedRoute`, built on `withAuth` in [api-middleware.ts](../../src/lib/auth/api-middleware.ts))
 
 ### Client Cache (React Query)
 
@@ -44,7 +45,7 @@ Client components use React Query to cache API responses and manage request life
 - Provider: [ReactQueryProvider.tsx](../../src/components/providers/ReactQueryProvider.tsx)
 - Root mount: [app/layout.tsx](../../src/app/layout.tsx)
 
-Default query behavior is intentionally conservative (no refetch-on-focus, low retry count) to reduce surprise network traffic.
+Default query behavior is intentionally conservative to reduce surprise network traffic: no refetch-on-focus, and one retry, never for a 4xx `ApiError`, which a retry cannot fix.
 
 ### Client Context (AuthProvider)
 
@@ -55,6 +56,8 @@ Auth state is held in a small React context for convenience (not as a general ap
 
 In addition to `user/loading/error`, the provider also manages streaming preferences loaded from `/api/profile/streaming`.
 
+It also watches React Query for expired sessions. When a query or mutation fails with `unauthenticated` or `invalidSession` while a user is held, it asks `GET /api/auth/session` once. If the server confirms the session is gone, it drops the user, which clears the query cache, and refreshes the route so the page's `requireUser` redirects to `/auth`. A failed check, or a 401 seen by an anonymous visitor, changes nothing.
+
 ### Local Component State (UI Only)
 
 Short-lived UI state (modal open/closed, input values, tab selection) lives in component state and should not be persisted unless it’s meaningful domain state.
@@ -76,27 +79,29 @@ This means any client component can:
 
 ### Server-Side Enforcement (APIs)
 
-Authenticated API routes should wrap handlers with `withAuth`, which:
+Authenticated API routes use `authedRoute`, which authenticates through `withAuth` before validating any input. `withAuth`:
 
 - Reads the `session` cookie
 - Verifies it and loads the user
-- Injects `request.user` for downstream logic
-- Returns `401` and clears the cookie if invalid
+- Passes the user to the handler
+- Returns `401` (`unauthenticated` or `invalidSession`) and clears the cookie if invalid
 
 Relevant code:
 
-- [withAuth](../../src/lib/auth/api-middleware.ts)
+- [authedRoute](../../src/lib/api/route.ts) and [withAuth](../../src/lib/auth/api-middleware.ts)
 - Example authenticated route: [status/content/route.ts](../../src/app/api/status/content/route.ts)
 
 ### Client-Side Guarding (Pages)
 
-Protected UI routes are grouped under `src/app/(authenticated)` and gated by a client layout that redirects unauthenticated users:
+Protected UI routes are grouped under `src/app/(authenticated)`. Each page calls `requireUser(pathname)` during its server render, which redirects to `/auth?redirect=<path>` when there is no valid session:
 
 Route-group directory names (like `(authenticated)`) are not part of the URL path; they are only for organization.
 
-- Authenticated layout: [src/app/(authenticated)/layout.tsx](../../src/app/%28authenticated%29/layout.tsx)
+- Guard: [requireUser.ts](../../src/app/%28authenticated%29/requireUser.ts)
+
+If a session expires while a page is open, `AuthProvider` refreshes the route once the server confirms it, so the same redirect runs.
 
-Some server pages also read cookies and resolve the current user to prefetch initial data during the server render:
+Server pages also use the resolved user to prefetch initial data during the server render:
 
 - Example: [lists/page.tsx](../../src/app/%28authenticated%29/lists/page.tsx)
 
@@ -125,7 +130,7 @@ sequenceDiagram
 
 ```mermaid
 flowchart LR
-  UI[Client Component] -->|fetch JSON| API[/src/app/api/**/route.ts]
+  UI[Client Component] -->|"api(contract)"| API[/src/app/api/**/route.ts]
   API -->|call| Svc[src/lib/**/service.ts]
   Svc -->|query/update| DB[(Postgres via Drizzle)]
   DB --> Svc
@@ -174,21 +179,19 @@ These server-side caches reduce rate-limit pressure and keep API responses consi
 
 ## Error Handling & API Response Conventions
 
-API routes generally return JSON with appropriate HTTP status codes:
-
-- **Success**: arbitrary JSON payload (`200`, `201`, etc.)
-- **Failure**: `{ error: string }` with a non-2xx status code
+API routes return JSON with appropriate HTTP status codes. The full rules are in [conventions.md](../api/conventions.md).
 
-Shared helper:
-
-- [handleApiError](../../src/lib/auth/api-middleware.ts)
+- **Success**: the contract's response type (`200`, `201`, etc.)
+- **Failure**: `{ error, code, issues? }` with a non-2xx status code. Branch on `code`, never on `error`.
 
 Common patterns:
 
-- **Validation errors**: `400` with `{ error: "..." }`
-- **Not found**: `404` with `{ error: "..." }` (or service returns `"notFound"` and the route maps it)
-- **Auth**: `401` with `{ error: "Authentication required" }` and (when needed) cookie clearing
-- **Upstream issues**: `503` when TMDB is unavailable, `429` when rate-limited (via `handleApiError`)
+- **Validation errors**: `400` `validation`, with `issues` listing each failed field, produced by the route wrapper
+- **Domain failures**: the service returns a code such as `"notFound"`, and the contract maps it to a status and message
+- **Auth**: `401` `unauthenticated` or `invalidSession`, with cookie clearing when needed
+- **Upstream issues**: `503` `upstreamUnavailable` when TMDB is unavailable, `429` `rateLimited` when rate-limited (via [handleApiError](../../src/lib/auth/api-middleware.ts))
+
+On the client, `api()` throws an `ApiError` carrying the same `code`; `isApiError(err, contract)` narrows it to that endpoint's codes.
 
 ## Practical Guidelines
 
```

Apply to `docs/auth/overview.md`:

```diff
diff --git a/docs/auth/overview.md b/docs/auth/overview.md
index a4fa005..0f8c49c 100644
--- a/docs/auth/overview.md
+++ b/docs/auth/overview.md
@@ -139,32 +139,34 @@ Challenge token helpers:
 
 ## Protecting API Routes
 
-Authenticated API routes must wrap their handlers using `withAuth`. This wrapper:
+Authenticated API routes use `authedRoute`, which authenticates through `withAuth` before it validates any input. `withAuth`:
 
 - reads the `session` cookie
 - verifies and resolves the current user (DB lookup)
-- injects `request.user`
-- returns `401` when unauthenticated and clears invalid session cookies
+- passes the user to the handler
+- returns `401` (`unauthenticated` or `invalidSession`) and clears invalid session cookies
 
-Implementation: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)
+Implementation: [authedRoute](../../src/lib/api/route.ts) and [withAuth](../../src/lib/auth/api-middleware.ts)
 
 Example usage:
 
 ```ts
-import { NextResponse } from "next/server";
-import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
+import { authedRoute } from "@/lib/api/route";
+import * as authApi from "@/lib/auth/contract";
 
-async function handler(request: AuthenticatedRequest) {
-  return NextResponse.json({ userId: request.user.id });
-}
-
-export const GET = withAuth(handler);
+export const GET = authedRoute(authApi.getSession, {}, ({ user }) => ({
+  user: sessionUser(user),
+}));
 ```
 
+The two routes that cannot use a contract, the share card's PNG and the multipart import, use `withAuth` directly. See [conventions.md](../api/conventions.md).
+
+When a request made from the browser fails with `unauthenticated` or `invalidSession` while a user is signed in, `AuthProvider` re-checks the session and, if the server confirms it is gone, signs the user out and refreshes the page so `requireUser` redirects to `/auth`.
+
 ## Authenticated Pages and Client Session Hydration
 
-- Client session hydration uses `/api/auth/session` via [AuthProvider](../../src/components/providers/AuthProvider.tsx#L30-L123) and [getCurrentSession](../../src/lib/auth/client.ts#L188-L197).
-- Passkey ceremonies are initiated from the browser via [registerPasskey](../../src/lib/auth/client.ts#L19-L69) and [authenticatePasskey](../../src/lib/auth/client.ts#L72-L110).
+- Client session hydration uses `/api/auth/session` via [AuthProvider](../../src/components/providers/AuthProvider.tsx) and [getCurrentSession](../../src/lib/auth/client.ts).
+- Passkey ceremonies are initiated from the browser via [registerPasskey](../../src/lib/auth/client.ts) and [authenticatePasskey](../../src/lib/auth/client.ts), which call the auth routes through `api()` with the contracts in [contract.ts](../../src/lib/auth/contract.ts).
 
 ## Data Model (Drizzle)
 
@@ -183,4 +185,4 @@ Auth-related tables live in [schema.ts](../../src/lib/db/schema.ts):
 - **Challenge integrity**: the server does not trust a raw client-provided challenge; it only trusts a signed challenge token with a short expiration.
 - **Replay protection**: assertion counters are checked/updated during authentication.
 - **Cookie scope**: challenge cookies are scoped to their respective endpoint paths and use `sameSite: "strict"`.
-- **Session invalidation**: invalid/expired session cookies are proactively deleted by both `withAuth` and `/api/auth/session`.
+- **Session invalidation**: invalid/expired session cookies are proactively deleted by `withAuth`, which every authenticated route, `/api/auth/session` included, runs first.
```

Apply to `docs/domain/activity.md`:

```diff
diff --git a/docs/domain/activity.md b/docs/domain/activity.md
index 0656209..b2bd0e9 100644
--- a/docs/domain/activity.md
+++ b/docs/domain/activity.md
@@ -128,7 +128,7 @@ Collaboration syncing helper (used by status/episode flows): [activityUtils.ts](
 
 Implemented in [route.ts](../../src/app/api/activity/route.ts).
 
-- Authentication: enforced via `withAuth` (cookie session)
+- Authentication: enforced via `authedRoute` (cookie session)
 - Query params:
   - `limit` (number, default `10`): page size
   - `cursor` (string, optional): a `nextCursor` value from a previous response (`<ISO>|<uuid>`, or a bare ISO timestamp from older clients)
```

Apply to `docs/domain/content-status.md`:

```diff
diff --git a/docs/domain/content-status.md b/docs/domain/content-status.md
index 4e95080..e8960e6 100644
--- a/docs/domain/content-status.md
+++ b/docs/domain/content-status.md
@@ -114,7 +114,7 @@ This prevents “completed” from sticking when a new episode has aired since t
 
 ## API: `/api/status/content`
 
-All endpoints are authenticated (wrapped with `withAuth` in [route.ts](../../src/app/api/status/content/route.ts)).
+All endpoints are authenticated (wrapped with `authedRoute` in [route.ts](../../src/app/api/status/content/route.ts)).
 
 - `GET /api/status/content?tmdbId=123&contentType=tv`
   - Response: `{ status: ContentStatusItem | null }`
```

Apply to `docs/domain/episodes.md`:

```diff
diff --git a/docs/domain/episodes.md b/docs/domain/episodes.md
index 3b78450..7c37a6f 100644
--- a/docs/domain/episodes.md
+++ b/docs/domain/episodes.md
@@ -186,7 +186,7 @@ These distinctions are covered by `episodeUtils.test.ts` (“downgrades a comple
 
 ## HTTP API
 
-The episodes domain is exposed via authenticated API routes (all handlers use `withAuth`).
+The episodes domain is exposed via authenticated API routes (all handlers use `authedRoute`).
 
 ### GET /api/status/episodes
 
```

Apply to `docs/domain/lists.md`:

```diff
diff --git a/docs/domain/lists.md b/docs/domain/lists.md
index 138a8c0..448ed05 100644
--- a/docs/domain/lists.md
+++ b/docs/domain/lists.md
@@ -55,7 +55,7 @@ List UI and API responses are hydrated from the TMDB cache (`tmdb_cache`) and en
 
 Lists have two distinct concerns:
 
-1. **API auth**: all `/api/lists/*` routes are protected by `withAuth`, so requests require an authenticated session.
+1. **API auth**: all `/api/lists/*` routes are protected by `authedRoute`, so requests require an authenticated session.
 2. **List authorization**: within services, reads and writes are constrained by list membership.
 
 Authorization rules (as implemented today):
@@ -73,7 +73,7 @@ Authorization rules (as implemented today):
 
 ## API Surface
 
-All endpoints below require authentication (`withAuth`).
+All endpoints below require authentication (`authedRoute`).
 
 | Endpoint                               | Method   | Purpose                                      |
 | -------------------------------------- | -------- | -------------------------------------------- |
```

Apply to `docs/domain/profile.md`:

```diff
diff --git a/docs/domain/profile.md b/docs/domain/profile.md
index e5d6507..9f1d4bf 100644
--- a/docs/domain/profile.md
+++ b/docs/domain/profile.md
@@ -67,7 +67,7 @@ The Profile page is a server component that renders a single client “island”
 
 ## APIs
 
-All profile APIs are authenticated. Profile uses `withAuth` middleware to guarantee `request.user` exists on protected routes.
+All profile APIs are authenticated. Profile routes use `authedRoute`, which guarantees a signed-in user before the handler runs. Import, a multipart upload, uses `withAuth` directly.
 
 ### Session (profile fields)
 
```

Apply to `docs/domain/schedules.md`:

```diff
diff --git a/docs/domain/schedules.md b/docs/domain/schedules.md
index 21acbd3..554cd7e 100644
--- a/docs/domain/schedules.md
+++ b/docs/domain/schedules.md
@@ -57,7 +57,7 @@ Each `ScheduleItem` includes:
 
 ## API
 
-All routes are authenticated using `withAuth` ([route.ts](../../src/app/api/schedules/route.ts)).
+All routes are authenticated using `authedRoute` ([route.ts](../../src/app/api/schedules/route.ts)).
 
 ### GET `/api/schedules`
 
```

Apply to `docs/domain/series-finale.md`:

```diff
diff --git a/docs/domain/series-finale.md b/docs/domain/series-finale.md
index 7a2250a..44a0b0f 100644
--- a/docs/domain/series-finale.md
+++ b/docs/domain/series-finale.md
@@ -275,7 +275,7 @@ All user-facing strings derived from the payload (hero sentence, streak label, p
 
 ## API
 
-All routes require a session (`withAuth`). Every response, including 401s and errors, carries `Cache-Control: private, no-store`, because each URL is shared by every user while the body is per-user.
+All routes require a session: the JSON routes use `authedRoute`, and the PNG card route uses `withAuth` directly. Every response, including 401s and errors, carries `Cache-Control: private, no-store`, because each URL is shared by every user while the body is per-user.
 
 | Method and path | Purpose | Responses |
 | --- | --- | --- |
```

Apply to `docs/runbooks/troubleshooting.md`:

```diff
diff --git a/docs/runbooks/troubleshooting.md b/docs/runbooks/troubleshooting.md
index df8be85..8bcc5db 100644
--- a/docs/runbooks/troubleshooting.md
+++ b/docs/runbooks/troubleshooting.md
@@ -3,9 +3,10 @@
 ## “401 Authentication required” on API routes
 
 - Confirm you have a valid `session` cookie set in the browser.
-- Check the route uses `withAuth` and that you are calling it from the same site/origin that can send cookies.
+- Check the response's `code`: `unauthenticated` means no cookie was sent, `invalidSession` means the cookie was rejected (and has been cleared).
+- Check you are calling the route from the same site/origin that can send cookies.
 
-Reference: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)
+Reference: [authedRoute](../../src/lib/api/route.ts) and [withAuth](../../src/lib/auth/api-middleware.ts)
 
 ## WebAuthn errors during registration/authentication
 
```

Apply to `src/app/(authenticated)/requireUser.ts`:

```diff
diff --git a/src/app/(authenticated)/requireUser.ts b/src/app/(authenticated)/requireUser.ts
index 06db13e..20af8c7 100644
--- a/src/app/(authenticated)/requireUser.ts
+++ b/src/app/(authenticated)/requireUser.ts
@@ -34,17 +34,12 @@ export async function requireUser(pathname: string) {
  * Mirrors the projection in `src/app/api/auth/session/route.ts` field for field
  * -- the two must agree, or a component would see different data depending on
  * whether it was seeded by the server or refreshed by the client.
- *
- * `profilePictureUrl` is nullable in the database but typed as a string on the
- * client. Every consumer tests it for truthiness, so "" and null are already
- * interchangeable there; the API route only gets away with returning null
- * because its JSON response is untyped.
  */
 export function toClientUser(user: DbUser): ClientUser {
   return {
     id: user.id,
     username: user.username,
-    profilePictureUrl: user.profilePictureUrl ?? "",
+    profilePictureUrl: user.profilePictureUrl,
     timezone: user.timezone,
     createdAt: user.createdAt.toISOString(),
     shareStatsWithCollaborators: user.shareStatsWithCollaborators,
```

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run src/app`
Expected: all pass, and `pnpm typecheck` and `pnpm lint:ci` are clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: describe contracts, authedRoute and api() in place of withAuth"
```

### Task 5: Final checks

**Files:** none.

- [ ] **Step 1: Confirm only the two exempt routes skip the wrappers**

Run: `grep -rLE 'authedRoute|publicRoute' --include='route.ts' --include='route.tsx' src/app/api`
Expected: exactly `src/app/api/profile/import/route.ts` and `src/app/api/series-finale/[period]/card/route.tsx`.

- [ ] **Step 2: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,845 passing tests.

- [ ] **Step 3: Check the bundle**

```bash
node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: the largest growth is about 3,600 bytes; the second command prints `0`.

- [ ] **Step 4: Run the e2e suite**

`pnpm e2e:all` with `TMDB_API_KEY` in the environment. Expected: exit 0, as on layer 7.

