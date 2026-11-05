# Typed API Contracts: Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 8 lists route files and their 3 client callers onto typed contracts. This is layer 2 of 8 in the spec's rollout, stacked on PR #57, and the first use of real dynamic route params.

**Architecture:** `src/lib/lists/contract.ts` and `schemas.ts` define the 14 endpoints. Routes become thin `authedRoute` calls using the existing services. `ListSettingsModal`, `ListSelector` and `CollaborationModal` call `api()` inside their existing React Query hooks, and drop loading state that `isPending` already provides.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, and success response shapes do not change, except that list `createdAt` and `updatedAt` from `listLists`, `createList` and `updateList` are ISO strings everywhere. Over HTTP they already were; nothing reads these fields in the UI.
- Every error body keeps `error` and adds `code`.
- Client-bundled code never imports `zod`, `@/lib/lists/schemas`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine. Total growth of `.next/static/chunks/*.js` stays under 10 kB gzipped against the 507,379-byte baseline.
- Contract files never import `@/lib/db`, services, `next/server`, or auth server modules.
- Keep deliberate leniency: unknown `watchStatus` and `sortOrder` values on list items are ignored, not rejected.
- Contracts are named after their service function. To avoid clashing with those functions and with component handlers, routes and components use `import * as listsApi from "@/lib/lists/contract"`.
- All code below compiled and passed on a prototype on 2026-11-05: 1,569 tests, plus 54 live checks over HTTP against a real Postgres. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/lists/schemas.ts` (new) | Zod schemas for every lists endpoint; server only |
| `src/lib/lists/contract.ts` (new) | The 14 endpoint contracts; client-safe |
| `src/lib/lists/types.ts`, `service.ts` | `ListListsResponse` dates become strings; adds `ContentListEntry` |
| `src/app/api/lists/**/route.ts`, `src/app/api/content/[id]/lists/route.ts` | Rewritten on `authedRoute` |
| `src/components/lists/ListSettingsModal.tsx` | Calls `api()`; loading state comes from mutations |
| `src/components/content/ListSelector.tsx` | Calls `api()`; loses the `title` and `posterPath` props, which only fed fields the route ignored |
| `src/components/lists/CollaborationModal.tsx` | Calls `api()`; loading state comes from the mutation |
| `docs/api/openapi.yaml` | UUID formats, and the required `contentType` the docs were missing |

## Behaviour changes, all intended

- Malformed list, item and user IDs return 400. `GET /api/lists/nope` used to return 404, because `getList` catches the Postgres error, and other routes returned 500.
- `username: 123`, non-boolean flags, a non-string `name` and malformed JSON return 400 instead of 500 or being coerced.
- `POST /api/lists/[id]/items` no longer accepts a numeric string for `tmdbId`. The only caller sends a number.
- `/api/content/550abc/lists` returns 400 instead of reading it as 550.
- `name` and `username` are trimmed by the schema. Services already trim `name`, and the UI trims both.
- A TMDB failure on these routes now returns 503 through `handleApiError` instead of a generic 500.
- 500 messages come from each contract's `label`, such as `Add item to list failed`.

---

### Task 1: Lists, archived lists, and a single list

**Files:**
- Modify: `src/lib/lists/types.ts`, `src/lib/lists/service.ts`, `src/app/api/lists/route.ts`, `src/app/api/lists/archived/route.ts`, `src/app/api/lists/[id]/route.ts`, `src/components/lists/ListSettingsModal.tsx`, `src/components/lists/ListSettingsModal.test.tsx`
- Create: `src/lib/lists/schemas.ts`, `src/lib/lists/contract.ts`
- Test: `src/app/api/lists/route.test.ts`

**Interfaces:**
- Consumes: from layer 1, `defineContract`, `schemas`, `type` (`src/lib/api/contract.ts`), `q` (`src/lib/api/query.ts`), `authedRoute(contract, schemas, handler)` (`src/lib/api/route.ts`), `api`, `errorMessage` (`src/lib/api/client.ts`).
- Produces: contracts `listLists`, `listArchivedLists`, `getList`, `createList`, `updateList`, `deleteList`, the const `LIST_NOT_FOUND`, and schemas `getListSchemas`, `createListSchemas`, `updateListSchemas`, `deleteListSchemas`, plus the module-level `listParams`, `TMDB_ID_INVALID` and the enum imports that Tasks 2 and 3 use.

`schemas.ts` imports `q`, `ContentType`, `PermissionLevel` and `WatchStatus` for Tasks 2 and 3. `pnpm lint:ci` may flag them as unused until then, which is why this plan runs it in Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/lists/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createList = vi.fn();
const listLists = vi.fn();
const deleteList = vi.fn();
const getList = vi.fn();
const listArchivedLists = vi.fn();
const updateList = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

vi.mock("@/lib/lists/service", () => ({
  createList: (...args: unknown[]) => createList(...args),
  deleteList: (...args: unknown[]) => deleteList(...args),
  getList: (...args: unknown[]) => getList(...args),
  listArchivedLists: (...args: unknown[]) => listArchivedLists(...args),
  listLists: (...args: unknown[]) => listLists(...args),
  updateList: (...args: unknown[]) => updateList(...args),
}));

const collection = await import("./route");
const archived = await import("./archived/route");
const single = await import("./[id]/route");

const LIST_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const BASE = "http://localhost/api/lists";
const headers = { cookie: "session=valid" };
const context = (id = LIST_ID) => ({ params: Promise.resolve({ id }) });

function send(url: string, method: string, body: string) {
  return new NextRequest(url, { method, headers, body });
}

describe("GET /api/lists and /api/lists/archived", () => {
  it("wraps the lists", async () => {
    listLists.mockResolvedValue([{ id: "a" }]);
    const response = await collection.GET(new NextRequest(BASE, { headers }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ lists: [{ id: "a" }] });
    expect(listLists).toHaveBeenCalledWith("user-1");
  });

  it("wraps the archived lists", async () => {
    listArchivedLists.mockResolvedValue([{ id: "b" }]);
    const response = await archived.GET(
      new NextRequest(`${BASE}/archived`, { headers }),
    );
    await expect(response.json()).resolves.toEqual({ lists: [{ id: "b" }] });
  });

  it("returns 401 without a session", async () => {
    const response = await collection.GET(new NextRequest(BASE));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/lists", () => {
  it("creates with defaults and returns 201", async () => {
    createList.mockResolvedValue({ id: "new" });
    const response = await collection.POST(
      send(BASE, "POST", '{"name":"  Weekend  "}'),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ list: { id: "new" } });
    expect(createList).toHaveBeenCalledWith("user-1", {
      name: "Weekend",
      listType: "mixed",
      isPublic: false,
      syncWatchStatus: false,
    });
  });

  it.each([
    ["{}", "List name is required"],
    ['{"name":"   "}', "List name is required"],
    [`{"name":"${"x".repeat(101)}"}`, "List name must be 100 characters or less"],
    [
      '{"name":"a","listType":"books"}',
      "Invalid list type. Must be 'movies', 'tv', or 'mixed'",
    ],
  ])("rejects %s with its message", async (body, error) => {
    const response = await collection.POST(send(BASE, "POST", body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error,
      code: "validation",
    });
    expect(createList).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean flag and a non-string name", async () => {
    for (const body of ['{"name":"a","isPublic":"yes"}', '{"name":5}']) {
      const response = await collection.POST(send(BASE, "POST", body));
      expect(response.status).toBe(400);
    }
    expect(createList).not.toHaveBeenCalled();
  });
});

describe("/api/lists/[id]", () => {
  const url = `${BASE}/${LIST_ID}`;

  it("reads the id from the route context", async () => {
    getList.mockResolvedValue({ id: LIST_ID });
    const response = await single.GET(
      new NextRequest(url, { headers }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(getList).toHaveBeenCalledWith("user-1", LIST_ID);
  });

  it("returns 400 for a malformed id without calling the service", async () => {
    const response = await single.GET(
      new NextRequest(`${BASE}/nope`, { headers }),
      context("nope"),
    );
    expect(response.status).toBe(400);
    expect(getList).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    getList.mockResolvedValue("notFound");
    const response = await single.GET(
      new NextRequest(url, { headers }),
      context(),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "List not found",
      code: "notFound",
    });
  });

  it("wraps an update and passes only known fields", async () => {
    updateList.mockResolvedValue({ id: LIST_ID });
    const response = await single.PUT(
      send(url, "PUT", '{"isArchived":true,"ownerId":"attacker"}'),
      context(),
    );
    await expect(response.json()).resolves.toEqual({ list: { id: LIST_ID } });
    expect(updateList).toHaveBeenCalledWith("user-1", LIST_ID, {
      isArchived: true,
    });
  });

  it.each([
    ["notFound", 404, "List not found"],
    ["forbidden", 403, "Only the list owner can update this list"],
  ])("maps an update's %s to %i", async (code, status, error) => {
    updateList.mockResolvedValue(code);
    const response = await single.PUT(
      send(url, "PUT", '{"name":"a"}'),
      context(),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });

  it("rejects an empty name on update", async () => {
    const response = await single.PUT(
      send(url, "PUT", '{"name":" "}'),
      context(),
    );
    expect(response.status).toBe(400);
    expect(updateList).not.toHaveBeenCalled();
  });

  it("deletes, and maps forbidden to its own message", async () => {
    deleteList.mockResolvedValue({ message: "List deleted successfully" });
    const ok = await single.DELETE(
      new NextRequest(url, { method: "DELETE", headers }),
      context(),
    );
    await expect(ok.json()).resolves.toEqual({
      message: "List deleted successfully",
    });

    deleteList.mockResolvedValue("forbidden");
    const denied = await single.DELETE(
      new NextRequest(url, { method: "DELETE", headers }),
      context(),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe(
      "Only the list owner can delete this list",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/lists/route.test.ts`
