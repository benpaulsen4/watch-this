// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";

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
const context = routeContext({ id: LIST_ID });

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
    ['{"tmdbId":"550","contentType":"movie"}'],
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
      routeContext({ id: LIST_ID, itemId }),
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
