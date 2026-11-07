// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const tmdb = {
  getContentWatchProviders: vi.fn(),
  getWatchProviderRegions: vi.fn(),
  getWatchProviders: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  tmdbClient: tmdb,
}));

const content = await import("./route");
const providers = await import("../providers/route");
const regions = await import("../regions/route");

const headers = { cookie: "session=valid" };
const get = (path: string) =>
  new NextRequest(`http://localhost/api/watch/${path}`, { headers });

const provider = (id: number, name: string) => ({
  provider_id: id,
  provider_name: name,
  logo_path: null,
  display_priority: id,
});

describe("GET /api/watch/content", () => {
  it("upper-cases the region and returns that region's providers", async () => {
    tmdb.getContentWatchProviders.mockResolvedValue({
      results: { AU: { flatrate: [provider(8, "Netflix")] } },
    });
    const response = await content.GET(get("content?type=tv&id=1399&region=au"));
    expect(tmdb.getContentWatchProviders).toHaveBeenCalledWith("tv", 1399);
    await expect(response.json()).resolves.toEqual({
      region: "AU",
      providers: { flatrate: [provider(8, "Netflix")] },
    });
  });

  it("returns null providers for a region with none", async () => {
    tmdb.getContentWatchProviders.mockResolvedValue({ results: {} });
    const response = await content.GET(get("content?type=movie&id=1&region=US"));
    await expect(response.json()).resolves.toEqual({
      region: "US",
      providers: null,
    });
  });

  it.each([
    ["content?type=book&id=1&region=US", "type must be 'movie' or 'tv'"],
    ["content?type=tv&id=-1&region=US", "id must be a valid number"],
    ["content?type=tv&id=1", "region is required"],
    ["content?type=tv&id=1&region=%20", "region is required"],
  ])("rejects %s", async (path, error) => {
    const response = await content.GET(get(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });
});

describe("GET /api/watch/providers", () => {
  it("merges movie and TV providers without duplicates", async () => {
    tmdb.getWatchProviders.mockImplementation(async (type: string) => ({
      results:
        type === "movie"
          ? [provider(8, "Netflix"), provider(9, "Prime")]
          : [provider(8, "Netflix"), provider(10, "Stan")],
    }));
    const response = await providers.GET(get("providers?region=AU"));
    const body = await response.json();
    expect(body.results.map((p: { provider_id: number }) => p.provider_id)).toEqual(
      [8, 9, 10],
    );
    expect(tmdb.getWatchProviders).toHaveBeenCalledWith("movie", "AU");
  });

  it("requires a region", async () => {
    const response = await providers.GET(get("providers"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "region query parameter is required",
    );
  });
});

describe("GET /api/watch/regions", () => {
  it("returns TMDB's regions", async () => {
    tmdb.getWatchProviderRegions.mockResolvedValue({ results: [] });
    const response = await regions.GET(get("regions"));
    await expect(response.json()).resolves.toEqual({ results: [] });
  });

  it("requires a session", async () => {
    const response = await regions.GET(
      new NextRequest("http://localhost/api/watch/regions"),
    );
    expect(response.status).toBe(401);
  });
});
