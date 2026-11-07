// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";

const mockUser = { id: "user-1" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const whereSpy = vi.fn();
const setSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({
        ...setSpy(values),
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
    dismissedAt: "seriesFinale.dismissedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ op: "and", parts }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: "sql",
    text: strings.join("?"),
    values,
  }),
}));

const { POST } = await import("./route");

// Next passes the `[period]` segment as route context; tests take it from the
// URL they built.
function send(
  handler: (
    request: NextRequest,
    context: ReturnType<typeof routeContext>,
  ) => Promise<Response>,
  request: NextRequest,
) {
  const period = new URL(request.url).pathname.split("/")[3] ?? "";
  return handler(request, routeContext({ period }));
}

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
    const response = await send(
      POST,
      authedRequest("http://localhost/api/series-finale/abcd/dismiss"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid period",
    });
    expect(whereSpy).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps a signed-out 401 out of shared caches too", async () => {
    const response = await send(
      POST,
      new NextRequest("http://localhost/api/series-finale/2025/dismiss", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("marks the recap dismissed for the current user and period", async () => {
    const response = await send(
      POST,
      authedRequest("http://localhost/api/series-finale/2025/dismiss"),
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

  it("keeps the first dismissal rather than moving it to the latest", async () => {
    // The recap's foot dismisses on every visit that reaches it; a repeat
    // must not rewrite when the banner was first put away.
    await send(POST, authedRequest("http://localhost/api/series-finale/2025/dismiss"));

    expect(setSpy).toHaveBeenCalledWith({
      dismissedAt: {
        op: "sql",
        text: "coalesce(?, now())",
        values: ["seriesFinale.dismissedAt"],
      },
    });
  });
});
