// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userRows: { current: unknown[] } = { current: [] };
const initiateClaim = vi.fn();

vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => userRows.current,
  };
  return { db: { select: () => chain }, users: { username: "users.username" } };
});

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

vi.mock("@/lib/profile/devices/service", () => ({
  initiateClaim: (...args: unknown[]) => initiateClaim(...args),
}));

const { POST } = await import("./route");

const USER_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const send = (body: string | undefined, secret: string | null = "s3cret") =>
  POST(
    new NextRequest("http://localhost/api/admin/device-claim", {
      method: "POST",
      headers: secret ? { "x-admin-secret": secret } : {},
      body,
    }),
  );

beforeEach(() => {
  vi.stubEnv("ADMIN_API_SECRET", "s3cret");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/device-claim", () => {
  it("issues a claim for a user id", async () => {
    initiateClaim.mockResolvedValue({ claimId: "c1" });
    const response = await send(JSON.stringify({ userId: USER_ID }));
    expect(response.status).toBe(200);
    expect(initiateClaim).toHaveBeenCalledWith(USER_ID, "admin");
  });

  it("looks a username up first", async () => {
    userRows.current = [{ id: USER_ID }];
    initiateClaim.mockResolvedValue({ claimId: "c1" });
    await send(JSON.stringify({ username: "sam" }));
    expect(initiateClaim).toHaveBeenCalledWith(USER_ID, "admin");
  });

  // The secret is checked before the body, so an unauthorized caller learns
  // nothing about the expected input.
  it.each([
    [null, "{bad"],
    ["wrong", JSON.stringify({ userId: USER_ID })],
  ])("rejects secret %s with 401 before reading the body", async (secret, body) => {
    const response = await send(body, secret);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "unauthorized",
    });
    expect(initiateClaim).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("ADMIN_API_SECRET", "");
    const response = await send(JSON.stringify({ userId: USER_ID }), "");
    expect(response.status).toBe(401);
  });

  it.each([
    ["{}"],
    ["{bad"],
    [JSON.stringify({ userId: "not-a-uuid" })],
  ])("rejects body %s with a validation 400", async (body) => {
    const response = await send(body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation");
  });

  it("returns 404 for an unknown username", async () => {
    userRows.current = [];
    const response = await send(JSON.stringify({ username: "ghost" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("notFound");
  });

  it.each([
    ["maxDevices", 400],
    ["rateLimit", 429],
  ])("maps %s to %i", async (code, status) => {
    initiateClaim.mockResolvedValue(code);
    const response = await send(JSON.stringify({ userId: USER_ID }));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});
