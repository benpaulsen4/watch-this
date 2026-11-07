// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const batchUpdateEpisodeStatuses = vi.fn();
const deleteEpisodeStatuses = vi.fn();
const listEpisodeStatuses = vi.fn();
const markNextEpisodeWatched = vi.fn();
const updateEpisodeStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/episodes/service", () => ({
  batchUpdateEpisodeStatuses: (...args: unknown[]) =>
    batchUpdateEpisodeStatuses(...args),
  deleteEpisodeStatuses: (...args: unknown[]) => deleteEpisodeStatuses(...args),
  listEpisodeStatuses: (...args: unknown[]) => listEpisodeStatuses(...args),
  markNextEpisodeWatched: (...args: unknown[]) =>
    markNextEpisodeWatched(...args),
  updateEpisodeStatus: (...args: unknown[]) => updateEpisodeStatus(...args),
}));

const episodes = await import("./route");
const next = await import("./next/route");

const URL_BASE = "http://localhost/api/status/episodes";
const headers = { cookie: "session=valid" };

function get(search: string) {
  return episodes.GET(new NextRequest(`${URL_BASE}?${search}`, { headers }));
}

function send(method: "POST" | "PUT", body: string) {
  const handler = method === "POST" ? episodes.POST : episodes.PUT;
  return handler(new NextRequest(URL_BASE, { method, headers, body }));
}

const episode = (overrides: Record<string, unknown> = {}) => ({
  seasonNumber: 1,
  episodeNumber: 1,
  watched: true,
  ...overrides,
});

describe("GET and DELETE /api/status/episodes", () => {
  it("passes the filters to the service", async () => {
    listEpisodeStatuses.mockResolvedValue({ episodes: [] });
    const response = await get("tmdbId=1399&seasonNumber=0&episodeNumber=0");
    expect(response.status).toBe(200);
    expect(listEpisodeStatuses).toHaveBeenCalledWith("user-1", 1399, 0, 0);
  });

  it("leaves absent filters undefined", async () => {
    listEpisodeStatuses.mockResolvedValue({ episodes: [] });
    await get("tmdbId=1399");
    expect(listEpisodeStatuses).toHaveBeenCalledWith(
      "user-1",
      1399,
      undefined,
      undefined,
    );
  });

  it.each(["seasonNumber=1", "tmdbId=0", "tmdbId=1399&seasonNumber=-1"])(
    "rejects %s",
    async (search) => {
      const response = await get(search);
      expect(response.status).toBe(400);
      expect(listEpisodeStatuses).not.toHaveBeenCalled();
    },
  );

  it("reports how many statuses were removed", async () => {
    deleteEpisodeStatuses.mockResolvedValue({ deletedCount: 3 });
    const response = await episodes.DELETE(
      new NextRequest(`${URL_BASE}?tmdbId=1399&seasonNumber=2`, {
        method: "DELETE",
        headers,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      message: "Removed 3 episode status(es) successfully",
      deletedCount: 3,
    });
    expect(deleteEpisodeStatuses).toHaveBeenCalledWith(
      "user-1",
      1399,
      2,
      undefined,
    );
  });
});

describe("POST /api/status/episodes", () => {
  it("defaults watched to true and returns 201", async () => {
    updateEpisodeStatus.mockResolvedValue({ episode: {}, newStatus: null });
    const response = await send(
      "POST",
      '{"tmdbId":1399,"seasonNumber":1,"episodeNumber":2}',
    );
    expect(response.status).toBe(201);
    expect(updateEpisodeStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 1399,
      seasonNumber: 1,
      episodeNumber: 2,
      watched: true,
    });
  });

  it("accepts an episode numbered 0", async () => {
    updateEpisodeStatus.mockResolvedValue({ episode: {}, newStatus: null });
    const response = await send(
      "POST",
      '{"tmdbId":1399,"seasonNumber":1,"episodeNumber":0}',
    );
    expect(response.status).toBe(201);
    expect(updateEpisodeStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 1399,
      seasonNumber: 1,
      episodeNumber: 0,
      watched: true,
    });
  });

  it.each([
    ['{"tmdbId":1399,"seasonNumber":1,"episodeNumber":-1}'],
    ['{"tmdbId":1399,"seasonNumber":-1,"episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":1.5,"episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":"1","episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":1,"episodeNumber":1,"watched":"no"}'],
    ['{"tmdbId":"1399","seasonNumber":1,"episodeNumber":1}'],
  ])("rejects %s", async (body) => {
    const response = await send("POST", body);
    expect(response.status).toBe(400);
    expect(updateEpisodeStatus).not.toHaveBeenCalled();
  });
});

describe("PUT /api/status/episodes", () => {
  it("accepts an episode numbered 0", async () => {
    batchUpdateEpisodeStatuses.mockResolvedValue({ episodes: [] });
    const response = await send(
      "PUT",
      JSON.stringify({ tmdbId: 1399, episodes: [episode({ episodeNumber: 0 })] }),
    );
    expect(response.status).toBe(200);
    expect(batchUpdateEpisodeStatuses).toHaveBeenCalledWith("user-1", 1399, [
      episode({ episodeNumber: 0 }),
    ]);
  });

  it.each([
    [{ tmdbId: 1399 }, "tmdbId and episodes array are required"],
    [{ tmdbId: 1399, episodes: [] }, "Episodes array cannot be empty"],
    [
      { tmdbId: 1399, episodes: Array.from({ length: 101 }, () => episode()) },
      "Cannot update more than 100 episodes at once",
    ],
    [
      { tmdbId: 1399, episodes: [episode({ watched: "yes" })] },
      "Each episode must have seasonNumber, episodeNumber, and watched properties",
    ],
  ])("rejects %j", async (body, error) => {
    const response = await send("PUT", JSON.stringify(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(batchUpdateEpisodeStatuses).not.toHaveBeenCalled();
  });
});

describe("POST /api/status/episodes/next", () => {
  const post = (body: string) =>
    next.POST(
      new NextRequest(`${URL_BASE}/next`, { method: "POST", headers, body }),
    );

  it("marks the next episode and returns 201", async () => {
    markNextEpisodeWatched.mockResolvedValue({ episode: {}, newStatus: null });
    const response = await post('{"tmdbId":1399}');
    expect(response.status).toBe(201);
    expect(markNextEpisodeWatched).toHaveBeenCalledWith("user-1", 1399);
  });

  it("rejects a non-numeric id", async () => {
    const response = await post('{"tmdbId":"1399"}');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "tmdbId is required and must be a number",
    );
  });

  it.each([
    ["notFound", 404, "TV show not found"],
    ["noNextEpisode", 400, "No next episode available. You're all caught up!"],
    ["notAired", 400, "Next episode hasn't aired yet."],
  ])("maps %s to %i", async (code, status, error) => {
    markNextEpisodeWatched.mockResolvedValue(code);
    const response = await post('{"tmdbId":1399}');
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });
});