Expected: FAIL. Bodies lack `code`, the malformed-ID and non-boolean cases don't return 400, and `/api/lists/[id]` still reads its ID from the URL, so the `nope` context isn't what it validates.

- [ ] **Step 3: Make list dates honest**

Apply to `src/lib/lists/types.ts`:

```diff
diff --git a/src/lib/lists/types.ts b/src/lib/lists/types.ts
index b40add9..b67e1eb 100644
--- a/src/lib/lists/types.ts
+++ b/src/lib/lists/types.ts
@@ -36,8 +36,8 @@ export interface ListListsResponse {
   isArchived: boolean;
   syncWatchStatus: boolean;
   ownerId: string;
-  createdAt: Date;
-  updatedAt: Date;
+  createdAt: string;
+  updatedAt: string;
   itemCount: number;
   collaborators: number;
   posterPaths: string[];
```

Apply to `src/lib/lists/service.ts`:

```diff
diff --git a/src/lib/lists/service.ts b/src/lib/lists/service.ts
index 02e6fb4..1613ebd 100644
--- a/src/lib/lists/service.ts
+++ b/src/lib/lists/service.ts
@@ -173,6 +173,8 @@ async function fetchLists(
 
   return userListsWithCounts.map((list) => ({
     ...list,
+    createdAt: list.createdAt.toISOString(),
+    updatedAt: list.updatedAt.toISOString(),
     posterPaths: postersByList.get(list.id) ?? [],
   }));
 }
@@ -407,8 +409,8 @@ export async function createList(
     isArchived: newList.isArchived,
     syncWatchStatus: newList.syncWatchStatus,
     ownerId: newList.ownerId,
-    createdAt: newList.createdAt,
-    updatedAt: newList.updatedAt,
+    createdAt: newList.createdAt.toISOString(),
+    updatedAt: newList.updatedAt.toISOString(),
     itemCount: 0,
     collaborators: 0,
     posterPaths: [],
@@ -495,8 +497,8 @@ export async function updateList(
     isArchived: updated.isArchived,
     syncWatchStatus: updated.syncWatchStatus,
     ownerId: updated.ownerId,
-    createdAt: updated.createdAt,
-    updatedAt: updated.updatedAt,
+    createdAt: updated.createdAt.toISOString(),
+    updatedAt: updated.updatedAt.toISOString(),
     itemCount: itemCountResult[0]?.count || 0,
     collaborators: collaboratorCountResult[0]?.count || 0,
     posterPaths: [],
```

- [ ] **Step 4: Write the schemas and contract**

Create `src/lib/lists/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";
import {
  ContentType,
  ListType,
  PermissionLevel,
  WatchStatus,
} from "../db/schema";

const LIST_NAME_REQUIRED = "List name is required";
const LIST_NAME_TOO_LONG = "List name must be 100 characters or less";
const LIST_TYPE_INVALID = "Invalid list type. Must be 'movies', 'tv', or 'mixed'";
const TMDB_ID_INVALID = "tmdbId must be a positive integer";

const listName = z
  .string(LIST_NAME_REQUIRED)
  .trim()
  .min(1, LIST_NAME_REQUIRED)
  .max(100, LIST_NAME_TOO_LONG);

const listParams = z.object({ id: z.uuid("Invalid list ID") });

export const getListSchemas = { params: listParams };

export const createListSchemas = {
  body: z.object({
    name: listName,
    description: z.string().nullable().optional(),
    listType: z.enum(ListType, LIST_TYPE_INVALID).default(ListType.MIXED),
    isPublic: z.boolean().default(false),
    syncWatchStatus: z.boolean().default(false),
  }),
};

export const updateListSchemas = {
  params: listParams,
  body: z.object({
    name: listName.optional(),
    description: z.string().nullable().optional(),
    listType: z.enum(ListType, LIST_TYPE_INVALID).optional(),
    isPublic: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    syncWatchStatus: z.boolean().optional(),
  }),
};

export const deleteListSchemas = { params: listParams };
```

Create `src/lib/lists/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  createListSchemas,
  deleteListSchemas,
  getListSchemas,
  updateListSchemas,
} from "./schemas";
import type {
  DeleteResponse,
  GetListResponse,
  ListListsResponse,
} from "./types";

const LIST_NOT_FOUND = { status: 404, message: "List not found" };

export const listLists = defineContract({
  method: "GET",
  path: "/api/lists",
  label: "Get lists",
  response: type<{ lists: ListListsResponse[] }>(),
});

export const listArchivedLists = defineContract({
  method: "GET",
  path: "/api/lists/archived",
  label: "Get archived lists",
  response: type<{ lists: ListListsResponse[] }>(),
});

export const getList = defineContract({
  method: "GET",
  path: "/api/lists/[id]",
  label: "Get list",
  schemas: schemas<typeof getListSchemas>(),
  response: type<GetListResponse>(),
  errors: { notFound: LIST_NOT_FOUND },
});

export const createList = defineContract({
  method: "POST",
  path: "/api/lists",
  label: "Create list",
  status: 201,
  schemas: schemas<typeof createListSchemas>(),
  response: type<{ list: ListListsResponse }>(),
});

export const updateList = defineContract({
  method: "PUT",
  path: "/api/lists/[id]",
  label: "Update list",
  schemas: schemas<typeof updateListSchemas>(),
  response: type<{ list: ListListsResponse }>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can update this list",
    },
  },
});

export const deleteList = defineContract({
  method: "DELETE",
  path: "/api/lists/[id]",
  label: "Delete list",
  schemas: schemas<typeof deleteListSchemas>(),
  response: type<DeleteResponse>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can delete this list",
    },
  },
});
```

- [ ] **Step 5: Rewrite the routes**

Replace `src/app/api/lists/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { createListSchemas } from "@/lib/lists/schemas";
import { createList, listLists } from "@/lib/lists/service";

// GET /api/lists - Get all lists for the authenticated user
export const GET = authedRoute(listsApi.listLists, {}, async ({ user }) => ({
  lists: await listLists(user.id),
}));

// POST /api/lists - Create a new list
export const POST = authedRoute(
  listsApi.createList,
  createListSchemas,
  async ({ user, body }) => ({ list: await createList(user.id, body) }),
);
```

Replace `src/app/api/lists/archived/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { listArchivedLists } from "@/lib/lists/service";

// GET /api/lists/archived - Get all archived lists for the authenticated user
export const GET = authedRoute(
  listsApi.listArchivedLists,
  {},
  async ({ user }) => ({ lists: await listArchivedLists(user.id) }),
);
```

Replace `src/app/api/lists/[id]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  deleteListSchemas,
  getListSchemas,
  updateListSchemas,
} from "@/lib/lists/schemas";
import { deleteList, getList, updateList } from "@/lib/lists/service";

// GET /api/lists/[id] - Get a specific list
//
// getList returns the "notFound" sentinel for both a missing list and an
// access-denied list (they are indistinguishable here), which the contract maps
// to a real 404 instead of serializing the string with a 200 (API-08).
export const GET = authedRoute(
  listsApi.getList,
  getListSchemas,
  ({ user, params }) => getList(user.id, params.id),
);

// PUT /api/lists/[id] - Update a list
export const PUT = authedRoute(
  listsApi.updateList,
  updateListSchemas,
  async ({ user, params, body }) => {
    const updated = await updateList(user.id, params.id, body);
    return typeof updated === "string" ? updated : { list: updated };
  },
);

// DELETE /api/lists/[id] - Delete a list
export const DELETE = authedRoute(
  listsApi.deleteList,
  deleteListSchemas,
  ({ user, params }) => deleteList(user.id, params.id),
);
```

