// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createSchedule = vi.fn();
const deleteSchedules = vi.fn();
const listSchedules = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

vi.mock("@/lib/schedules/service", () => ({
  createSchedule: (...args: unknown[]) => createSchedule(...args),
  deleteSchedules: (...args: unknown[]) => deleteSchedules(...args),
  listSchedules: (...args: unknown[]) => listSchedules(...args),
}));

const { DELETE, GET, POST } = await import("./route");

const URL_BASE = "http://localhost/api/schedules";
const headers = { cookie: "session=valid" };

function post(body: string) {
  return POST(new NextRequest(URL_BASE, { method: "POST", headers, body }));
}

describe("GET /api/schedules", () => {
  it("passes parsed filters to the service", async () => {
    listSchedules.mockResolvedValue({ schedules: {}, totalShows: 0 });
    const response = await GET(
      new NextRequest(`${URL_BASE}?tmdbId=12&dayOfWeek=3`, { headers }),
    );
    expect(response.status).toBe(200);
    expect(listSchedules).toHaveBeenCalledWith("user-1", 12, 3);
  });

  it("treats empty filters as absent", async () => {
    listSchedules.mockResolvedValue({ schedules: {}, totalShows: 0 });
    await GET(new NextRequest(`${URL_BASE}?tmdbId=&dayOfWeek=`, { headers }));
    expect(listSchedules).toHaveBeenCalledWith("user-1", undefined, undefined);
  });

  it.each(["tmdbId=12abc", "tmdbId=0", "dayOfWeek=7", "dayOfWeek=2.5"])(
    "rejects %s",
    async (search) => {
      const response = await GET(
        new NextRequest(`${URL_BASE}?${search}`, { headers }),
      );
      expect(response.status).toBe(400);
      expect(listSchedules).not.toHaveBeenCalled();
    },
  );

  it("returns 401 without a session", async () => {
    const response = await GET(new NextRequest(URL_BASE));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/schedules", () => {
  it("creates a schedule and returns 201", async () => {
    const item = { id: "s1", tmdbId: 1, createdAt: "t", title: "T" };
    createSchedule.mockResolvedValue(item);
    const response = await post('{"tmdbId":1,"dayOfWeek":2}');
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(item);
    expect(createSchedule).toHaveBeenCalledWith("user-1", {
      tmdbId: 1,
      dayOfWeek: 2,
    });
  });

  it.each([
    ['{"tmdbId":1,"dayOfWeek":2.5}', "fractional day"],
    ['{"tmdbId":1,"dayOfWeek":7}', "day out of range"],
    ['{"tmdbId":1.5,"dayOfWeek":2}', "fractional id"],
    ['{"tmdbId":"1","dayOfWeek":2}', "string id"],
    ['{"dayOfWeek":2}', "missing id"],
    ["{bad", "malformed JSON"],
  ])("rejects %s (%s) with a 400", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation");
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ["notFound", 404],
    ["invalidStatus", 400],
    ["duplicate", 409],
  ])("maps the service's %s to %i", async (code, status) => {
    createSchedule.mockResolvedValue(code);
    const response = await post('{"tmdbId":1,"dayOfWeek":2}');
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("DELETE /api/schedules", () => {
  const del = (search: string) =>
    DELETE(new NextRequest(`${URL_BASE}?${search}`, { method: "DELETE", headers }));

  it("removes schedules", async () => {
    deleteSchedules.mockResolvedValue({ message: "m", deletedSchedules: [] });
    const response = await del("tmdbId=1&dayOfWeek=2");
    expect(response.status).toBe(200);
    expect(deleteSchedules).toHaveBeenCalledWith("user-1", 1, 2);
  });

  it("requires tmdbId", async () => {
    const response = await del("dayOfWeek=2");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "tmdbId must be a positive integer",
    );
  });

  it("returns 404 when nothing was scheduled", async () => {
    deleteSchedules.mockResolvedValue("notFound");
    const response = await del("tmdbId=1");
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("notFound");
  });
});
