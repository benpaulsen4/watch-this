import { beforeEach, describe, expect, it, vi } from "vitest";

import { users, userStreamingProviders } from "@/lib/db/schema";

let userCountry: string | null = null;
let savedProviders: any[] = [];
let insertedProviders: any[] = [];
let throwDb = false;
// DATA-07(a): when true the provider insert throws, standing in for a failure
// part-way through the delete-then-insert sequence.
let throwOnProviderInsert = false;
let transactionCalls = 0;

vi.mock("@/lib/db", () => {
  const executor: any = {
    select: (_sel?: any) => {
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
    delete: (_table: any) => {
      const chain: any = {
        where() {
          savedProviders = [];
          return {} as any;
        },
      };
      return chain;
    },
    insert: (table: any) => {
      const chain: any = {
        values(vals: any) {
          if (table === userStreamingProviders) {
            if (throwOnProviderInsert) {
              throw new Error("insert failed");
            }
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
  };

  // Models real transaction semantics: state written inside the callback is
  // rolled back to the pre-transaction snapshot if the callback throws.
  executor.transaction = async (fn: (tx: any) => Promise<unknown>) => {
    transactionCalls++;
    const snapshot = {
      country: userCountry,
      providers: savedProviders.slice(),
    };
    try {
      return await fn(executor);
    } catch (error) {
      userCountry = snapshot.country;
      savedProviders = snapshot.providers;
      throw error;
    }
  };

  return { db: executor };
});

describe("streaming service", () => {
  beforeEach(() => {
    userCountry = "US";
    savedProviders = [
      { providerId: 1, providerName: "P1", logoPath: null, region: "US" },
    ];
    insertedProviders = [];
    throwDb = false;
    throwOnProviderInsert = false;
    transactionCalls = 0;
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

  // DATA-07(a): the delete-then-insert is one unit of work. Before the fix a
  // failing insert left the delete committed, wiping the user's saved
  // preferences with nothing written back and no way to recover them.
  it("does not wipe saved providers when the re-insert fails (DATA-07a)", async () => {
    const svc = await import("./service");
    throwOnProviderInsert = true;

    const res = await svc.updateStreamingPreferences("u1", {
      country: "US",
      region: "US",
      providers: [{ providerId: 9, providerName: "P9", logoPath: null }],
    });

    expect(res).toBe("dbError");
    // The pre-existing provider survives: the delete was rolled back with the
    // failed insert rather than left committed on its own.
    expect(savedProviders).toEqual([
      { providerId: 1, providerName: "P1", logoPath: null, region: "US" },
    ]);
  });

  it("runs the provider rewrite inside a transaction", async () => {
    const svc = await import("./service");
    await svc.updateStreamingPreferences("u1", {
      country: "CA",
      region: "CA",
      providers: [{ providerId: 2, providerName: "P2", logoPath: null }],
    });
    expect(transactionCalls).toBe(1);
  });
});