- [ ] **Step 6: Update the modal and its test stubs**

The two stubs returned a flat list, a shape the server has never sent, so they change too.

Apply to `src/components/lists/ListSettingsModal.tsx`:

```diff
diff --git a/src/components/lists/ListSettingsModal.tsx b/src/components/lists/ListSettingsModal.tsx
index 6bae13c..7859586 100644
--- a/src/components/lists/ListSettingsModal.tsx
+++ b/src/components/lists/ListSettingsModal.tsx
@@ -15,7 +15,9 @@ import Dropdown from "@/components/ui/Dropdown";
 import { Input, Textarea } from "@/components/ui/Input";
 import Modal from "@/components/ui/Modal";
 import { Switch } from "@/components/ui/Switch";
+import { api, errorMessage } from "@/lib/api/client";
 import { ListTypeEnum } from "@/lib/db/schema";
+import * as listsApi from "@/lib/lists/contract";
 import {
   GetListResponse,
   ListListsResponse,
@@ -59,10 +61,8 @@ export default function ListSettingsModal({
   });
 
   const [formData, setFormData] = useState<ListFormData>(formDataFromProps);
-  const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState("");
   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
-  const [isDeleting, setIsDeleting] = useState(false);
 
   // All four call sites render this modal unconditionally and toggle `isOpen` as
   // a prop, so it never unmounts and the state initialiser above runs exactly
@@ -110,27 +110,19 @@ export default function ListSettingsModal({
   // having re-rendered before the request was built. Passing it explicitly
   // removes the ordering question altogether.
   const updateListMutation = useMutation({
-    mutationFn: async (payload: ListFormData) => {
-      const response = await fetch(`/api/lists/${list?.id}`, {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({
+    mutationFn: (payload: ListFormData) =>
+      api(listsApi.updateList, {
+        params: { id: list!.id },
+        body: {
           name: payload.name.trim(),
           description: (payload.description ?? "").trim() || null,
           listType: payload.listType,
           isPublic: payload.isPublic,
           isArchived: payload.isArchived,
           syncWatchStatus: payload.syncWatchStatus,
-        }),
-      });
-      const data = await response.json();
-      if (!response.ok) throw new Error(data.error || "Failed to update list");
-      return data;
-    },
-    onSuccess: (data) => {
-      const updated =
-        (data as { list: ListListsResponse }).list ??
-        (data as ListListsResponse);
+        },
+      }),
+    onSuccess: ({ list: updated }) => {
       onListUpdate?.({
         name: updated.name,
         description: updated.description,
@@ -143,14 +135,12 @@ export default function ListSettingsModal({
       onClose();
     },
     onError: (err: unknown) => {
-      setError(err instanceof Error ? err.message : "Failed to update list");
+      setError(errorMessage(err, "Failed to update list"));
     },
-    onSettled: () => setIsLoading(false),
   });
 
   const handleSave = async () => {
     if (!validateForm()) return;
-    setIsLoading(true);
     setError("");
     try {
       await updateListMutation.mutateAsync(formData);
@@ -171,7 +161,6 @@ export default function ListSettingsModal({
       syncWatchStatus: formData.isArchived ? formData.syncWatchStatus : false,
     };
 
-    setIsLoading(true);
     setError("");
     setFormData(next);
 
@@ -186,56 +175,36 @@ export default function ListSettingsModal({
   };
 
   const createListMutation = useMutation({
-    mutationFn: async () => {
-      const response = await fetch(`/api/lists`, {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        credentials: "include",
-        body: JSON.stringify({
+    mutationFn: () =>
+      api(listsApi.createList, {
+        body: {
           name: formData.name.trim(),
           description: (formData.description ?? "").trim() || null,
           listType: formData.listType,
           isPublic: formData.isPublic,
           syncWatchStatus: formData.syncWatchStatus,
-        }),
-      });
-      const data = await response.json();
-      if (!response.ok) throw new Error(data.error || "Failed to create list");
-      return data;
-    },
-    onSuccess: (data) => {
-      const created: ListListsResponse =
-        (data as { list: ListListsResponse }).list ??
-        (data as ListListsResponse);
+        },
+      }),
+    onSuccess: ({ list: created }) => {
       onListCreate?.(created);
       onClose();
     },
     onError: (err: unknown) => {
-      setError(err instanceof Error ? err.message : "Failed to create list");
+      setError(errorMessage(err, "Failed to create list"));
     },
-    onSettled: () => setIsLoading(false),
   });
 
   const deleteListMutation = useMutation({
-    mutationFn: async () => {
-      const response = await fetch(`/api/lists/${list?.id}`, {
-        method: "DELETE",
-      });
-      const data = await response.json();
-      if (!response.ok) throw new Error(data.error || "Failed to delete list");
-      return data;
-    },
+    mutationFn: () => api(listsApi.deleteList, { params: { id: list!.id } }),
     onSuccess: () => {
       onListDelete?.();
     },
     onError: (err: unknown) => {
-      setError(err instanceof Error ? err.message : "Failed to delete list");
+      setError(errorMessage(err, "Failed to delete list"));
     },
-    onSettled: () => setIsDeleting(false),
   });
 
   const handleDelete = async () => {
-    setIsDeleting(true);
     setError("");
     try {
       await deleteListMutation.mutateAsync();
@@ -244,6 +213,9 @@ export default function ListSettingsModal({
     }
   };
 
+  const isLoading = updateListMutation.isPending || createListMutation.isPending;
+  const isDeleting = deleteListMutation.isPending;
+
   const handleClose = () => {
     if (isLoading || isDeleting) return;
     setShowDeleteConfirm(false);
@@ -399,7 +371,6 @@ export default function ListSettingsModal({
                 <Button
                   onClick={async () => {
                     if (!validateForm()) return;
-                    setIsLoading(true);
                     setError("");
                     try {
                       await createListMutation.mutateAsync();
```

Apply to `src/components/lists/ListSettingsModal.test.tsx`:

```diff
diff --git a/src/components/lists/ListSettingsModal.test.tsx b/src/components/lists/ListSettingsModal.test.tsx
index e060ff9..075a79f 100644
--- a/src/components/lists/ListSettingsModal.test.tsx
+++ b/src/components/lists/ListSettingsModal.test.tsx
@@ -70,7 +70,7 @@ describe("ListSettingsModal", () => {
       ) {
         return {
           ok: true,
-          json: async () => ({ ...baseList, name: "Updated" }),
+          json: async () => ({ list: { ...baseList, name: "Updated" } }),
         } as any;
       }
       return { ok: true, json: async () => ({}) } as any;
@@ -144,7 +144,9 @@ describe("ListSettingsModal", () => {
         const body = JSON.parse(init?.body as string);
         return {
           ok: true,
-          json: async () => ({ ...baseList, isArchived: body.isArchived }),
+          json: async () => ({
+            list: { ...baseList, isArchived: body.isArchived },
+          }),
         } as any;
       }
       return { ok: true, json: async () => ({}) } as any;
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/lists src/components/lists src/lib/lists src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/lists src/app/api/lists src/components/lists/ListSettingsModal.tsx src/components/lists/ListSettingsModal.test.tsx
git commit -m "refactor: move lists and list settings onto typed contracts"
```

---

### Task 2: List items and content lookup

**Files:**
- Modify: `src/lib/lists/schemas.ts`, `src/lib/lists/contract.ts`, `src/lib/lists/types.ts`, `src/app/api/lists/[id]/items/route.ts`, `src/app/api/lists/[id]/items/[itemId]/route.ts`, `src/app/api/content/[id]/lists/route.ts`, `src/app/api/content/[id]/lists/route.test.ts`, `src/components/content/ListSelector.tsx`, `src/components/content/ListSelector.test.tsx`, `src/components/content/ContentDetailsModal.tsx`
- Test: `src/app/api/lists/[id]/items/route.test.ts`

**Interfaces:**
- Consumes: `listParams`, `TMDB_ID_INVALID`, `q` (Task 1, `schemas.ts`). `LIST_NOT_FOUND` (Task 1, `contract.ts`).
- Produces: contracts `getListItems`, `createListItem`, `deleteListItem`, `listContentLists`, and their `*Schemas`. Type `ContentListEntry`.

