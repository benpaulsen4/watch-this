// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const setSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        setSpy(values);
        return { where: async () => undefined };
      },
    }),
  },
  users: { id: "users.id", tokenVersion: "users.tokenVersion" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  sql: () => ({ op: "sql" }),
}));

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

const { POST } = await import("./route");

const signOut = (search = "", body?: string, session = "valid") =>
  POST(
    new NextRequest(`http://localhost/api/auth/signout${search}`, {
      method: "POST",
      headers: { cookie: `session=${session}` },
      body,
    }),
  );

describe("POST /api/auth/signout", () => {
  it("clears the session and challenge cookies without revoking", async () => {
    const response = await signOut();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Signed out successfully",
    });
    for (const name of [
      "session",
      "registration-challenge",
      "authentication-challenge",
    ]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
    expect(setSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["?all=1", undefined],
    ["", '{"all":true}'],
  ])("revokes every session with %s %s", async (search, body) => {
    await signOut(search, body);
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a malformed body as a single-device sign-out", async () => {
    const response = await signOut("", "{bad");
    expect(response.status).toBe(200);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("signs out without revoking when the session is already invalid", async () => {
    const response = await signOut("?all=1", undefined, "expired");
    expect(response.status).toBe(200);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
