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
const returningSpy = vi.fn();
// One row is "returned" for a matching snapshot, none for a period the user
// has no row for -- the route's 404 signal.
let returningResult: unknown[] = [{ id: "series-finale-1" }];
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: (condition: unknown) => {
          whereSpy(condition);
          return {
            returning: (columns: unknown) => {
              returningSpy(columns);
              return Promise.resolve(returningResult);
            },
          };
        },
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  seriesFinale: {
    id: "seriesFinale.id",
    userId: "seriesFinale.userId",
    periodStart: "seriesFinale.periodStart",
    periodEnd: "seriesFinale.periodEnd",
    storyCompletedAt: "seriesFinale.storyCompletedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ op: "and", parts }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: "sql",
      strings,
      values,
    }),
    { raw: vi.fn() },
  ),
}));

const { POST } = await import("./route");

function authedRequest(url: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: { cookie: "session=valid" },
  });
}

describe("POST /api/series-finale/[period]/story-complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    returningResult = [{ id: "series-finale-1" }];
  });

  it("rejects a request with no session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/series-finale/2025/story-complete", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(whereSpy).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects a label that is not a plausible year", async () => {
    const response = await POST(
      authedRequest(
        "http://localhost/api/series-finale/abcd/story-complete",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid period",
    });
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("marks the story completed for the current user and period", async () => {
    const response = await POST(
      authedRequest(
        "http://localhost/api/series-finale/2025/story-complete",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const condition = whereSpy.mock.calls[0]?.[0] as { parts: unknown[] };
    expect(condition.parts).toContainEqual({
      op: "eq",
      column: "seriesFinale.userId",
      value: "user-1",
    });
  });

  // Idempotent: a snapshot already completed keeps its first timestamp. The
  // route achieves this with COALESCE in the SET clause rather than a
  // read-then-write, so it asserts the SET argument carries a `sql` fragment
  // rather than asserting on a stored value the mock DB doesn't model.
  it("uses coalesce so the first completion timestamp wins", async () => {
    await POST(
      authedRequest(
        "http://localhost/api/series-finale/2025/story-complete",
      ),
    );

    expect(returningSpy).toHaveBeenCalledWith({ id: "seriesFinale.id" });
  });

  it("returns 404 when the user has no snapshot for the period", async () => {
    returningResult = [];

    const response = await POST(
      authedRequest(
        "http://localhost/api/series-finale/2025/story-complete",
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Period not available",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
