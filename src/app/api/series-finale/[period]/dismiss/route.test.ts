// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const whereSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: (condition: unknown) => {
          whereSpy(condition);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  seriesFinale: {
    userId: "seriesFinale.userId",
    periodStart: "seriesFinale.periodStart",
    periodEnd: "seriesFinale.periodEnd",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ op: "and", parts }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
}));

const { POST } = await import("./route");

function authedRequest(url: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: { cookie: "session=valid" },
  });
}

describe("POST /api/series-finale/[period]/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a label that is not a plausible year", async () => {
    const response = await POST(
      authedRequest("http://localhost/api/series-finale/abcd/dismiss"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid period",
    });
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("marks the recap dismissed for the current user and period", async () => {
    const response = await POST(
      authedRequest("http://localhost/api/series-finale/2025/dismiss"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const condition = whereSpy.mock.calls[0]?.[0] as { parts: unknown[] };
    expect(condition.parts).toContainEqual({
      op: "eq",
      column: "seriesFinale.userId",
      value: "user-1",
    });
  });
});