`/api/content/[id]/lists` keeps its database query in the route, because moving it to a service is out of scope. Its test stops mocking `withAuth` and uses the real wrapper with a mocked session, so it needs real route context.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/lists/[id]/items/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createListItem = vi.fn();
const deleteListItem = vi.fn();
const getListItems = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/lists/service", () => ({
  createListItem: (...args: unknown[]) => createListItem(...args),
  deleteListItem: (...args: unknown[]) => deleteListItem(...args),
  getListItems: (...args: unknown[]) => getListItems(...args),
}));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[itemId]/route");

const LIST_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const ITEM_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const URL_BASE = `http://localhost/api/lists/${LIST_ID}/items`;
const headers = { cookie: "session=valid" };
const context = { params: Promise.resolve({ id: LIST_ID }) };

function get(search = "") {
  return GET(new NextRequest(`${URL_BASE}${search}`, { headers }), context);
}

function post(body: string) {
  return POST(
    new NextRequest(URL_BASE, { method: "POST", headers, body }),
    context,
  );
}

describe("GET /api/lists/[id]/items", () => {
  it("defaults to ascending with no filter", async () => {
    getListItems.mockResolvedValue({ items: [] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(getListItems).toHaveBeenCalledWith(
      "user-1",
      LIST_ID,
      undefined,
      "ascending",
    );
  });

  it("keeps valid statuses and ignores unknown ones", async () => {
    getListItems.mockResolvedValue({ items: [] });
    const response = await get(
      "?watchStatus=watching&watchStatus=bogus&watchStatus=none&sortOrder=descending",
    );
    expect(response.status).toBe(200);
    expect(getListItems).toHaveBeenCalledWith(
      "user-1",
      LIST_ID,
      ["watching", "none"],
      "descending",
    );
  });

  it("treats an unknown sort order as ascending", async () => {
    getListItems.mockResolvedValue({ items: [] });
    const response = await get("?sortOrder=sideways&watchStatus=bogus");
    expect(response.status).toBe(200);
    expect(getListItems).toHaveBeenCalledWith(
      "user-1",
      LIST_ID,
      [],
      "ascending",
    );
  });

  it("maps notFound to a 404", async () => {
    getListItems.mockResolvedValue("notFound");
    const response = await get();
    expect(response.status).toBe(404);
  });
});

describe("POST /api/lists/[id]/items", () => {
  it("adds an item, ignoring extra fields older clients send", async () => {
    createListItem.mockResolvedValue({ id: ITEM_ID });
    const response = await post(
      '{"tmdbId":550,"contentType":"movie","title":"Fight Club","posterPath":"/x.jpg"}',
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ item: { id: ITEM_ID } });
    expect(createListItem).toHaveBeenCalledWith("user-1", LIST_ID, {
      tmdbId: 550,
      contentType: "movie",
    });
  });

  it.each([
    ['{"tmdbId":"../../authentication/token/new","contentType":"movie"}'],
    ['{"tmdbId":1.5,"contentType":"movie"}'],
    ['{"tmdbId":-1,"contentType":"movie"}'],
    ['{"contentType":"movie"}'],
    ['{"tmdbId":1,"contentType":"book"}'],
    ['{"tmdbId":1}'],
  ])("rejects %s", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation");
    expect(createListItem).not.toHaveBeenCalled();
  });

  it.each([
    ["notFound", 404],
    ["invalidType", 400],
    ["conflict", 409],
  ])("maps the service's %s to %i", async (code, status) => {
    createListItem.mockResolvedValue(code);
    const response = await post('{"tmdbId":1,"contentType":"tv"}');
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("DELETE /api/lists/[id]/items/[itemId]", () => {
  const del = (itemId = ITEM_ID) =>
    DELETE(
      new NextRequest(`${URL_BASE}/${itemId}`, { method: "DELETE", headers }),
      { params: Promise.resolve({ id: LIST_ID, itemId }) },
    );

  it("passes both ids to the service", async () => {
    deleteListItem.mockResolvedValue({ message: "removed" });
    const response = await del();
    expect(response.status).toBe(200);
    expect(deleteListItem).toHaveBeenCalledWith("user-1", LIST_ID, ITEM_ID);
  });

  it("rejects a malformed item id", async () => {
    const response = await del("nope");
    expect(response.status).toBe(400);
    expect(deleteListItem).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    deleteListItem.mockResolvedValue("notFound");
    const response = await del();
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Item or list not found");
  });
});
```

Apply to `src/app/api/content/[id]/lists/route.test.ts`:

```diff
diff --git a/src/app/api/content/[id]/lists/route.test.ts b/src/app/api/content/[id]/lists/route.test.ts
index e7d53ad..3f950ae 100644
--- a/src/app/api/content/[id]/lists/route.test.ts
+++ b/src/app/api/content/[id]/lists/route.test.ts
@@ -1,4 +1,5 @@
 // @vitest-environment node
+import { NextRequest } from "next/server";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
 // Records the conditions the handler builds so we can assert that content type
@@ -19,6 +20,10 @@ vi.mock("@/lib/db", () => {
 });
 
 vi.mock("@/lib/db/schema", () => ({
+  ContentType: { MOVIE: "movie", TV: "tv" },
+  ListType: { MOVIE: "movies", TV: "tv", MIXED: "mixed" },
+  PermissionLevel: { COLLABORATOR: "collaborator", VIEWER: "viewer" },
+  WatchStatus: { PLANNING: "planning" },
   listCollaborators: { listId: "lc.listId", userId: "lc.userId" },
   listItems: {
     id: "li.id",
@@ -35,15 +40,18 @@ vi.mock("drizzle-orm", () => ({
   or: (...parts: unknown[]) => ({ op: "or", parts }),
 }));
 
-// withAuth is exercised by its own middleware; here we only need the handler.
-vi.mock("@/lib/auth/api-middleware", () => ({
-  withAuth: (handler: unknown) => handler,
+vi.mock("@/lib/auth/webauthn", () => ({
+  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
 }));
 
 const { GET } = await import("./route");
 
-function request(url: string) {
-  return { url, user: { id: "user-1" } } as never;
+function get(url: string) {
+  const id = new URL(url).pathname.split("/")[3]!;
+  return GET(
+    new NextRequest(url, { headers: { cookie: "session=valid" } }),
+    { params: Promise.resolve({ id }) },
+  );
 }
 
 function flatten(condition: unknown): unknown[] {
@@ -63,14 +71,24 @@ describe("GET /api/content/[id]/lists", () => {
     vi.spyOn(console, "error").mockImplementation(() => {});
   });
 
+  it("rejects a content id with trailing characters", async () => {
+    const response = await get(
+      "http://localhost/api/content/550abc/lists?contentType=movie",
+    );
+
+    expect(response.status).toBe(400);
+    expect(recorded.conditions).toHaveLength(0);
+  });
+
   it("rejects a non-numeric content id", async () => {
-    const response = await GET(
-      request("http://localhost/api/content/abc/lists?contentType=movie"),
+    const response = await get(
+      "http://localhost/api/content/abc/lists?contentType=movie",
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid content ID",
+      code: "validation",
     });
   });
 
@@ -79,20 +97,21 @@ describe("GET /api/content/[id]/lists", () => {
   // badge for a list the title was never in, and a Remove that deleted the
   // unrelated row.
   it("requires a content type", async () => {
-    const response = await GET(
-      request("http://localhost/api/content/550/lists"),
+    const response = await get(
+      "http://localhost/api/content/550/lists",
     );
 
     expect(response.status).toBe(400);
-    await expect(response.json()).resolves.toEqual({
+    await expect(response.json()).resolves.toMatchObject({
       error: "Invalid content type",
+      code: "validation",
     });
     expect(recorded.conditions).toHaveLength(0);
   });
 
   it("rejects a content type that is not movie or tv", async () => {
-    const response = await GET(
-      request("http://localhost/api/content/550/lists?contentType=book"),
+    const response = await get(
+      "http://localhost/api/content/550/lists?contentType=book",
     );
 
     expect(response.status).toBe(400);
@@ -100,8 +119,8 @@ describe("GET /api/content/[id]/lists", () => {
   });
 
   it("filters on both tmdb id and content type", async () => {
-    const response = await GET(
-      request("http://localhost/api/content/550/lists?contentType=tv"),
+    const response = await get(
+      "http://localhost/api/content/550/lists?contentType=tv",
     );
 
     expect(response.status).toBe(200);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run "src/app/api/lists/[[]id[]]/items" "src/app/api/content"`
Expected: FAIL. Bodies lack `code`, `550abc` passes, and `1.5` and numeric-string cases aren't all rejected.

- [ ] **Step 3: Extend the schemas, types, and contract**

Apply to `src/lib/lists/schemas.ts`:

```diff
diff --git a/src/lib/lists/schemas.ts b/src/lib/lists/schemas.ts
index e9297e7..d2ea1cc 100644
--- a/src/lib/lists/schemas.ts
+++ b/src/lib/lists/schemas.ts
@@ -46,3 +46,48 @@ export const updateListSchemas = {
 };
 
 export const deleteListSchemas = { params: listParams };
+
+export const getListItemsSchemas = {
+  params: listParams,
+  // Deliberately forgiving: old URLs can carry filter values that no longer
+  // exist, through ListFilters, and those are ignored rather than rejected.
+  query: z.object({
+    watchStatus: q
+      .list(z.enum({ ...WatchStatus, NONE: "none" }), { dropInvalid: true })
+      .optional(),
+    sortOrder: z
+      .enum(["ascending", "descending"])
+      .default("ascending")
+      .catch("ascending"),
+  }),
+};
+
+export const createListItemSchemas = {
+  params: listParams,
+  body: z.object({
+    // A positive integer at the boundary (API-06), so a crafted string (e.g.
+    // "../../authentication/token/new") can never reach the upstream TMDB path
+    // template.
+    tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
+    contentType: z.enum(
+      ContentType,
+      'contentType must be either "movie" or "tv"',
+    ),
+  }),
+};
+
+export const deleteListItemSchemas = {
+  params: z.object({
+    id: z.uuid("Invalid list ID"),
+    itemId: z.uuid("Invalid item ID"),
+  }),
+};
+
+export const listContentListsSchemas = {
+  params: z.object({ id: q.int({ min: 1, message: "Invalid content ID" }) }),
+  query: z.object({
+    // A TMDB id is only unique within a content type, and `list_items` is keyed
+    // on (listId, tmdbId, contentType), so the caller must say which it means.
+    contentType: z.enum(ContentType, "Invalid content type"),
+  }),
+};
```

Apply to `src/lib/lists/types.ts`:

```diff
diff --git a/src/lib/lists/types.ts b/src/lib/lists/types.ts
index b67e1eb..7c35ddd 100644
--- a/src/lib/lists/types.ts
+++ b/src/lib/lists/types.ts
@@ -77,6 +77,11 @@ export interface ListItemRow {
   createdAt: string;
 }
 
+export interface ContentListEntry {
+  listId: string;
+  itemId: string;
+}
+
 export interface Collaborator {
   id: string;
   userId: string;
```

Apply to `src/lib/lists/contract.ts`:

```diff
diff --git a/src/lib/lists/contract.ts b/src/lib/lists/contract.ts
index e401bca..fc00085 100644
--- a/src/lib/lists/contract.ts
+++ b/src/lib/lists/contract.ts
@@ -1,13 +1,20 @@
 import { defineContract, schemas, type } from "../api/contract";
 import type {
+  createListItemSchemas,
   createListSchemas,
+  deleteListItemSchemas,
   deleteListSchemas,
+  getListItemsSchemas,
   getListSchemas,
+  listContentListsSchemas,
   updateListSchemas,
 } from "./schemas";
 import type {
+  ContentListEntry,
   DeleteResponse,
+  GetListItemsResponse,
   GetListResponse,
+  ListItemRow,
   ListListsResponse,
 } from "./types";
 
@@ -74,3 +81,45 @@ export const deleteList = defineContract({
     },
   },
 });
+
+export const getListItems = defineContract({
+  method: "GET",
+  path: "/api/lists/[id]/items",
+  label: "Get list items",
+  schemas: schemas<typeof getListItemsSchemas>(),
+  response: type<GetListItemsResponse>(),
+  errors: { notFound: LIST_NOT_FOUND },
+});
+
+export const createListItem = defineContract({
+  method: "POST",
+  path: "/api/lists/[id]/items",
+  label: "Add item to list",
+  status: 201,
+  schemas: schemas<typeof createListItemSchemas>(),
+  response: type<{ item: ListItemRow }>(),
+  errors: {
+    notFound: { status: 404, message: "List not found or access denied" },
+    invalidType: { status: 400, message: "Invalid content type for list" },
+    conflict: { status: 409, message: "This item is already in the list" },
+  },
+});
+
+export const deleteListItem = defineContract({
+  method: "DELETE",
+  path: "/api/lists/[id]/items/[itemId]",
+  label: "Remove item from list",
+  schemas: schemas<typeof deleteListItemSchemas>(),
+  response: type<DeleteResponse>(),
+  errors: {
+    notFound: { status: 404, message: "Item or list not found" },
+  },
+});
+
+export const listContentLists = defineContract({
+  method: "GET",
+  path: "/api/content/[id]/lists",
+  label: "Get lists containing content",
+  schemas: schemas<typeof listContentListsSchemas>(),
+  response: type<ContentListEntry[]>(),
+});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/lists/[id]/items/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  createListItemSchemas,
  getListItemsSchemas,
} from "@/lib/lists/schemas";
import { createListItem, getListItems } from "@/lib/lists/service";

// GET /api/lists/[id]/items - Get a list's items
export const GET = authedRoute(
  listsApi.getListItems,
  getListItemsSchemas,
  ({ user, params, query }) =>
    getListItems(user.id, params.id, query.watchStatus, query.sortOrder),
);

// POST /api/lists/[id]/items - Add item to list
export const POST = authedRoute(
  listsApi.createListItem,
  createListItemSchemas,
  async ({ user, params, body }) => {
    const item = await createListItem(user.id, params.id, body);
    return typeof item === "string" ? item : { item };
  },
);
```

Replace `src/app/api/lists/[id]/items/[itemId]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { deleteListItemSchemas } from "@/lib/lists/schemas";
import { deleteListItem } from "@/lib/lists/service";

// DELETE /api/lists/[id]/items/[itemId] - Remove item from list
export const DELETE = authedRoute(
  listsApi.deleteListItem,
  deleteListItemSchemas,
  ({ user, params }) => deleteListItem(user.id, params.id, params.itemId),
);
```

Replace `src/app/api/content/[id]/lists/route.ts` with:

```ts
import { and, eq, or } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { listCollaborators, listItems, lists } from "@/lib/db/schema";
import * as listsApi from "@/lib/lists/contract";
import { listContentListsSchemas } from "@/lib/lists/schemas";

// GET /api/content/[id]/lists - The user's lists containing this content
//
// Matching on the TMDB id alone reported the movie's row for the show and vice
// versa, which showed an "Added" badge for a list the title was never in and
// made Remove delete the unrelated row, so the query filters on the type too.
export const GET = authedRoute(
  listsApi.listContentLists,
  listContentListsSchemas,
  async ({ user, params, query }) => {
    // Find all lists where the user is owner or collaborator that contain this content
    const userListsWithContent = await db
      .select({
        listId: lists.id,
        itemId: listItems.id,
      })
      .from(lists)
      .innerJoin(listItems, eq(lists.id, listItems.listId))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          or(eq(lists.ownerId, user.id), eq(listCollaborators.userId, user.id)),
          eq(listItems.tmdbId, params.id),
          eq(listItems.contentType, query.contentType),
        ),
      );

    return userListsWithContent.map((item) => ({
      listId: item.listId,
      itemId: item.itemId,
    }));
  },
);
```

- [ ] **Step 5: Update `ListSelector` and its callers**

Nothing read `title` and `posterPath` except the request body, and the route ignored them there, so both props go.

Apply to `src/components/content/ListSelector.tsx`:

```diff
diff --git a/src/components/content/ListSelector.tsx b/src/components/content/ListSelector.tsx
index fd4657a..4705e20 100644
--- a/src/components/content/ListSelector.tsx
+++ b/src/components/content/ListSelector.tsx
@@ -13,7 +13,8 @@ import {
 import { useMemo, useState } from "react";
 
 import ListSettingsModal from "@/components/lists/ListSettingsModal";
-import type { ListListsResponse } from "@/lib/lists/types";
+import { api } from "@/lib/api/client";
+import * as listsApi from "@/lib/lists/contract";
 import { cn } from "@/lib/utils";
 
 import { Badge } from "../ui/Badge";
@@ -23,8 +24,6 @@ import { LoadingSpinner } from "../ui/LoadingSpinner";
 export interface ListSelectorProps {
   contentType: "movie" | "tv";
   contentId: number;
-  title: string;
-  posterPath?: string | null;
   currentListId?: string;
   onInclusionChange?: () => void;
   className?: string;
@@ -33,8 +32,6 @@ export interface ListSelectorProps {
 export function ListSelector({
   contentType,
   contentId,
-  title,
-  posterPath,
   currentListId,
   onInclusionChange,
   className,
@@ -45,35 +42,25 @@ export function ListSelector({
     data: listsData,
     isLoading,
     error,
-  } = useQuery<{ lists: ListListsResponse[] }>({
+  } = useQuery({
     queryKey: ["lists"],
-    queryFn: async () => {
-      const response = await fetch("/api/lists");
-      if (!response.ok) throw new Error("Failed to fetch lists");
-      return response.json();
-    },
+    queryFn: ({ signal }) => api(listsApi.listLists, {}, { signal }),
   });
 
   // The content type belongs in both the key and the request: a TMDB id is only
   // unique within a type, so a movie and a show can share one, and without it
   // the two collide in the cache and in the query behind it.
-  const { data: listsWithContentData } = useQuery<
-    {
-      listId: string;
-      itemId: string;
-    }[]
-  >({
+  const { data: listsWithContentData } = useQuery({
     queryKey: ["content", contentId, contentType, "lists"],
-    queryFn: async () => {
-      const response = await fetch(
-        `/api/content/${contentId}/lists?contentType=${contentType}`,
-      );
-      if (!response.ok) throw new Error("Failed to fetch lists for content");
-      return response.json();
-    },
+    queryFn: ({ signal }) =>
+      api(
+        listsApi.listContentLists,
+        { params: { id: contentId }, query: { contentType } },
+        { signal },
+      ),
   });
 
-  const lists = (listsData?.lists || []) as ListListsResponse[];
+  const lists = listsData?.lists ?? [];
   const listsWithContent = useMemo(() => {
     const data = listsWithContentData || [];
     return data.reduce(
@@ -95,20 +82,10 @@ export function ListSelector({
 
   const addToListMutation = useMutation({
     mutationFn: async (listId: string) => {
-      const response = await fetch(`/api/lists/${listId}/items`, {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({
-          tmdbId: contentId,
-          contentType,
-          title,
-          posterPath,
-        }),
+      await api(listsApi.createListItem, {
+        params: { id: listId },
+        body: { tmdbId: contentId, contentType },
       });
-      const data = await response.json();
-      if (!response.ok) {
-        throw new Error(data.error || "Failed to add content to list");
-      }
       return { listId };
     },
     onSuccess: async ({ listId }) => {
@@ -131,13 +108,7 @@ export function ListSelector({
       listId: string;
       itemId: string;
     }) => {
-      const response = await fetch(`/api/lists/${listId}/items/${itemId}`, {
-        method: "DELETE",
-      });
-      const data = await response.json();
-      if (!response.ok) {
-        throw new Error(data.error || "Failed to remove content from list");
-      }
+      await api(listsApi.deleteListItem, { params: { id: listId, itemId } });
       return { listId, itemId };
     },
     onSuccess: async ({ listId }) => {
```

Apply to `src/components/content/ContentDetailsModal.tsx`:

```diff
diff --git a/src/components/content/ContentDetailsModal.tsx b/src/components/content/ContentDetailsModal.tsx
index fc42270..13e5297 100644
--- a/src/components/content/ContentDetailsModal.tsx
+++ b/src/components/content/ContentDetailsModal.tsx
@@ -566,8 +566,6 @@ export function ContentDetailsModal({
                     <ListSelector
                       contentType={content.contentType}
                       contentId={content.tmdbId}
-                      title={content.title}
-                      posterPath={content.posterPath}
                       currentListId={currentListId}
                       onInclusionChange={onInclusionChange}
                     />
```

Apply to `src/components/content/ListSelector.test.tsx`:

```diff
diff --git a/src/components/content/ListSelector.test.tsx b/src/components/content/ListSelector.test.tsx
index 5c8a299..d8b2178 100644
--- a/src/components/content/ListSelector.test.tsx
+++ b/src/components/content/ListSelector.test.tsx
@@ -92,8 +92,6 @@ describe("ListSelector", () => {
       <ListSelector
         contentType="tv"
         contentId={contentId}
-        title="Test Show"
-        posterPath={null}
         currentListId="list2"
       />,
     );
@@ -195,8 +193,6 @@ describe("ListSelector", () => {
       <ListSelector
         contentType="tv"
         contentId={contentId}
-        title="Test Show"
-        posterPath={null}
       />,
       client,
     );
@@ -255,8 +251,6 @@ describe("ListSelector", () => {
       <ListSelector
         contentType="movie"
         contentId={contentId}
-        title="Shared Id"
-        posterPath={null}
       />,
       client,
     );
@@ -269,8 +263,6 @@ describe("ListSelector", () => {
       <ListSelector
         contentType="tv"
         contentId={contentId}
-        title="Shared Id"
-        posterPath={null}
       />,
       client,
     );
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/lists src/app/api/content src/components/content/ListSelector.test.tsx src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lists src/app/api/lists src/app/api/content src/components/content/ListSelector.tsx src/components/content/ListSelector.test.tsx src/components/content/ContentDetailsModal.tsx
git commit -m "refactor: move list items and content lookup onto typed contracts"
```

---

### Task 3: Collaborators

**Files:**
- Modify: `src/lib/lists/schemas.ts`, `src/lib/lists/contract.ts`, `src/app/api/lists/[id]/collaborators/route.ts`, `src/app/api/lists/[id]/collaborators/[userId]/route.ts`, `src/components/lists/CollaborationModal.tsx`
- Test: `src/app/api/lists/[id]/collaborators/route.test.ts`

**Interfaces:**
- Consumes: `listParams`, `PermissionLevel` (Task 1, `schemas.ts`). `LIST_NOT_FOUND` (Task 1, `contract.ts`). `api`, `errorMessage` (layer 1).
- Produces: contracts `listListCollaborators`, `createListCollaborator`, `updateListCollaborator`, `deleteListCollaborator`, and their `*Schemas`.

`CollaborationModal.test.tsx` needs no change. It stubs `fetch` and asserts on the UI.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/lists/[id]/collaborators/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createListCollaborator = vi.fn();
const deleteListCollaborator = vi.fn();
const listListCollaborators = vi.fn();
const updateListCollaborator = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner-1" })),
}));

vi.mock("@/lib/lists/service", () => ({
  createListCollaborator: (...args: unknown[]) =>
    createListCollaborator(...args),
  deleteListCollaborator: (...args: unknown[]) =>
    deleteListCollaborator(...args),
  listListCollaborators: (...args: unknown[]) => listListCollaborators(...args),
  updateListCollaborator: (...args: unknown[]) =>
    updateListCollaborator(...args),
}));

const collection = await import("./route");
const single = await import("./[userId]/route");

const LIST_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const USER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const BASE = `http://localhost/api/lists/${LIST_ID}/collaborators`;
const headers = { cookie: "session=valid" };
const listContext = { params: Promise.resolve({ id: LIST_ID }) };
const userContext = (userId = USER_ID) => ({
  params: Promise.resolve({ id: LIST_ID, userId }),
});

function post(body: string) {
  return collection.POST(
    new NextRequest(BASE, { method: "POST", headers, body }),
    listContext,
  );
}

function put(body: string, userId?: string) {
  return single.PUT(
    new NextRequest(`${BASE}/${USER_ID}`, { method: "PUT", headers, body }),
    userContext(userId),
  );
}

describe("GET collaborators", () => {
  it.each([
    ["notFound", 404, "List not found"],
    ["forbidden", 403, "Only the list owner can view collaborators"],
  ])("maps %s to %i", async (code, status, error) => {
    listListCollaborators.mockResolvedValue(code);
    const response = await collection.GET(
      new NextRequest(BASE, { headers }),
      listContext,
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });

  it("returns the service's result", async () => {
    listListCollaborators.mockResolvedValue({ collaborators: [] });
    const response = await collection.GET(
      new NextRequest(BASE, { headers }),
      listContext,
    );
    await expect(response.json()).resolves.toEqual({ collaborators: [] });
    expect(listListCollaborators).toHaveBeenCalledWith("owner-1", LIST_ID);
  });
});

describe("POST collaborators", () => {
  it("trims the username and defaults the permission level", async () => {
    createListCollaborator.mockResolvedValue({ message: "added" });
    const response = await post('{"username":"  sam  "}');
    expect(response.status).toBe(200);
    expect(createListCollaborator).toHaveBeenCalledWith("owner-1", LIST_ID, {
      username: "sam",
      permissionLevel: "collaborator",
    });
  });

  // Each of these used to reach `.trim()` or the service with the wrong type
  // and come back as a 500.
  it.each([
    ['{"username":123}', "Username is required"],
    ['{"username":"   "}', "Username is required"],
    ["{}", "Username is required"],
    ['{"username":"a","permissionLevel":"admin"}', "Invalid permission level"],
    ["{bad", "Request body must be valid JSON"],
  ])("rejects %s with a 400", async (body, error) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(createListCollaborator).not.toHaveBeenCalled();
  });

  it.each([
    ["notFound", 404],
    ["forbidden", 403],
    ["invalidUser", 400],
    ["conflict", 409],
  ])("maps the service's %s to %i", async (code, status) => {
    createListCollaborator.mockResolvedValue(code);
    const response = await post('{"username":"sam"}');
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("/api/lists/[id]/collaborators/[userId]", () => {
  it("updates using both ids from the route context", async () => {
    updateListCollaborator.mockResolvedValue({ message: "updated" });
    const response = await put('{"permissionLevel":"viewer"}');
    expect(response.status).toBe(200);
    expect(updateListCollaborator).toHaveBeenCalledWith(
      "owner-1",
      LIST_ID,
      USER_ID,
      { permissionLevel: "viewer" },
    );
  });

  it("requires a valid permission level", async () => {
    const response = await put('{"permissionLevel":"admin"}');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Valid permission level is required",
    );
    expect(updateListCollaborator).not.toHaveBeenCalled();
  });

  it("rejects a malformed user id", async () => {
    const response = await put('{"permissionLevel":"viewer"}', "nope");
    expect(response.status).toBe(400);
    expect(updateListCollaborator).not.toHaveBeenCalled();
  });

  it("maps delete failures to their own messages", async () => {
    deleteListCollaborator.mockResolvedValue("forbidden");
    const response = await single.DELETE(
      new NextRequest(`${BASE}/${USER_ID}`, { method: "DELETE", headers }),
      userContext(),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Only the list owner can remove collaborators",
    );
  });

  it("deletes using both ids", async () => {
    deleteListCollaborator.mockResolvedValue({ message: "removed" });
    const response = await single.DELETE(
      new NextRequest(`${BASE}/${USER_ID}`, { method: "DELETE", headers }),
      userContext(),
    );
    expect(response.status).toBe(200);
    expect(deleteListCollaborator).toHaveBeenCalledWith(
      "owner-1",
      LIST_ID,
      USER_ID,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run "src/app/api/lists/[[]id[]]/collaborators"`
Expected: FAIL. `username: 123` and malformed JSON return 500, bodies lack `code`, and the `nope` user ID isn't rejected.

- [ ] **Step 3: Extend the schemas and contract**

Apply to `src/lib/lists/schemas.ts`:

```diff
diff --git a/src/lib/lists/schemas.ts b/src/lib/lists/schemas.ts
index d2ea1cc..3b3e36d 100644
--- a/src/lib/lists/schemas.ts
+++ b/src/lib/lists/schemas.ts
@@ -91,3 +91,35 @@ export const listContentListsSchemas = {
     contentType: z.enum(ContentType, "Invalid content type"),
   }),
 };
+
+const collaboratorParams = z.object({
+  id: z.uuid("Invalid list ID"),
+  userId: z.uuid("Invalid user ID"),
+});
+
+export const listListCollaboratorsSchemas = { params: listParams };
+
+export const createListCollaboratorSchemas = {
+  params: listParams,
+  body: z.object({
+    username: z
+      .string("Username is required")
+      .trim()
+      .min(1, "Username is required"),
+    permissionLevel: z
+      .enum(PermissionLevel, "Invalid permission level")
+      .default(PermissionLevel.COLLABORATOR),
+  }),
+};
+
+export const updateListCollaboratorSchemas = {
+  params: collaboratorParams,
+  body: z.object({
+    permissionLevel: z.enum(
+      PermissionLevel,
+      "Valid permission level is required",
+    ),
+  }),
+};
+
+export const deleteListCollaboratorSchemas = { params: collaboratorParams };
```

Apply to `src/lib/lists/contract.ts`:

```diff
diff --git a/src/lib/lists/contract.ts b/src/lib/lists/contract.ts
index fc00085..7c88258 100644
--- a/src/lib/lists/contract.ts
+++ b/src/lib/lists/contract.ts
@@ -1,12 +1,16 @@
 import { defineContract, schemas, type } from "../api/contract";
 import type {
+  createListCollaboratorSchemas,
   createListItemSchemas,
   createListSchemas,
+  deleteListCollaboratorSchemas,
   deleteListItemSchemas,
   deleteListSchemas,
   getListItemsSchemas,
   getListSchemas,
   listContentListsSchemas,
+  listListCollaboratorsSchemas,
+  updateListCollaboratorSchemas,
   updateListSchemas,
 } from "./schemas";
 import type {
@@ -14,8 +18,10 @@ import type {
   DeleteResponse,
   GetListItemsResponse,
   GetListResponse,
+  ListCollaboratorsResponse,
   ListItemRow,
   ListListsResponse,
+  UpdateCollaboratorsResponse,
 } from "./types";
 
 const LIST_NOT_FOUND = { status: 404, message: "List not found" };
@@ -123,3 +129,73 @@ export const listContentLists = defineContract({
   schemas: schemas<typeof listContentListsSchemas>(),
   response: type<ContentListEntry[]>(),
 });
+
+export const listListCollaborators = defineContract({
+  method: "GET",
+  path: "/api/lists/[id]/collaborators",
+  label: "Get collaborators",
+  schemas: schemas<typeof listListCollaboratorsSchemas>(),
+  response: type<ListCollaboratorsResponse>(),
+  errors: {
+    notFound: LIST_NOT_FOUND,
+    forbidden: {
+      status: 403,
+      message: "Only the list owner can view collaborators",
+    },
+  },
+});
+
+export const createListCollaborator = defineContract({
+  method: "POST",
+  path: "/api/lists/[id]/collaborators",
+  label: "Add collaborator",
+  schemas: schemas<typeof createListCollaboratorSchemas>(),
+  response: type<UpdateCollaboratorsResponse>(),
+  errors: {
+    notFound: LIST_NOT_FOUND,
+    forbidden: {
+      status: 403,
+      message: "Only the list owner can add collaborators",
+    },
+    invalidUser: { status: 400, message: "Invalid target user" },
+    conflict: {
+      status: 409,
+      message: "User is already a collaborator on this list",
+    },
+  },
+});
+
+const COLLABORATOR_NOT_FOUND = {
+  status: 404,
+  message: "List or collaborator not found",
+};
+
+export const updateListCollaborator = defineContract({
+  method: "PUT",
+  path: "/api/lists/[id]/collaborators/[userId]",
+  label: "Update collaborator",
+  schemas: schemas<typeof updateListCollaboratorSchemas>(),
+  response: type<UpdateCollaboratorsResponse>(),
+  errors: {
+    notFound: COLLABORATOR_NOT_FOUND,
+    forbidden: {
+      status: 403,
+      message: "Only the list owner can update collaborator permissions",
+    },
+  },
+});
+
+export const deleteListCollaborator = defineContract({
+  method: "DELETE",
+  path: "/api/lists/[id]/collaborators/[userId]",
+  label: "Remove collaborator",
+  schemas: schemas<typeof deleteListCollaboratorSchemas>(),
+  response: type<DeleteResponse>(),
+  errors: {
+    notFound: COLLABORATOR_NOT_FOUND,
+    forbidden: {
+      status: 403,
+      message: "Only the list owner can remove collaborators",
+    },
+  },
+});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/lists/[id]/collaborators/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  createListCollaboratorSchemas,
  listListCollaboratorsSchemas,
} from "@/lib/lists/schemas";
import {
  createListCollaborator,
  listListCollaborators,
} from "@/lib/lists/service";

// GET /api/lists/[id]/collaborators - Get all collaborators for a list
export const GET = authedRoute(
  listsApi.listListCollaborators,
  listListCollaboratorsSchemas,
  ({ user, params }) => listListCollaborators(user.id, params.id),
);

// POST /api/lists/[id]/collaborators - Add a new collaborator to a list
export const POST = authedRoute(
  listsApi.createListCollaborator,
  createListCollaboratorSchemas,
  ({ user, params, body }) =>
    createListCollaborator(user.id, params.id, body),
);
```

Replace `src/app/api/lists/[id]/collaborators/[userId]/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  deleteListCollaboratorSchemas,
  updateListCollaboratorSchemas,
} from "@/lib/lists/schemas";
import {
  deleteListCollaborator,
  updateListCollaborator,
} from "@/lib/lists/service";

// PUT /api/lists/[id]/collaborators/[userId] - Update collaborator permissions
export const PUT = authedRoute(
  listsApi.updateListCollaborator,
  updateListCollaboratorSchemas,
  ({ user, params, body }) =>
    updateListCollaborator(user.id, params.id, params.userId, body),
);

// DELETE /api/lists/[id]/collaborators/[userId] - Remove a collaborator from a list
export const DELETE = authedRoute(
  listsApi.deleteListCollaborator,
  deleteListCollaboratorSchemas,
  ({ user, params }) =>
    deleteListCollaborator(user.id, params.id, params.userId),
);
```

- [ ] **Step 5: Update the modal**

Apply to `src/components/lists/CollaborationModal.tsx`:

```diff
diff --git a/src/components/lists/CollaborationModal.tsx b/src/components/lists/CollaborationModal.tsx
index 8b77fa4..9a343b3 100644
--- a/src/components/lists/CollaborationModal.tsx
+++ b/src/components/lists/CollaborationModal.tsx
@@ -8,11 +8,10 @@ import { Button } from "@/components/ui/Button";
 import Dropdown from "@/components/ui/Dropdown";
 import { Input } from "@/components/ui/Input";
 import Modal from "@/components/ui/Modal";
+import { api, errorMessage } from "@/lib/api/client";
 import { PermissionLevel, type PermissionLevelEnum } from "@/lib/db/schema";
-import {
-  Collaborator,
-  CreateCollaboratorInput,
-} from "@/lib/lists/types";
+import * as listsApi from "@/lib/lists/contract";
+import { CreateCollaboratorInput } from "@/lib/lists/types";
 
 import { ProfileImage } from "../ui/ProfileImage";
 
@@ -40,19 +39,14 @@ export default function CollaborationModal({
   const [newUsername, setNewUsername] = useState("");
   const [newPermissionLevel, setNewPermissionLevel] =
     useState<PermissionLevelEnum>(PermissionLevel.COLLABORATOR);
-  const [addingCollaborator, setAddingCollaborator] = useState(false);
 
   const queryClient = useQueryClient();
 
-  const collaboratorsQuery = useQuery<{ collaborators: Collaborator[] }>({
+  const collaboratorsQuery = useQuery({
     queryKey: ["lists", listId, "collaborators"],
     enabled: isOpen && isOwner,
-    queryFn: async () => {
-      const response = await fetch(`/api/lists/${listId}/collaborators`);
-      if (!response.ok) throw new Error("Failed to fetch collaborators");
-      const data = await response.json();
-      return data;
-    },
+    queryFn: ({ signal }) =>
+      api(listsApi.listListCollaborators, { params: { id: listId } }, { signal }),
   });
 
   const addCollaborator = async () => {
@@ -69,21 +63,11 @@ export default function CollaborationModal({
   };
 
   const addCollaboratorMutation = useMutation({
-    mutationFn: async ({
-      username,
-      permissionLevel,
-    }: CreateCollaboratorInput) => {
-      setAddingCollaborator(true);
-      const response = await fetch(`/api/lists/${listId}/collaborators`, {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ username, permissionLevel }),
-      });
-      const data = await response.json();
-      if (!response.ok)
-        throw new Error(data.error || "Failed to add collaborator");
-      return data;
-    },
+    mutationFn: (input: CreateCollaboratorInput) =>
+      api(listsApi.createListCollaborator, {
+        params: { id: listId },
+        body: input,
+      }),
     onSuccess: (data) => {
       setSuccess(data.message);
       setNewUsername("");
@@ -93,11 +77,8 @@ export default function CollaborationModal({
       });
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to add collaborator",
-      );
+      setError(errorMessage(err, "Failed to add collaborator"));
     },
-    onSettled: () => setAddingCollaborator(false),
   });
 
   const removeCollaborator = async (
@@ -116,20 +97,10 @@ export default function CollaborationModal({
   };
 
   const removeCollaboratorMutation = useMutation({
-    mutationFn: async ({
-      collaboratorUserId,
-    }: {
-      collaboratorUserId: string;
-    }) => {
-      const response = await fetch(
-        `/api/lists/${listId}/collaborators/${collaboratorUserId}`,
-        { method: "DELETE" },
-      );
-      const data = await response.json();
-      if (!response.ok)
-        throw new Error(data.error || "Failed to remove collaborator");
-      return { collaboratorUserId, message: data.message };
-    },
+    mutationFn: ({ collaboratorUserId }: { collaboratorUserId: string }) =>
+      api(listsApi.deleteListCollaborator, {
+        params: { id: listId, userId: collaboratorUserId },
+      }),
     onSuccess: ({ message }) => {
       setSuccess(message);
       queryClient.invalidateQueries({
@@ -137,9 +108,7 @@ export default function CollaborationModal({
       });
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to remove collaborator",
-      );
+      setError(errorMessage(err, "Failed to remove collaborator"));
     },
   });
 
@@ -153,26 +122,17 @@ export default function CollaborationModal({
   };
 
   const updatePermissionMutation = useMutation({
-    mutationFn: async ({
+    mutationFn: ({
       collaboratorUserId,
       newPermission,
     }: {
       collaboratorUserId: string;
       newPermission: PermissionLevelEnum;
-    }) => {
-      const response = await fetch(
-        `/api/lists/${listId}/collaborators/${collaboratorUserId}`,
-        {
-          method: "PUT",
-          headers: { "Content-Type": "application/json" },
-          body: JSON.stringify({ permissionLevel: newPermission }),
-        },
-      );
-      const data = await response.json();
-      if (!response.ok)
-        throw new Error(data.error || "Failed to update permission");
-      return { collaboratorUserId, newPermission, message: data.message };
-    },
+    }) =>
+      api(listsApi.updateListCollaborator, {
+        params: { id: listId, userId: collaboratorUserId },
+        body: { permissionLevel: newPermission },
+      }),
     onSuccess: ({ message }) => {
       setSuccess(message);
       queryClient.invalidateQueries({
@@ -180,9 +140,7 @@ export default function CollaborationModal({
       });
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to update permission",
-      );
+      setError(errorMessage(err, "Failed to update permission"));
     },
   });
 
@@ -276,8 +234,8 @@ export default function CollaborationModal({
                 />
                 <Button
                   onClick={addCollaborator}
-                  disabled={addingCollaborator || !newUsername.trim()}
-                  loading={addingCollaborator}
+                  disabled={addCollaboratorMutation.isPending || !newUsername.trim()}
+                  loading={addCollaboratorMutation.isPending}
                 >
                   <UserPlus className="w-4 h-4 mr-2" />
                   Add
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/lists src/components/lists src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lists src/app/api/lists src/components/lists/CollaborationModal.tsx
git commit -m "refactor: move list collaborators onto typed contracts"
```

---

### Task 4: API docs and final checks

**Files:**
- Modify: `docs/api/openapi.yaml`

**Interfaces:**
- Consumes: everything above. Produces nothing later tasks use.

- [ ] **Step 1: Update the API docs**

This adds UUID formats, and documents the `contentType` parameter that `/api/content/{tmdbId}/lists` already required. Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index d543e4c..b5fde44 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -1459,6 +1459,7 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
     get:
       tags: [Lists]
       summary: Get list details
@@ -1586,6 +1587,7 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
       - in: query
         name: watchStatus
         required: false
@@ -1705,11 +1707,13 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
       - in: path
         name: itemId
         required: true
         schema:
           type: string
+          format: uuid
     delete:
       tags: [Lists]
       summary: Remove item from list
@@ -1753,6 +1757,7 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
     get:
       tags: [Lists]
       summary: List collaborators (owner only)
@@ -1865,11 +1870,13 @@ paths:
         required: true
         schema:
           type: string
+          format: uuid
       - in: path
         name: userId
         required: true
         schema:
           type: string
+          format: uuid
     put:
       tags: [Lists]
       summary: Update collaborator permissions (owner only)
@@ -1974,6 +1981,14 @@ paths:
         required: true
         schema:
           type: integer
+          minimum: 1
+      - in: query
+        name: contentType
+        required: true
+        description: A TMDB id is only unique within a content type.
+        schema:
+          type: string
+          enum: [movie, tv]
     get:
       tags: [Lists]
       summary: Get lists containing a specific TMDB content id
```

- [ ] **Step 2: Confirm no path-splitting remains in these routes**

Run: `grep -rnE 'split\("/"\)|as (Create|Update)[A-Za-z]*Input' src/app/api/lists "src/app/api/content"`
Expected: no output.

- [ ] **Step 3: Run every CI gate**

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,569 passing tests. `pnpm typecheck` runs last so it checks Next's freshly generated route types. Report any failure with its output.

- [ ] **Step 4: Check the bundle**

Run this in a POSIX shell, using `bash -c` if your shell is fish:

```bash
find .next/static/chunks -name '*.js' | xargs -I{} sh -c 'gzip -c "{}" | wc -c' | awk '{s+=$1} END {print "gz:", s, "delta:", s-507379}'
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: delta about 2,600 and well under 10,000; `0` chunks containing Zod.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: document list ID formats and the required content type"
```
