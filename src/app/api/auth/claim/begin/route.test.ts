// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const claimRows: { current: unknown[] } = { current: [] };

vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => claimRows.current,
  };
  return { db: { select: () => chain }, passkeyClaims: { id: "claims.id" } };
});

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

const verifyClaimToken = vi.fn();
vi.mock("@/lib/auth/webauthn", () => ({
  createChallengeToken: vi.fn(async () => "challenge-token"),
  generateAdditionalPasskeyRegistrationOptions: vi.fn(async () => ({
    challenge: "abc",
  })),
  verifyClaimToken: (...args: unknown[]) => verifyClaimToken(...args),
}));

const { GET } = await import("./route");

const get = (search: string) =>
  GET(new NextRequest(`http://localhost/api/auth/claim/begin${search}`));

const activeClaim = {
  status: "active",
  expiresAt: new Date(Date.now() + 60_000),
};

describe("GET /api/auth/claim/begin", () => {
  it("returns options and a challenge token for an active claim", async () => {
    verifyClaimToken.mockResolvedValue({ claimId: "c1", userId: "u1" });
    claimRows.current = [activeClaim];
    const response = await get("?token=t");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "abc" },
      challengeToken: "challenge-token",
    });
  });

  it("requires a token", async () => {
    const response = await get("");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Missing token");
  });

  it.each([
    ["an invalid token", null, [activeClaim], 401, "invalidToken"],
    ["a missing claim", { claimId: "c1", userId: "u1" }, [], 404, "notFound"],
    [
      "a used claim",
      { claimId: "c1", userId: "u1" },
      [{ ...activeClaim, status: "consumed" }],
      400,
      "notActive",
    ],
    [
      "an expired claim",
      { claimId: "c1", userId: "u1" },
      [{ ...activeClaim, expiresAt: new Date(Date.now() - 1) }],
      400,
      "expired",
    ],
  ])("maps %s to %i", async (_name, verified, rows, status, code) => {
    verifyClaimToken.mockResolvedValue(verified);
    claimRows.current = rows;
    const response = await get("?token=t");
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});
