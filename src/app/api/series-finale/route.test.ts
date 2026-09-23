// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real `withAuth` is exercised here (not mocked away) so the 401 path is
// genuine, not asserted against a stub. `getCurrentUser` is mocked because
// the real module imports `../db/index`, which throws at import time without
// a `DATABASE_URL` -- see global-constraints.md.
const mockUser = { id: "user-1" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const listAvailableSnapshots = vi.fn();
vi.mock("@/lib/series-finale/service", () => ({
  listAvailableSnapshots: (...args: unknown[]) =>
    listAvailableSnapshots(...args),
}));

const { GET } = await import("./route");

function authedRequest(url: string) {
  return new NextRequest(url, { headers: { cookie: "session=valid" } });
}

describe("GET /api/series-finale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a request with no session", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/series-finale"),
    );

    expect(response.status).toBe(401);
    expect(listAvailableSnapshots).not.toHaveBeenCalled();
  });

  it("returns the available periods for the current user", async () => {
    const periods = [
      {
        label: "2025",
        generatedAt: new Date("2026-01-02T00:00:00Z"),
        dismissedAt: null,
        headline: { minutes: 100 },
      },
    ];
    listAvailableSnapshots.mockResolvedValue(periods);

    const response = await GET(
      authedRequest("http://localhost/api/series-finale"),
    );

    expect(response.status).toBe(200);
    expect(listAvailableSnapshots).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      periods: JSON.parse(JSON.stringify(periods)),
    });
  });

  it("maps a service failure to a 500", async () => {
    listAvailableSnapshots.mockRejectedValue(new Error("boom"));

    const response = await GET(
      authedRequest("http://localhost/api/series-finale"),
    );

    expect(response.status).toBe(500);
  });
});
