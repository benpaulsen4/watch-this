// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createOrUpdateContentStatus = vi.fn();
const deleteContentStatus = vi.fn();
const getContentStatus = vi.fn();
const updateContentStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/content-status/service", () => ({
  createOrUpdateContentStatus: (...args: unknown[]) =>
    createOrUpdateContentStatus(...args),
  deleteContentStatus: (...args: unknown[]) => deleteContentStatus(...args),
  getContentStatus: (...args: unknown[]) => getContentStatus(...args),
  updateContentStatus: (...args: unknown[]) => updateContentStatus(...args),
}));

const { DELETE, GET, POST, PUT } = await import("./route");

const URL_BASE = "http://localhost/api/status/content";
const headers = { cookie: "session=valid" };

function send(method: "POST" | "PUT", body: string) {
  const handler = method === "POST" ? POST : PUT;
  return handler(new NextRequest(URL_BASE, { method, headers, body }));
}

describe("GET and DELETE /api/status/content", () => {
  it("passes the parsed query to the service", async () => {
    getContentStatus.mockResolvedValue({ status: null });
    const response = await GET(
      new NextRequest(`${URL_BASE}?tmdbId=550&contentType=movie`, { headers }),
    );
    expect(response.status).toBe(200);
    expect(getContentStatus).toHaveBeenCalledWith("user-1", 550, "movie");
  });

  it.each([
    ["contentType=movie", "tmdbId must be a positive integer"],
    ["tmdbId=550abc&contentType=movie", "tmdbId must be a positive integer"],
    ["tmdbId=550", "Invalid content type. Must be 'movie' or 'tv'"],
    ["tmdbId=550&contentType=book", "Invalid content type. Must be 'movie' or 'tv'"],
  ])("rejects %s", async (search, error) => {
    const response = await GET(
      new NextRequest(`${URL_BASE}?${search}`, { headers }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(getContentStatus).not.toHaveBeenCalled();
  });

  it("maps a missing status on delete to a 404", async () => {
    deleteContentStatus.mockResolvedValue("notFound");
    const response = await DELETE(
      new NextRequest(`${URL_BASE}?tmdbId=550&contentType=tv`, {
        method: "DELETE",
        headers,
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Content status not found",
      code: "notFound",
    });
    expect(deleteContentStatus).toHaveBeenCalledWith("user-1", 550, "tv");
  });
});

describe("POST /api/status/content", () => {
  it("creates and returns 201", async () => {
    createOrUpdateContentStatus.mockResolvedValue({ status: { id: "s1" } });
    const response = await send(
      "POST",
      '{"tmdbId":550,"contentType":"movie","status":"completed"}',
    );
    expect(response.status).toBe(201);
    expect(createOrUpdateContentStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 550,
      contentType: "movie",
      status: "completed",
    });
  });

  it.each([
    [
      '{"tmdbId":550,"contentType":"movie","status":"watching"}',
      "Invalid movie status. Must be 'planning' or 'completed'",
    ],
    [
      '{"tmdbId":550,"contentType":"tv","status":"binged"}',
      "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
    ],
    [
      '{"tmdbId":"550","contentType":"tv","status":"watching"}',
      "tmdbId must be a positive integer",
    ],
    [
      '{"tmdbId":550,"contentType":"book","status":"watching"}',
      "Invalid content type. Must be 'movie' or 'tv'",
    ],
  ])("rejects %s", async (body, error) => {
    const response = await send("POST", body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(createOrUpdateContentStatus).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    createOrUpdateContentStatus.mockResolvedValue("notFound");
    const response = await send(
      "POST",
      '{"tmdbId":550,"contentType":"tv","status":"watching"}',
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Content not found");
  });
});

describe("PUT /api/status/content", () => {
  it("allows the status to be omitted", async () => {
    updateContentStatus.mockResolvedValue({ status: { id: "s1" } });
    const response = await send("PUT", '{"tmdbId":550,"contentType":"tv"}');
    expect(response.status).toBe(200);
    expect(updateContentStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 550,
      contentType: "tv",
    });
  });

  it("still checks a movie status when one is given", async () => {
    const response = await send(
      "PUT",
      '{"tmdbId":550,"contentType":"movie","status":"paused"}',
    );
    expect(response.status).toBe(400);
    expect(updateContentStatus).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    updateContentStatus.mockResolvedValue("notFound");
    const response = await send("PUT", '{"tmdbId":550,"contentType":"tv"}');
    expect(response.status).toBe(404);
  });
});
