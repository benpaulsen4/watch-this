// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const getOrGenerateSnapshot = vi.fn();
const loadStoryCompletedAt = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/series-finale/service", () => ({
  getOrGenerateSnapshot: (...args: unknown[]) =>
    getOrGenerateSnapshot(...args),
  loadStoryCompletedAt: (...args: unknown[]) =>
    loadStoryCompletedAt(...args),
}));

const { GET } = await import("./route");

function authedRequest(url: string) {
  return new NextRequest(url, { headers: { cookie: "session=valid" } });
}

describe("GET /api/series-finale/[period]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a label that is not a plausible year", async () => {
    const response = await GET(
      authedRequest("http://localhost/api/series-finale/abcd"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid period",
    });
    expect(getOrGenerateSnapshot).not.toHaveBeenCalled();
  });

  // R13: the service is the one authority on whether a period is over, judged
  // in the user's own zone -- null means "not available to this user", and
  // the route must not layer a second, UTC-only completeness check on top.
  it("maps a null payload to 404", async () => {
    getOrGenerateSnapshot.mockResolvedValue(null);

    const response = await GET(
      authedRequest("http://localhost/api/series-finale/2025"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Period not available",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the payload the service resolves, with storyCompletedAt null when the story hasn't been finished", async () => {
    const payload = { headline: { minutes: 500 } };
    getOrGenerateSnapshot.mockResolvedValue(payload);
    loadStoryCompletedAt.mockResolvedValue(null);

    const response = await GET(
      authedRequest("http://localhost/api/series-finale/2025"),
    );

    expect(response.status).toBe(200);
    expect(getOrGenerateSnapshot).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ label: "2025" }),
    );
    await expect(response.json()).resolves.toEqual({
      payload,
      storyCompletedAt: null,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("carries storyCompletedAt beside the payload, not folded into it", async () => {
    const payload = { headline: { minutes: 500 } };
    const completedAt = new Date("2026-01-03T00:00:00Z");
    getOrGenerateSnapshot.mockResolvedValue(payload);
    loadStoryCompletedAt.mockResolvedValue(completedAt);

    const response = await GET(
      authedRequest("http://localhost/api/series-finale/2025"),
    );

    expect(loadStoryCompletedAt).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ label: "2025" }),
    );
    await expect(response.json()).resolves.toEqual({
      payload,
      storyCompletedAt: completedAt.toISOString(),
    });
  });

  it("does not look up story completion when the period is unavailable", async () => {
    getOrGenerateSnapshot.mockResolvedValue(null);

    await GET(authedRequest("http://localhost/api/series-finale/2025"));

    expect(loadStoryCompletedAt).not.toHaveBeenCalled();
  });
});
