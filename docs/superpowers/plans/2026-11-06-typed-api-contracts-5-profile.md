# Typed API Contracts: Profile and Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the passkey device, data export, streaming preferences and activity routes, and their callers, onto typed contracts. This is layer 5 of 8 in the spec's rollout, stacked on PR #60. `profile/import` stays on `withAuth`, as the spec says.

**Architecture:** Each feature folder (`src/lib/profile/devices/`, `profile/data/`, `profile/streaming/`, `activity/`) gains a `contract.ts`, plus a `schemas.ts` where it takes input. The six routes become `authedRoute` calls on the existing services. Callers use `api()`, and `PasskeyDevicesViewer` branches on the `rateLimit` error code instead of matching message text.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, and success response shapes do not change, except that passkey delete and claim cancel return `{ success: true }` instead of the JSON string `"success"`. No caller reads that body, and a bare string would be read as an error code.
- Every error body keeps `error` and adds `code`.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine.
- Bundle: every page's growth stays under 10 kB gzipped against the pre-stack baseline, checked with `node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json` after a build. No chunk contains Zod.
- Contract files never import `@/lib/db`, services, `next/server`, or auth server modules.
- Contracts are named after their service function. Callers use namespace imports such as `import * as devicesApi from "@/lib/profile/devices/contract"`.
- Keep deliberate leniency: streaming's `region` falls back to `country`, country and region codes are case-insensitive, and activity's `limit` falls back to its default instead of being rejected.
- In Vitest commands, pass directory paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,718 tests, plus 30 live checks over HTTP against a real Postgres, including success paths. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/profile/devices/schemas.ts`, `contract.ts` (new) | Passkey device and claim endpoints |
| `src/lib/profile/data/schemas.ts`, `contract.ts` (new) | Export endpoint |
| `src/lib/profile/streaming/schemas.ts`, `contract.ts` (new) | Streaming preference endpoints |
| `src/lib/activity/schemas.ts`, `contract.ts` (new) | Activity timeline endpoint |
| `src/app/api/profile/devices/**`, `export`, `streaming`, `src/app/api/activity` | Rewritten on `authedRoute` |
| `src/lib/auth/client.ts` | `initiatePasskeyClaim` calls `api()` |
| `PasskeyDevicesViewer.tsx` | Calls `api()`; detects rate limiting by `code` |
| `DataExportImport.tsx` | Export calls `api()`; import stays a raw multipart `fetch` |
| `StreamingPreferences.tsx`, `AuthProvider.tsx` | Saving and loading streaming preferences call `api()` |
| `ActivityFeed.tsx`, `ActivityTimelineClient.tsx` | Call `api()` |
| `docs/api/openapi.yaml` | UUID params, the object success body, and the activity `limit` note |

## Behaviour changes, all intended

- **Passkey delete and claim cancel:** both return `{ success: true }` instead of `"success"`. A malformed ID returns 400 instead of 404.
- **Rate-limit detection:** `PasskeyDevicesViewer` shows its "Too many Add Passkey attempts" message for the `rateLimit` code. A different error whose message happens to mention "rate limit" now shows that message as-is.
- **Streaming preferences:** a malformed body returns 400 instead of 500, for example a string `providerId`.
- **Error copy:** activity and device lists show the server's message, or the contract label such as `Get activity timeline failed`, instead of fixed strings. Streaming preference load failures still show `Failed to load streaming preferences (<status>)` when the server answered.

## Known, not changed here

These were found during the live run. They predate the stack, and this plan does not change them:
- Deleting a passkey revokes every session, including the one that made the request (`AUTH-02`), so the user is signed out right after deleting another device.
- Deleting or cancelling an unknown, valid-format passkey or claim ID reports success, because the service updates zero rows. An unknown passkey ID still revokes sessions.

---

### Task 1: Passkey devices and claims

**Files:**
- Create: `src/lib/profile/devices/schemas.ts`, `src/lib/profile/devices/contract.ts`
- Modify: `src/app/api/profile/devices/route.ts`, `src/app/api/profile/devices/[id]/route.ts`, `src/app/api/profile/devices/claims/[id]/route.ts`, `src/lib/auth/client.ts`, `src/components/profile/PasskeyDevicesViewer.tsx`, `src/components/profile/PasskeyDevicesViewer.test.tsx`
- Test: `src/app/api/profile/devices/route.test.ts`

**Interfaces:**
- Consumes: from earlier layers, `defineContract`, `schemas`, `type`, `authedRoute`, `api`, `isApiError`, `errorMessage`, `ApiError`, `routeContext()`.
- Produces: contracts `listDevices`, `initiateClaim`, `deletePasskey`, `cancelClaim`. `initiatePasskeyClaim()` keeps its name and now returns `api(devicesApi.initiateClaim)`.

Both `[id]` params are `uuid` columns (`passkey_credentials.id`, `passkey_claims.id`), not WebAuthn credential IDs.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/profile/devices/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";

const cancelClaim = vi.fn();
const deletePasskey = vi.fn();
const initiateClaim = vi.fn();
const listDevices = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/profile/devices/service", () => ({
  cancelClaim: (...args: unknown[]) => cancelClaim(...args),
  deletePasskey: (...args: unknown[]) => deletePasskey(...args),
  initiateClaim: (...args: unknown[]) => initiateClaim(...args),
  listDevices: (...args: unknown[]) => listDevices(...args),
}));

const devices = await import("./route");
const device = await import("./[id]/route");
const claim = await import("./claims/[id]/route");

const ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const BASE = "http://localhost/api/profile/devices";
const headers = { cookie: "session=valid" };

const del = (
  route: typeof device | typeof claim,
  path: string,
  id: string = ID,
) =>
  route.DELETE(
    new NextRequest(`${BASE}${path}/${id}`, { method: "DELETE", headers }),
    routeContext({ id }),
  );

describe("/api/profile/devices", () => {
  it("wraps the device list", async () => {
    listDevices.mockResolvedValue([{ id: ID }]);
    const response = await devices.GET(new NextRequest(BASE, { headers }));
    await expect(response.json()).resolves.toEqual({ devices: [{ id: ID }] });
  });

  it("returns a new claim as initiated by the user", async () => {
    initiateClaim.mockResolvedValue({ claimId: ID });
    const response = await devices.POST(
      new NextRequest(BASE, { method: "POST", headers }),
    );
    expect(response.status).toBe(200);
    expect(initiateClaim).toHaveBeenCalledWith("user-1", "user");
  });

  it.each([
    ["rateLimit", 429, "Rate limit exceeded. Try later."],
    ["maxDevices", 400, "Maximum devices reached"],
  ])("maps a claim's %s to %i", async (code, status, error) => {
    initiateClaim.mockResolvedValue(code);
    const response = await devices.POST(
      new NextRequest(BASE, { method: "POST", headers }),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });
});

describe("DELETE /api/profile/devices/[id]", () => {
  it("returns success as an object", async () => {
    deletePasskey.mockResolvedValue("success");
    const response = await del(device, "");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deletePasskey).toHaveBeenCalledWith("user-1", ID);
  });

  it.each([
    ["minimum", 400, "At least one passkey is required"],
    ["notFound", 404, "Passkey not found"],
  ])("maps %s to %i", async (code, status, error) => {
    deletePasskey.mockResolvedValue(code);
    const response = await del(device, "");
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });

  it("rejects a malformed id", async () => {
    const response = await del(device, "", "nope");
    expect(response.status).toBe(400);
    expect(deletePasskey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/profile/devices/claims/[id]", () => {
  it("returns success as an object", async () => {
    cancelClaim.mockResolvedValue("success");
    const response = await del(claim, "/claims");
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(cancelClaim).toHaveBeenCalledWith("user-1", ID);
  });

  it("maps notFound to a 404", async () => {
    cancelClaim.mockResolvedValue("notFound");
    const response = await del(claim, "/claims");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Claim not found");
  });
});
```

Apply to `src/components/profile/PasskeyDevicesViewer.test.tsx`:

```diff
diff --git a/src/components/profile/PasskeyDevicesViewer.test.tsx b/src/components/profile/PasskeyDevicesViewer.test.tsx
index 1808649..17da7d2 100644
--- a/src/components/profile/PasskeyDevicesViewer.test.tsx
+++ b/src/components/profile/PasskeyDevicesViewer.test.tsx
@@ -8,6 +8,7 @@ import {
 import userEvent from "@testing-library/user-event";
 import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";
 
+import { ApiError } from "@/lib/api/client";
 import { initiatePasskeyClaim } from "@/lib/auth/client";
 
 import { PasskeyDevicesViewer } from "./PasskeyDevicesViewer";
@@ -224,7 +225,9 @@ describe("PasskeyDevicesViewer", () => {
     );
     (
       initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
-    ).mockRejectedValueOnce(new Error("Rate limit exceeded"));
+    ).mockRejectedValueOnce(
+      new ApiError("rateLimit", 429, "Rate limit exceeded. Try later."),
+    );
 
     window.addEventListener("unhandledrejection", (e) => e.preventDefault());
 
@@ -238,6 +241,30 @@ describe("PasskeyDevicesViewer", () => {
     ).toBeInTheDocument();
   });
 
+  it("shows the server's message for other claim failures", async () => {
+    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
+      { ok: true, json: async () => ({ devices: [] }) },
+    );
+    (
+      initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
+    ).mockRejectedValueOnce(
+      new ApiError("maxDevices", 400, "Maximum devices reached"),
+    );
+
+    window.addEventListener("unhandledrejection", (e) => e.preventDefault());
+
+    renderWithProviders(<PasskeyDevicesViewer />);
+    await screen.findByText(/passkey devices/i);
+    await userEvent.click(screen.getByRole("button", { name: /add passkey/i }));
+
+    expect(
+      await screen.findByText("Maximum devices reached"),
+    ).toBeInTheDocument();
+    expect(
+      screen.queryByText(/too many add passkey attempts/i),
+    ).not.toBeInTheDocument();
+  });
+
   it("shows polling indicator when claim modal is open", async () => {
     (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
       {
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/profile src/components/profile`
Expected: FAIL in the route test. Delete and cancel return `"success"` rather than `{ success: true }`, bodies lack `code`, and the malformed-ID cases fail. The viewer tests may already pass, because the old viewer matched the same message text; they pin the new behaviour once it lands.

- [ ] **Step 3: Write the schemas and contract**

Create `src/lib/profile/devices/schemas.ts`:

```ts
import { z } from "zod";

export const deletePasskeySchemas = {
  params: z.object({ id: z.uuid("Invalid passkey ID") }),
};

export const cancelClaimSchemas = {
  params: z.object({ id: z.uuid("Invalid claim ID") }),
};
```

Create `src/lib/profile/devices/contract.ts`:

```ts
import { defineContract, schemas, type } from "../../api/contract";
import type { cancelClaimSchemas, deletePasskeySchemas } from "./schemas";
import type { ClaimInitiateResponse, PasskeyDevice } from "./types";

export const listDevices = defineContract({
  method: "GET",
  path: "/api/profile/devices",
  label: "Get devices",
  response: type<{ devices: PasskeyDevice[] }>(),
});

export const initiateClaim = defineContract({
  method: "POST",
  path: "/api/profile/devices",
  label: "Initiate claim",
  response: type<ClaimInitiateResponse>(),
  errors: {
    rateLimit: { status: 429, message: "Rate limit exceeded. Try later." },
    maxDevices: { status: 400, message: "Maximum devices reached" },
  },
});

export const deletePasskey = defineContract({
  method: "DELETE",
  path: "/api/profile/devices/[id]",
  label: "Delete passkey",
  schemas: schemas<typeof deletePasskeySchemas>(),
  response: type<{ success: true }>(),
  errors: {
    minimum: { status: 400, message: "At least one passkey is required" },
    notFound: { status: 404, message: "Passkey not found" },
  },
});

export const cancelClaim = defineContract({
  method: "DELETE",
  path: "/api/profile/devices/claims/[id]",
  label: "Cancel claim",
  schemas: schemas<typeof cancelClaimSchemas>(),
  response: type<{ success: true }>(),
  errors: { notFound: { status: 404, message: "Claim not found" } },
});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/profile/devices/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { initiateClaim, listDevices } from "@/lib/profile/devices/service";

// GET /api/profile/devices - Get all passkey devices for the authenticated user
export const GET = authedRoute(devicesApi.listDevices, {}, async ({ user }) => ({
  devices: await listDevices(user.id),
}));

// POST /api/profile/devices - Initiate a new passkey claim for the authenticated user
export const POST = authedRoute(devicesApi.initiateClaim, {}, ({ user }) =>
  initiateClaim(user.id, "user"),
);
```

Replace `src/app/api/profile/devices/[id]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { deletePasskeySchemas } from "@/lib/profile/devices/schemas";
import { deletePasskey } from "@/lib/profile/devices/service";

// DELETE /api/profile/devices/[id] - Remove one of the user's passkeys
export const DELETE = authedRoute(
  devicesApi.deletePasskey,
  deletePasskeySchemas,
  async ({ user, params }) => {
    const result = await deletePasskey(user.id, params.id);
    return result === "success" ? { success: true as const } : result;
  },
);
```

Replace `src/app/api/profile/devices/claims/[id]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { cancelClaimSchemas } from "@/lib/profile/devices/schemas";
import { cancelClaim } from "@/lib/profile/devices/service";

// DELETE /api/profile/devices/claims/[id] - Cancel a pending passkey claim
export const DELETE = authedRoute(
  devicesApi.cancelClaim,
  cancelClaimSchemas,
  async ({ user, params }) => {
    const result = await cancelClaim(user.id, params.id);
    return result === "success" ? { success: true as const } : result;
  },
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/lib/auth/client.ts`:

```diff
diff --git a/src/lib/auth/client.ts b/src/lib/auth/client.ts
index 91bbe62..db1b448 100644
--- a/src/lib/auth/client.ts
+++ b/src/lib/auth/client.ts
@@ -8,7 +8,8 @@ import {
 } from "@simplewebauthn/browser";
 import { UAParser } from "ua-parser-js";
 
-import type { ClaimInitiateResponse } from "@/lib/profile/devices/types";
+import { api } from "@/lib/api/client";
+import * as devicesApi from "@/lib/profile/devices/contract";
 
 export interface RegistrationOptions {
   username: string;
@@ -110,13 +111,8 @@ export async function authenticatePasskey() {
 }
 
 // Initiate a claim to add a new passkey
-export async function initiatePasskeyClaim(): Promise<ClaimInitiateResponse> {
-  const response = await fetch("/api/profile/devices", { method: "POST" });
-  if (!response.ok) {
-    const error = await response.json();
-    throw new Error(error.error || "Failed to initiate passkey claim");
-  }
-  return await response.json();
+export function initiatePasskeyClaim() {
+  return api(devicesApi.initiateClaim);
 }
 
 // Begin claim registration on another device using the magic link token
```

Apply to `src/components/profile/PasskeyDevicesViewer.tsx`:

```diff
diff --git a/src/components/profile/PasskeyDevicesViewer.tsx b/src/components/profile/PasskeyDevicesViewer.tsx
index 972a883..1fa903b 100644
--- a/src/components/profile/PasskeyDevicesViewer.tsx
+++ b/src/components/profile/PasskeyDevicesViewer.tsx
@@ -18,10 +18,11 @@ import { Input } from "@/components/ui/Input";
 import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
 import Modal from "@/components/ui/Modal";
 import QRCode from "@/components/ui/QRCode";
+import { api, errorMessage, isApiError } from "@/lib/api/client";
 import { initiatePasskeyClaim } from "@/lib/auth/client";
+import * as devicesApi from "@/lib/profile/devices/contract";
 import type {
   ClaimInitiateResponse,
-  PasskeyDevice,
 } from "@/lib/profile/devices/types";
 
 export function PasskeyDevicesViewer() {
@@ -30,16 +31,9 @@ export function PasskeyDevicesViewer() {
     isLoading,
     error,
     refetch,
-  } = useQuery<{ devices: PasskeyDevice[] }>({
+  } = useQuery({
     queryKey: ["profile", "devices"],
-    queryFn: async () => {
-      const response = await fetch("/api/profile/devices");
-      if (!response.ok) {
-        const errorData = await response.json();
-        throw new Error(errorData.error || "Failed to load devices");
-      }
-      return response.json();
-    },
+    queryFn: ({ signal }) => api(devicesApi.listDevices, {}, { signal }),
   });
 
   const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
@@ -82,12 +76,10 @@ export function PasskeyDevicesViewer() {
       setIsClaimModalOpen(true);
     },
     onError: (err) => {
-      const message =
-        (err as Error)?.message || "Failed to initiate passkey claim";
       setClaimError(
-        message.toLowerCase().includes("rate limit")
+        isApiError(err, devicesApi.initiateClaim) && err.code === "rateLimit"
           ? "Too many Add Passkey attempts in the last hour. Please try again later."
-          : message
+          : errorMessage(err, "Failed to initiate passkey claim")
       );
     },
   });
@@ -104,16 +96,8 @@ export function PasskeyDevicesViewer() {
   const canDelete = (devicesData?.devices?.length || 0) > 1;
 
   const deleteMutation = useMutation({
-    mutationFn: async (id: string) => {
-      const res = await fetch(`/api/profile/devices/${id}`, {
-        method: "DELETE",
-      });
-      if (!res.ok) {
-        const data = await res.json().catch(() => ({}));
-        throw new Error(data.error || "Failed to delete device");
-      }
-      return await res.json();
-    },
+    mutationFn: (id: string) =>
+      api(devicesApi.deletePasskey, { params: { id } }),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["profile", "devices"] });
     },
@@ -341,10 +325,9 @@ export function PasskeyDevicesViewer() {
                 size="sm"
                 onClick={async () => {
                   try {
-                    await fetch(
-                      `/api/profile/devices/claims/${claimInfo.claimId}`,
-                      { method: "DELETE" }
-                    );
+                    await api(devicesApi.cancelClaim, {
+                      params: { id: claimInfo.claimId },
+                    });
                     setIsClaimModalOpen(false);
                     setClaimInfo(null);
                   } catch {}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/profile src/components/profile src/lib/auth src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profile/devices src/app/api/profile/devices src/lib/auth/client.ts src/components/profile/PasskeyDevicesViewer.tsx src/components/profile/PasskeyDevicesViewer.test.tsx
git commit -m "refactor: move passkey devices onto typed contracts"
```

---

### Task 2: Data export and streaming preferences

**Files:**
- Create: `src/lib/profile/data/schemas.ts`, `src/lib/profile/data/contract.ts`, `src/lib/profile/streaming/schemas.ts`, `src/lib/profile/streaming/contract.ts`
- Modify: `src/app/api/profile/export/route.ts`, `src/app/api/profile/streaming/route.ts`, `src/components/profile/DataExportImport.tsx`, `src/components/profile/DataExportImport.test.tsx`, `src/components/profile/StreamingPreferences.tsx`, `src/components/providers/AuthProvider.tsx`
- Test: `src/app/api/profile/streaming/route.test.ts`

**Interfaces:**
- Consumes: from earlier layers, as Task 1.
- Produces: contracts `exportUserData`, `getStreamingPreferences`, `updateStreamingPreferences`, and their `*Schemas`.

The streaming body schema transforms `region` to fall back to `country`, then checks the region only when `providers` is present, as the old route did. `AuthProvider` keeps its existing state handling and status message. The export tests now expect `fetch` to be called with options as well as the URL.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/profile/streaming/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const exportUserData = vi.fn();
const getStreamingPreferences = vi.fn();
const updateStreamingPreferences = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/profile/streaming/service", () => ({
  getStreamingPreferences: (...args: unknown[]) =>
    getStreamingPreferences(...args),
  updateStreamingPreferences: (...args: unknown[]) =>
    updateStreamingPreferences(...args),
}));

vi.mock("@/lib/profile/data/service", () => ({
  exportUserData: (...args: unknown[]) => exportUserData(...args),
}));

const streaming = await import("./route");
const exporter = await import("../export/route");

const headers = { cookie: "session=valid" };
const URL_BASE = "http://localhost/api/profile/streaming";
const post = (body: unknown) =>
  streaming.POST(
    new NextRequest(URL_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );

describe("GET /api/profile/streaming", () => {
  it("returns the preferences", async () => {
    getStreamingPreferences.mockResolvedValue({ country: "AU", providers: [] });
    const response = await streaming.GET(new NextRequest(URL_BASE, { headers }));
    await expect(response.json()).resolves.toEqual({
      country: "AU",
      providers: [],
    });
  });

  it("maps dbError to a 500 with its message", async () => {
    getStreamingPreferences.mockResolvedValue("dbError");
    const response = await streaming.GET(new NextRequest(URL_BASE, { headers }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Fetch streaming preferences failed",
      code: "dbError",
    });
  });
});

describe("POST /api/profile/streaming", () => {
  const provider = { providerId: 8, providerName: "Netflix", logoPath: null };

  it("falls back to the country when no region is given", async () => {
    updateStreamingPreferences.mockResolvedValue({ country: "au", providers: [] });
    const response = await post({ country: "au", providers: [provider] });
    expect(response.status).toBe(200);
    expect(updateStreamingPreferences).toHaveBeenCalledWith("user-1", {
      country: "au",
      region: "au",
      providers: [provider],
    });
  });

  it("accepts a country on its own", async () => {
    updateStreamingPreferences.mockResolvedValue({ country: "US", providers: [] });
    const response = await post({ country: "US" });
    expect(response.status).toBe(200);
  });

  it.each([
    [{ country: "USA" }, "Invalid country code format. Expected 2-letter code."],
    [{ providers: [provider] }, "Region is required and must be a 2-letter code."],
    [
      { country: "AU", region: "Oceania", providers: [provider] },
      "Region is required and must be a 2-letter code.",
    ],
    [{ country: "AU", providers: [{ providerId: "8" }] }, "Invalid input: expected number, received string"],
  ])("rejects %j", async (body, error) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(updateStreamingPreferences).not.toHaveBeenCalled();
  });

  it.each([
    ["invalidRegion", 400],
    ["dbError", 500],
  ])("maps the service's %s to %i", async (code, status) => {
    updateStreamingPreferences.mockResolvedValue(code);
    const response = await post({ country: "AU" });
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("GET /api/profile/export", () => {
  it("passes the format to the service", async () => {
    exportUserData.mockResolvedValue({ data: "{}", filename: "f", mimetype: "m" });
    const response = await exporter.GET(
      new NextRequest("http://localhost/api/profile/export?format=csv", {
        headers,
      }),
    );
    expect(response.status).toBe(200);
    expect(exportUserData).toHaveBeenCalledWith("user-1", "csv");
  });

  it("requires a valid format", async () => {
    const response = await exporter.GET(
      new NextRequest("http://localhost/api/profile/export?format=xml", {
        headers,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Format parameter is required and must be 'csv' or 'json'",
    );
  });
});
```

Apply to `src/components/profile/DataExportImport.test.tsx`:

```diff
diff --git a/src/components/profile/DataExportImport.test.tsx b/src/components/profile/DataExportImport.test.tsx
index dafdc1e..f405efd 100644
--- a/src/components/profile/DataExportImport.test.tsx
+++ b/src/components/profile/DataExportImport.test.tsx
@@ -87,6 +87,7 @@ describe("DataExportImport", () => {
     await waitFor(() => {
       expect(global.fetch).toHaveBeenCalledWith(
         "/api/profile/export?format=json",
+        expect.objectContaining({ method: "GET" }),
       );
       expect(window.URL.createObjectURL).toHaveBeenCalled();
     });
@@ -114,6 +115,7 @@ describe("DataExportImport", () => {
     await waitFor(() => {
       expect(global.fetch).toHaveBeenCalledWith(
         "/api/profile/export?format=csv",
+        expect.objectContaining({ method: "GET" }),
       );
       expect(window.URL.createObjectURL).toHaveBeenCalled();
     });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/profile src/components/profile`
Expected: FAIL. A string `providerId` reaches the service, bodies lack `code`, and the export tests expect a second `fetch` argument.

- [ ] **Step 3: Write the schemas and contracts**

Create `src/lib/profile/data/schemas.ts`:

```ts
import { z } from "zod";

export const exportUserDataSchemas = {
  query: z.object({
    format: z.enum(
      ["json", "csv"],
      "Format parameter is required and must be 'csv' or 'json'",
    ),
  }),
};
```

Create `src/lib/profile/data/contract.ts`:

```ts
import { defineContract, schemas, type } from "../../api/contract";
import type { exportUserDataSchemas } from "./schemas";
import type { ExportResponse } from "./types";

// Import stays a plain `withAuth` route: it takes a multipart upload and checks
// its size before reading it, which a JSON contract doesn't describe.
export const exportUserData = defineContract({
  method: "GET",
  path: "/api/profile/export",
  label: "Export data",
  schemas: schemas<typeof exportUserDataSchemas>(),
  response: type<ExportResponse>(),
});
```

Create `src/lib/profile/streaming/schemas.ts`:

```ts
import { z } from "zod";

const REGION_INVALID = "Region is required and must be a 2-letter code.";
const countryCode = /^[A-Z]{2}$/i;

export const updateStreamingPreferencesSchemas = {
  body: z
    .object({
      country: z
        .string()
        .regex(countryCode, "Invalid country code format. Expected 2-letter code.")
        .optional(),
      region: z.string().optional(),
      providers: z
        .array(
          z.object({
            providerId: z.int(),
            providerName: z.string().optional(),
            logoPath: z.string().nullable().optional(),
          }),
        )
        .optional(),
    })
    // The region falls back to the country, and only matters with providers.
    .transform((body) => ({ ...body, region: body.region || body.country }))
    .superRefine((body, context) => {
      if (body.providers && !countryCode.test(body.region ?? "")) {
        context.addIssue({
          code: "custom",
          path: ["region"],
          message: REGION_INVALID,
        });
      }
    }),
};
```

Create `src/lib/profile/streaming/contract.ts`:

```ts
import { defineContract, schemas, type } from "../../api/contract";
import type { updateStreamingPreferencesSchemas } from "./schemas";
import type { StreamingPreferences } from "./types";

export const getStreamingPreferences = defineContract({
  method: "GET",
  path: "/api/profile/streaming",
  label: "Fetch streaming preferences",
  response: type<StreamingPreferences>(),
  errors: {
    dbError: { status: 500, message: "Fetch streaming preferences failed" },
  },
});

export const updateStreamingPreferences = defineContract({
  method: "POST",
  path: "/api/profile/streaming",
  label: "Update streaming preferences",
  schemas: schemas<typeof updateStreamingPreferencesSchemas>(),
  response: type<StreamingPreferences>(),
  errors: {
    invalidRegion: {
      status: 400,
      message: "Region is required and must be a 2-letter code.",
    },
    dbError: { status: 500, message: "Update streaming preferences failed" },
  },
});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/profile/export/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as dataApi from "@/lib/profile/data/contract";
import { exportUserDataSchemas } from "@/lib/profile/data/schemas";
import { exportUserData } from "@/lib/profile/data/service";

// GET /api/profile/export?format=csv|json - Export user's lists data
export const GET = authedRoute(
  dataApi.exportUserData,
  exportUserDataSchemas,
  ({ user, query }) => exportUserData(user.id, query.format),
);
```

Replace `src/app/api/profile/streaming/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as streamingApi from "@/lib/profile/streaming/contract";
import { updateStreamingPreferencesSchemas } from "@/lib/profile/streaming/schemas";
import {
  getStreamingPreferences,
  updateStreamingPreferences,
} from "@/lib/profile/streaming/service";

// GET /api/profile/streaming - Fetch user's streaming preferences
export const GET = authedRoute(
  streamingApi.getStreamingPreferences,
  {},
  ({ user }) => getStreamingPreferences(user.id),
);

// POST /api/profile/streaming - Update user's country and subscribed providers
export const POST = authedRoute(
  streamingApi.updateStreamingPreferences,
  updateStreamingPreferencesSchemas,
  ({ user, body }) => updateStreamingPreferences(user.id, body),
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/profile/DataExportImport.tsx`:

```diff
diff --git a/src/components/profile/DataExportImport.tsx b/src/components/profile/DataExportImport.tsx
index a6058b5..7d3b024 100644
--- a/src/components/profile/DataExportImport.tsx
+++ b/src/components/profile/DataExportImport.tsx
@@ -15,7 +15,9 @@ import { useRef,useState } from "react";
 import { Button } from "@/components/ui/Button";
 import { Card, CardContent } from "@/components/ui/Card";
 import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
-import type { ExportResponse, ImportResult } from "@/lib/profile/data/types";
+import { api } from "@/lib/api/client";
+import * as dataApi from "@/lib/profile/data/contract";
+import type { ImportResult } from "@/lib/profile/data/types";
 
 type ExportFormat = "json" | "csv";
 type ImportStatus = "idle" | "uploading" | "success" | "error";
@@ -28,13 +30,8 @@ export function DataExportImport() {
   const fileInputRef = useRef<HTMLInputElement>(null);
 
   const exportMutation = useMutation({
-    mutationFn: async (format: ExportFormat) => {
-      const response = await fetch(`/api/profile/export?format=${format}`);
-      const responseData = await response.json();
-      if (!response.ok)
-        throw new Error(responseData.error || "Failed to export data");
-      return responseData as ExportResponse;
-    },
+    mutationFn: (format: ExportFormat) =>
+      api(dataApi.exportUserData, { query: { format } }),
     onSuccess: ({ data, filename, mimetype }) => {
       let blob: Blob;
 
```

Apply to `src/components/profile/StreamingPreferences.tsx`:

```diff
diff --git a/src/components/profile/StreamingPreferences.tsx b/src/components/profile/StreamingPreferences.tsx
index 32355b3..1a24f99 100644
--- a/src/components/profile/StreamingPreferences.tsx
+++ b/src/components/profile/StreamingPreferences.tsx
@@ -9,6 +9,7 @@ import { Button } from "@/components/ui/Button";
 import Dropdown from "@/components/ui/Dropdown";
 import { Input } from "@/components/ui/Input";
 import { api } from "@/lib/api/client";
+import * as streamingApi from "@/lib/profile/streaming/contract";
 import type { StreamingPreferences as StreamingPreferencesType } from "@/lib/profile/streaming/types";
 import { getImageUrl } from "@/lib/tmdb/client";
 import * as tmdbApi from "@/lib/tmdb/contract";
@@ -157,15 +158,7 @@ export function StreamingPreferences() {
           })),
       };
 
-      const res = await fetch("/api/profile/streaming", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify(payload),
-      });
-      if (!res.ok) {
-        const err = await res.json();
-        throw new Error(err?.error || "Failed to save preferences");
-      }
+      await api(streamingApi.updateStreamingPreferences, { body: payload });
     },
     onSuccess: async () => {
       // Sync auth context (server data)
```

Apply to `src/components/providers/AuthProvider.tsx`:

```diff
diff --git a/src/components/providers/AuthProvider.tsx b/src/components/providers/AuthProvider.tsx
index dcaee6d..911557b 100644
--- a/src/components/providers/AuthProvider.tsx
+++ b/src/components/providers/AuthProvider.tsx
@@ -11,7 +11,9 @@ import React, {
   useState,
 } from "react";
 
+import { api, ApiError, errorMessage } from "@/lib/api/client";
 import { getCurrentSession, User } from "@/lib/auth/client";
+import * as streamingApi from "@/lib/profile/streaming/contract";
 import { StreamingPreferences } from "@/lib/profile/streaming/types";
 
 interface AuthState {
@@ -90,25 +92,14 @@ export function AuthProvider({ children }: { children: React.ReactNode }) {
         streamingLoading: true,
         streamingError: null,
       }));
-      const response = await fetch("/api/profile/streaming");
-      if (response.ok) {
-        const data = await response.json();
-        setState((prev) => ({
-          ...prev,
-          streamingPreferences: data,
-          streamingLoading: false,
-          streamingLoaded: true,
-          streamingError: null,
-        }));
-      } else {
-        setState((prev) => ({
-          ...prev,
-          streamingPreferences: null,
-          streamingLoading: false,
-          streamingLoaded: true,
-          streamingError: `Failed to load streaming preferences (${response.status})`,
-        }));
-      }
+      const data = await api(streamingApi.getStreamingPreferences);
+      setState((prev) => ({
+        ...prev,
+        streamingPreferences: data,
+        streamingLoading: false,
+        streamingLoaded: true,
+        streamingError: null,
+      }));
     } catch (error) {
       console.error("Failed to refresh streaming preferences:", error);
       setState((prev) => ({
@@ -116,10 +107,12 @@ export function AuthProvider({ children }: { children: React.ReactNode }) {
         streamingPreferences: null,
         streamingLoading: false,
         streamingLoaded: true,
+        // A server answer keeps its status in the message; a failed request
+        // has none.
         streamingError:
-          error instanceof Error
-            ? error.message
-            : "Failed to load streaming preferences",
+          error instanceof ApiError && error.status > 0
+            ? `Failed to load streaming preferences (${error.status})`
+            : errorMessage(error, "Failed to load streaming preferences"),
       }));
     }
   }, []);
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/profile src/components/profile src/components/providers src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profile/data src/lib/profile/streaming src/app/api/profile/export src/app/api/profile/streaming src/components/profile/DataExportImport.tsx src/components/profile/DataExportImport.test.tsx src/components/profile/StreamingPreferences.tsx src/components/providers/AuthProvider.tsx
git commit -m "refactor: move data export and streaming preferences onto typed contracts"
```

---

### Task 3: Activity timeline

**Files:**
- Create: `src/lib/activity/schemas.ts`, `src/lib/activity/contract.ts`
- Modify: `src/app/api/activity/route.ts`, `src/components/activity/ActivityFeed.tsx`, `src/components/activity/ActivityTimelineClient.tsx`, `src/components/activity/ActivityFeed.test.tsx`, `src/components/activity/ActivityTimelineClient.test.tsx`
- Test: `src/app/api/activity/route.test.ts`

**Interfaces:**
- Consumes: from earlier layers, as Task 1.
- Produces: contract `listActivityTimeline` and `listActivityTimelineSchemas`.

`limit` uses `.default(10).catch(10)`. The service requires a limit and clamps it to 1-100, so a value it can't use falls back here rather than being rejected. The two component tests now expect the contract label as the error text.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/activity/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const listActivityTimeline = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-1",
    timezone: "Australia/Brisbane",
  })),
}));

vi.mock("@/lib/activity/service", () => ({
  listActivityTimeline: (...args: unknown[]) => listActivityTimeline(...args),
}));

const { GET } = await import("./route");

const get = (search = "") =>
  GET(
    new NextRequest(`http://localhost/api/activity${search}`, {
      headers: { cookie: "session=valid" },
    }),
  );

describe("GET /api/activity", () => {
  it("passes the user's timezone and the parsed query", async () => {
    listActivityTimeline.mockResolvedValue({ activities: [], hasMore: false });
    const response = await get("?limit=20&cursor=abc&type=list_created");
    expect(response.status).toBe(200);
    expect(listActivityTimeline).toHaveBeenCalledWith(
      "user-1",
      "Australia/Brisbane",
      { limit: 20, cursor: "abc", type: "list_created" },
    );
  });

  it.each(["", "?limit=abc", "?limit=-5"])(
    "uses the default limit for %j",
    async (search) => {
      listActivityTimeline.mockResolvedValue({ activities: [], hasMore: false });
      const response = await get(search);
      expect(response.status).toBe(200);
      expect(listActivityTimeline).toHaveBeenCalledWith(
        "user-1",
        "Australia/Brisbane",
        { limit: 10 },
      );
    },
  );

  it("maps an invalid cursor to a 400", async () => {
    listActivityTimeline.mockResolvedValue("invalidCursor");
    const response = await get("?cursor=garbage");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid cursor",
      code: "invalidCursor",
    });
  });
});
```

Apply to `src/components/activity/ActivityFeed.test.tsx`:

```diff
diff --git a/src/components/activity/ActivityFeed.test.tsx b/src/components/activity/ActivityFeed.test.tsx
index 3fa94e1..57a5cd2 100644
--- a/src/components/activity/ActivityFeed.test.tsx
+++ b/src/components/activity/ActivityFeed.test.tsx
@@ -65,7 +65,7 @@ describe("ActivityFeed", () => {
     global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
     renderWithClient(<ActivityFeed currentUsername="alice" />);
     expect(
-      await screen.findByText(/Failed to fetch activities/),
+      await screen.findByText(/Get activity timeline failed/),
     ).toBeInTheDocument();
   });
 
@@ -183,7 +183,7 @@ describe("ActivityFeed", () => {
 
       expect(screen.getByText(/created list "My List"/)).toBeInTheDocument();
       expect(
-        screen.queryByText(/Failed to fetch activities/),
+        screen.queryByText(/Get activity timeline failed/),
       ).not.toBeInTheDocument();
     });
   });
```

Apply to `src/components/activity/ActivityTimelineClient.test.tsx`:

```diff
diff --git a/src/components/activity/ActivityTimelineClient.test.tsx b/src/components/activity/ActivityTimelineClient.test.tsx
index 66a48a2..207c50c 100644
--- a/src/components/activity/ActivityTimelineClient.test.tsx
+++ b/src/components/activity/ActivityTimelineClient.test.tsx
@@ -49,7 +49,7 @@ describe("ActivityTimelineClient", () => {
     const { ActivityTimelineClient } = await import("./ActivityTimelineClient");
     renderWithClient(<ActivityTimelineClient />);
     expect(
-      await screen.findByText(/Failed to fetch activities/),
+      await screen.findByText(/Get activity timeline failed/),
     ).toBeInTheDocument();
     // Retry button is present
     expect(screen.getByText("Try Again")).toBeInTheDocument();
@@ -118,7 +118,7 @@ describe("ActivityTimelineClient", () => {
 
       expect(screen.getByText(/created list "My List"/)).toBeInTheDocument();
       expect(
-        screen.queryByText(/Failed to fetch activities/),
+        screen.queryByText(/Get activity timeline failed/),
       ).not.toBeInTheDocument();
     } finally {
       vi.useRealTimers();
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/activity src/components/activity`
Expected: FAIL. `limit=abc` reaches the service as `NaN`, the invalid-cursor body lacks `code`, and the component tests expect the new error text.

- [ ] **Step 3: Write the schemas and contract**

Create `src/lib/activity/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";

export const listActivityTimelineSchemas = {
  query: z.object({
    // The service clamps the limit to 1-100, so a value it can't use falls
    // back to the default here rather than being rejected.
    limit: q.int().default(10).catch(10),
    cursor: z.string().optional(),
    type: z.string().optional(),
  }),
};
```

Create `src/lib/activity/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type { listActivityTimelineSchemas } from "./schemas";
import type { ActivityTimelineResponse } from "./types";

export const listActivityTimeline = defineContract({
  method: "GET",
  path: "/api/activity",
  label: "Get activity timeline",
  schemas: schemas<typeof listActivityTimelineSchemas>(),
  response: type<ActivityTimelineResponse>(),
  errors: { invalidCursor: { status: 400, message: "Invalid cursor" } },
});
```

- [ ] **Step 4: Rewrite the route**

Replace `src/app/api/activity/route.ts` with:

```ts
import * as activityApi from "@/lib/activity/contract";
import { listActivityTimelineSchemas } from "@/lib/activity/schemas";
import { listActivityTimeline } from "@/lib/activity/service";
import { authedRoute } from "@/lib/api/route";

// GET /api/activity - Get paginated activity timeline
export const GET = authedRoute(
  activityApi.listActivityTimeline,
  listActivityTimelineSchemas,
  ({ user, query }) =>
    listActivityTimeline(user.id, user.timezone, query),
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/activity/ActivityFeed.tsx`:

```diff
diff --git a/src/components/activity/ActivityFeed.tsx b/src/components/activity/ActivityFeed.tsx
index 20506f6..ccf7316 100644
--- a/src/components/activity/ActivityFeed.tsx
+++ b/src/components/activity/ActivityFeed.tsx
@@ -8,7 +8,8 @@ import { useEffect, useMemo, useState } from "react";
 import ListSettingsModal from "@/components/lists/ListSettingsModal";
 import { Button } from "@/components/ui/Button";
 import { useProgressRouter } from "@/hooks/useProgressRouter";
-import type { ActivityTimelineResponse } from "@/lib/activity/types";
+import * as activityApi from "@/lib/activity/contract";
+import { api } from "@/lib/api/client";
 import { refetchOnResume } from "@/lib/refetch-on-resume";
 
 import { LoadingSpinner } from "../ui/LoadingSpinner";
@@ -53,15 +54,14 @@ export function ActivityFeed({ currentUsername }: ActivityFeedProps) {
     isLoading,
     error,
     refetch,
-  } = useQuery<ActivityTimelineResponse>({
+  } = useQuery({
     queryKey: ["activity", "feed"],
-    queryFn: async () => {
-      const response = await fetch(
-        `/api/activity?limit=${DESKTOP_ACTIVITY_COUNT}`,
-      );
-      if (!response.ok) throw new Error("Failed to fetch activities");
-      return response.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        activityApi.listActivityTimeline,
+        { query: { limit: DESKTOP_ACTIVITY_COUNT } },
+        { signal },
+      ),
     refetchOnWindowFocus: refetchOnResume,
   });
 
```

Apply to `src/components/activity/ActivityTimelineClient.tsx`:

```diff
diff --git a/src/components/activity/ActivityTimelineClient.tsx b/src/components/activity/ActivityTimelineClient.tsx
index 3c400e2..d61eb3f 100644
--- a/src/components/activity/ActivityTimelineClient.tsx
+++ b/src/components/activity/ActivityTimelineClient.tsx
@@ -5,10 +5,9 @@ import { useCallback, useMemo } from "react";
 
 import { Button } from "@/components/ui/Button";
 import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
-import type {
-  ActivityItem,
-  ActivityTimelineResponse,
-} from "@/lib/activity/types";
+import * as activityApi from "@/lib/activity/contract";
+import type { ActivityItem } from "@/lib/activity/types";
+import { api } from "@/lib/api/client";
 import { refetchOnResume } from "@/lib/refetch-on-resume";
 
 import { useUser } from "../providers/AuthProvider";
@@ -27,24 +26,21 @@ export function ActivityTimelineClient() {
     hasNextPage,
   } = useInfiniteQuery({
     queryKey: ["activity", "timeline"],
-    queryFn: async ({ pageParam }) => {
-      const params = new URLSearchParams();
-      params.set("limit", "20");
-      if (pageParam) params.set("cursor", pageParam as string);
-      const response = await fetch(`/api/activity?${params}`);
-      if (!response.ok) throw new Error("Failed to fetch activities");
-      return response.json();
-    },
-    initialPageParam: undefined,
-    getNextPageParam: (lastPage: ActivityTimelineResponse) =>
-      lastPage.nextCursor || undefined,
+    queryFn: ({ pageParam, signal }) =>
+      api(
+        activityApi.listActivityTimeline,
+        { query: { limit: 20, cursor: pageParam } },
+        { signal },
+      ),
+    initialPageParam: undefined as string | undefined,
+    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
     refetchOnWindowFocus: refetchOnResume,
   });
 
-  const activities = useMemo(() => {
-    const pages = (data?.pages || []) as ActivityTimelineResponse[];
-    return pages.flatMap((p) => p.activities || []);
-  }, [data?.pages]);
+  const activities = useMemo(
+    () => (data?.pages ?? []).flatMap((p) => p.activities || []),
+    [data?.pages],
+  );
 
   const loadMore = useCallback(() => {
     if (hasNextPage) {
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/activity src/components/activity src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/activity src/app/api/activity src/components/activity
git commit -m "refactor: move the activity timeline onto typed contracts"
```

---

### Task 4: API docs and final checks

**Files:**
- Modify: `docs/api/openapi.yaml`

**Interfaces:**
- Consumes: everything above. Produces nothing later tasks use.

- [ ] **Step 1: Update the API docs**

This replaces the string success body with the shared `SuccessResponse` and removes the now-unused `StringSuccessResponse`. Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index 222719d..b14a8be 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -68,9 +68,6 @@ components:
       properties:
         success:
           type: boolean
-    StringSuccessResponse:
-      type: string
-      enum: [success]
     UserSummary:
       type: object
       required: [id, username, createdAt]
@@ -1345,6 +1342,7 @@ paths:
           schema:
             type: integer
             default: 10
+            description: Clamped to 1-100. A value that isn't a whole number uses the default.
         - in: query
           name: cursor
           required: false
@@ -2654,6 +2652,7 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
     delete:
       tags: [Profile]
       summary: Delete passkey device
@@ -2665,7 +2664,7 @@ paths:
           content:
             application/json:
               schema:
-                $ref: "#/components/schemas/StringSuccessResponse"
+                $ref: "#/components/schemas/SuccessResponse"
         "400":
           description: Minimum device count violation
           content:
@@ -2697,6 +2696,7 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
     delete:
       tags: [Profile]
       summary: Cancel a passkey claim
@@ -2708,7 +2708,13 @@ paths:
           content:
             application/json:
               schema:
-                $ref: "#/components/schemas/StringSuccessResponse"
+                $ref: "#/components/schemas/SuccessResponse"
+        "400":
+          description: Invalid claim ID
+          content:
+            application/json:
+              schema:
+                $ref: "#/components/schemas/ErrorResponse"
         "401":
           description: Authentication required
           content:
```

- [ ] **Step 2: Confirm no hand parsing remains in these routes**

Run: `grep -rnE 'parseInt|searchParams|request\.json|split\("/"\)' src/app/api/activity src/app/api/profile/devices src/app/api/profile/export src/app/api/profile/streaming --include=route.ts`
Expected: no output.

- [ ] **Step 3: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,718 passing tests. Report any failure with its output.

- [ ] **Step 4: Check the bundle**

```bash
node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: the last line of the first command reports the largest growth, about 3,500 bytes, and well under 10,000. The second prints `0`. If a command is blocked, report it rather than finding another way to run it.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: document profile route ID formats and success bodies"
```
