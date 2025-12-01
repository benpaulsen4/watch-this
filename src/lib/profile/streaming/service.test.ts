import { describe, it, expect, beforeEach, vi } from "vitest";
import { users, userStreamingProviders } from "@/lib/db/schema";

let userCountry: string | null = null;
let savedProviders: any[] = [];
let insertedProviders: any[] = [];
let throwDb = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: (sel?: any) => {
        if (throwDb) throw new Error("db error");
        const chain: any = {
          _table: undefined as any,
          from(table: any) {
            this._table = table;
            return this;
          },
          where() {
            if (this._table === users) return [{ country: userCountry }];
            if (this._table === userStreamingProviders) return savedProviders;
            return [];
          },
        };
        return chain;
      },
      update: (table: any) => {
        const chain: any = {
          set(vals: any) {
            if (table === users) {
              userCountry = vals.country ?? null;
            }
            return {
              where() {
                return {} as any;
              },
            };
          },
        };
        return chain;
      },
      delete: (table: any) => {
        const chain: any = {
          where() {
            savedProviders = savedProviders.filter(() => false);
            return {} as any;
          },
        };
        return chain;
      },
      insert: (table: any) => {
        const chain: any = {
          values(vals: any) {
            if (table === userStreamingProviders) {
              insertedProviders = Array.isArray(vals) ? vals.slice() : [vals];
              savedProviders = insertedProviders.map((v) => ({
                userId: v.userId,
                providerId: v.providerId,
                providerName: v.providerName,
                logoPath: v.logoPath,
                region: v.region,
              }));
            }
            return {} as any;
          },
        };
        return chain;
      },
    },
  };
});

describe("streaming service", () => {
  beforeEach(() => {
    userCountry = "US";
    savedProviders = [
      { providerId: 1, providerName: "P1", logoPath: null, region: "US" },
    ];
    insertedProviders = [];
    throwDb = false;
  });

  it("gets preferences", async () => {
    const svc = await import("./service");
    const res = await svc.getStreamingPreferences("u1");
    expect(res !== "dbError").toBe(true);
    if (res !== "dbError") {
      expect(res.country).toBe("US");
      expect(res.providers.length).toBe(1);
      expect(res.providers[0].id).toBe(1);
    }
  });

  it("updates preferences", async () => {
    const svc = await import("./service");
    const res = await svc.updateStreamingPreferences("u1", {
      country: "CA",
      region: "CA",
      providers: [
        { providerId: 2, providerName: "P2", logoPath: null },
        { providerId: 3, providerName: "P3", logoPath: null },
      ],
    });
    expect(res !== "dbError").toBe(true);
    if (res !== "dbError" && res !== "invalidRegion") {
      expect(res.country).toBe("CA");
      expect(res.providers.length).toBe(2);
      expect(res.providers[0].id).toBe(2);
    }
  });

  it("requires region when providers present", async () => {
    const svc = await import("./service");
    const res = await svc.updateStreamingPreferences("u1", {
      providers: [{ providerId: 1 }],
    });
    expect(res).toBe("invalidRegion");
  });

  it("handles db error", async () => {
    throwDb = true;
    const svc = await import("./service");
    const res = await svc.getStreamingPreferences("u1");
    expect(res).toBe("dbError");
  });
});
