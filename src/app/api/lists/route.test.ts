// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";

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
const context = (id = LIST_ID) => routeContext({ id });

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
