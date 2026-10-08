// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real cookie/getCurrentUser auth is exercised here (this route does not use
// `withAuth`); `getCurrentUser` is mocked because the real module imports
// `../db/index`, which throws at import time without a `DATABASE_URL` -- see
// global-constraints.md.
const mockUser = {
  id: "user-1",
  username: "benp",
  profilePictureUrl: null,
  timezone: "UTC",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  shareStatsWithCollaborators: true,
};
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

vi.mock("@/lib/db", () => {
  const state: {
    usernameTaken: boolean;
    updatedUser: Record<string, unknown> | null;
  } = {
    usernameTaken: false,
    updatedUser: null,
  };

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(state.usernameTaken ? [{ id: "other" }] : []),
        }),
      }),
    }),
    update: () => ({
      set: (data: unknown) => {
        db.__lastUpdateData = data;
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(state.updatedUser ? [state.updatedUser] : []),
          }),
        };
      },
    }),
    __state: state,
    __lastUpdateData: undefined as unknown,
  };

  return { db };
});

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id", username: "users.username" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
}));

import { db as mockDbImport } from "@/lib/db";

const mockDb = mockDbImport as unknown as {
  __state: {
    usernameTaken: boolean;
    updatedUser: Record<string, unknown> | null;
  };
  __lastUpdateData: unknown;
};

const { GET, PUT } = await import("./route");

function authedGetRequest() {
  return new NextRequest("http://localhost/api/auth/session", {
    headers: { cookie: "session=valid" },
  });
}

function authedPutRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/session", {
    method: "PUT",
    headers: {
      cookie: "session=valid",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function unauthedPutRequest() {
  return new NextRequest("http://localhost/api/auth/session", {
    method: "PUT",
    body: JSON.stringify({}),
  });
}

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a request with no session", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/auth/session"),
    );

    expect(response.status).toBe(401);
  });

  it("includes shareStatsWithCollaborators in the user object", async () => {
    const response = await GET(authedGetRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          shareStatsWithCollaborators: true,
        }),
      }),
    );
  });
});

describe("PUT /api/auth/session", () => {
  beforeEach(() => {
    mockDb.__state.usernameTaken = false;
    mockDb.__state.updatedUser = null;
    mockDb.__lastUpdateData = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a request with no session", async () => {
    const response = await PUT(unauthedPutRequest());

    expect(response.status).toBe(401);
  });

  it("rejects a non-boolean shareStatsWithCollaborators", async () => {
    const response = await PUT(
      authedPutRequest({ shareStatsWithCollaborators: "yes" }),
    );

    expect(response.status).toBe(400);
  });

  it("accepts false and writes it to the update data", async () => {
    mockDb.__state.updatedUser = {
      ...mockUser,
      shareStatsWithCollaborators: false,
    };

    const response = await PUT(
      authedPutRequest({ shareStatsWithCollaborators: false }),
    );

    expect(response.status).toBe(200);
    expect(mockDb.__lastUpdateData).toEqual(
      expect.objectContaining({ shareStatsWithCollaborators: false }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          shareStatsWithCollaborators: false,
        }),
      }),
    );
  });

  it("leaves shareStatsWithCollaborators out of the update data when omitted", async () => {
    mockDb.__state.updatedUser = { ...mockUser };

    const response = await PUT(authedPutRequest({ timezone: "UTC" }));

    expect(response.status).toBe(200);
    expect(mockDb.__lastUpdateData).toEqual(
      expect.not.objectContaining({
        shareStatsWithCollaborators: expect.anything(),
      }),
    );
  });
});
