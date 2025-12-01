import { describe, it, expect, beforeEach, vi } from "vitest";

let devicesRows: any[] = [];
let throwSelect = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: () => {
        if (throwSelect) throw new Error("db error");
        const chain: any = {
          from: () => chain,
          where: () => chain,
          orderBy: () => devicesRows,
        };
        return chain;
      },
    },
  };
});

describe("devices service", () => {
  beforeEach(() => {
    devicesRows = [];
    throwSelect = false;
  });

  it("lists devices", async () => {
    const now = new Date();
    devicesRows = [
      {
        id: "d1",
        credentialId: "c1",
        deviceName: "Phone",
        createdAt: now,
        lastUsed: now,
      },
      {
        id: "d2",
        credentialId: "c2",
        deviceName: null,
        createdAt: now,
        lastUsed: null,
      },
    ];
    const svc = await import("./service");
    const res = await svc.listDevices("u1");
    expect(Array.isArray(res)).toBe(true);
    if (Array.isArray(res)) {
      expect(res.length).toBe(2);
      expect(res[0].id).toBe("d1");
      expect(res[0].credentialId).toBe("c1");
      expect(typeof res[0].createdAt).toBe("string");
      expect(typeof res[0].lastUsed).toBe("string");
      expect(res[1].lastUsed).toBeNull();
    }
  });

  it("handles db error", async () => {
    throwSelect = true;
    const svc = await import("./service");
    const res = await svc.listDevices("u1");
    expect(res).toBe("dbError");
  });
});
