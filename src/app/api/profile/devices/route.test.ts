// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { routeContext } from "@/test/route-context";

const cancelClaim = vi.fn();
const deletePasskey = vi.fn();
const initiateClaim = vi.fn();
const listDevices = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/profile/devices/service", () => ({
  cancelClaim: (...args: unknown[]) => cancelClaim(...args),
  deletePasskey: (...args: unknown[]) => deletePasskey(...args),
  initiateClaim: (...args: unknown[]) => initiateClaim(...args),
  listDevices: (...args: unknown[]) => listDevices(...args),
}));

const devices = await import("./route");
const device = await import("./[id]/route");
const claim = await import("./claims/[id]/route");

const ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const BASE = "http://localhost/api/profile/devices";
const headers = { cookie: "session=valid" };

const del = (
  route: typeof device | typeof claim,
  path: string,
  id: string = ID,
) =>
  route.DELETE(
    new NextRequest(`${BASE}${path}/${id}`, { method: "DELETE", headers }),
    routeContext({ id }),
  );

describe("/api/profile/devices", () => {
  it("wraps the device list", async () => {
    listDevices.mockResolvedValue([{ id: ID }]);
    const response = await devices.GET(new NextRequest(BASE, { headers }));
    await expect(response.json()).resolves.toEqual({ devices: [{ id: ID }] });
  });

  it("returns a new claim as initiated by the user", async () => {
    initiateClaim.mockResolvedValue({ claimId: ID });
    const response = await devices.POST(
      new NextRequest(BASE, { method: "POST", headers }),
    );
    expect(response.status).toBe(200);
    expect(initiateClaim).toHaveBeenCalledWith("user-1", "user");
  });

  it.each([
    ["rateLimit", 429, "Rate limit exceeded. Try later."],
    ["maxDevices", 400, "Maximum devices reached"],
  ])("maps a claim's %s to %i", async (code, status, error) => {
    initiateClaim.mockResolvedValue(code);
    const response = await devices.POST(
      new NextRequest(BASE, { method: "POST", headers }),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });
});

describe("DELETE /api/profile/devices/[id]", () => {
  it("returns success as an object", async () => {
    deletePasskey.mockResolvedValue("success");
    const response = await del(device, "");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deletePasskey).toHaveBeenCalledWith("user-1", ID);
  });

  it.each([
    ["minimum", 400, "At least one passkey is required"],
    ["notFound", 404, "Passkey not found"],
  ])("maps %s to %i", async (code, status, error) => {
    deletePasskey.mockResolvedValue(code);
    const response = await del(device, "");
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });

  it("rejects a malformed id", async () => {
    const response = await del(device, "", "nope");
    expect(response.status).toBe(400);
    expect(deletePasskey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/profile/devices/claims/[id]", () => {
  it("returns success as an object", async () => {
    cancelClaim.mockResolvedValue("success");
    const response = await del(claim, "/claims");
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(cancelClaim).toHaveBeenCalledWith("user-1", ID);
  });

  it("maps notFound to a 404", async () => {
    cancelClaim.mockResolvedValue("notFound");
    const response = await del(claim, "/claims");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Claim not found");
  });
});
