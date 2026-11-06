// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const exportUserData = vi.fn();
const getStreamingPreferences = vi.fn();
const updateStreamingPreferences = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/profile/streaming/service", () => ({
  getStreamingPreferences: (...args: unknown[]) =>
    getStreamingPreferences(...args),
  updateStreamingPreferences: (...args: unknown[]) =>
    updateStreamingPreferences(...args),
}));

vi.mock("@/lib/profile/data/service", () => ({
  exportUserData: (...args: unknown[]) => exportUserData(...args),
}));

const streaming = await import("./route");
const exporter = await import("../export/route");

const headers = { cookie: "session=valid" };
const URL_BASE = "http://localhost/api/profile/streaming";
const post = (body: unknown) =>
  streaming.POST(
    new NextRequest(URL_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );

describe("GET /api/profile/streaming", () => {
  it("returns the preferences", async () => {
    getStreamingPreferences.mockResolvedValue({ country: "AU", providers: [] });
    const response = await streaming.GET(new NextRequest(URL_BASE, { headers }));
    await expect(response.json()).resolves.toEqual({
      country: "AU",
      providers: [],
    });
  });

  it("maps dbError to a 500 with its message", async () => {
    getStreamingPreferences.mockResolvedValue("dbError");
    const response = await streaming.GET(new NextRequest(URL_BASE, { headers }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Fetch streaming preferences failed",
      code: "dbError",
    });
  });
});

describe("POST /api/profile/streaming", () => {
  const provider = { providerId: 8, providerName: "Netflix", logoPath: null };

  it("falls back to the country when no region is given", async () => {
    updateStreamingPreferences.mockResolvedValue({ country: "au", providers: [] });
    const response = await post({ country: "au", providers: [provider] });
    expect(response.status).toBe(200);
    expect(updateStreamingPreferences).toHaveBeenCalledWith("user-1", {
      country: "au",
      region: "au",
      providers: [provider],
    });
  });

  it("accepts a country on its own", async () => {
    updateStreamingPreferences.mockResolvedValue({ country: "US", providers: [] });
    const response = await post({ country: "US" });
    expect(response.status).toBe(200);
  });

  it.each([
    [{ country: "USA" }, "Invalid country code format. Expected 2-letter code."],
    [{ providers: [provider] }, "Region is required and must be a 2-letter code."],
    [
      { country: "AU", region: "Oceania", providers: [provider] },
      "Region is required and must be a 2-letter code.",
    ],
    [{ country: "AU", providers: [{ providerId: "8" }] }, "Invalid input: expected number, received string"],
  ])("rejects %j", async (body, error) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(updateStreamingPreferences).not.toHaveBeenCalled();
  });

  it.each([
    ["invalidRegion", 400],
    ["dbError", 500],
  ])("maps the service's %s to %i", async (code, status) => {
    updateStreamingPreferences.mockResolvedValue(code);
    const response = await post({ country: "AU" });
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("GET /api/profile/export", () => {
  it("passes the format to the service", async () => {
    exportUserData.mockResolvedValue({ data: "{}", filename: "f", mimetype: "m" });
    const response = await exporter.GET(
      new NextRequest("http://localhost/api/profile/export?format=csv", {
        headers,
      }),
    );
    expect(response.status).toBe(200);
    expect(exportUserData).toHaveBeenCalledWith("user-1", "csv");
  });

  it("requires a valid format", async () => {
    const response = await exporter.GET(
      new NextRequest("http://localhost/api/profile/export?format=xml", {
        headers,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Format parameter is required and must be 'csv' or 'json'",
    );
  });
});
