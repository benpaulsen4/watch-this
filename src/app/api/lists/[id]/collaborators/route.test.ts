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
