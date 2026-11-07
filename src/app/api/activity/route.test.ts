// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const listActivityTimeline = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-1",
    timezone: "Australia/Brisbane",
  })),
}));

vi.mock("@/lib/activity/service", () => ({
  listActivityTimeline: (...args: unknown[]) => listActivityTimeline(...args),
}));

const { GET } = await import("./route");

const get = (search = "") =>
  GET(
    new NextRequest(`http://localhost/api/activity${search}`, {
      headers: { cookie: "session=valid" },
    }),
  );

describe("GET /api/activity", () => {
  it("passes the user's timezone and the parsed query", async () => {
    listActivityTimeline.mockResolvedValue({ activities: [], hasMore: false });
    const response = await get("?limit=20&cursor=abc&type=list_created");
    expect(response.status).toBe(200);
    expect(listActivityTimeline).toHaveBeenCalledWith(
      "user-1",
      "Australia/Brisbane",
      { limit: 20, cursor: "abc", type: "list_created" },
    );
  });

  it.each(["", "?limit=abc", "?limit=-5"])(
    "uses the default limit for %j",
    async (search) => {
      listActivityTimeline.mockResolvedValue({ activities: [], hasMore: false });
      const response = await get(search);
      expect(response.status).toBe(200);
      expect(listActivityTimeline).toHaveBeenCalledWith(
        "user-1",
        "Australia/Brisbane",
        { limit: 10 },
      );
    },
  );

  it("maps an invalid cursor to a 400", async () => {
    listActivityTimeline.mockResolvedValue("invalidCursor");
    const response = await get("?cursor=garbage");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid cursor",
      code: "invalidCursor",
    });
  });
});
