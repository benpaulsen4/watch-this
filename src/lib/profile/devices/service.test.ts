import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelClaim,
  consumeClaim,
  countActiveDevices,
  deletePasskey,
  initiateClaim,
  listDevices,
} from "./service";

// Mock DB module with minimal drizzle-like chaining and helpers
vi.mock("@/lib/db", () => {
  const insertCalls: Array<{ table: any; payload: any }> = [];
  const updateCalls: Array<{ table: any }> = [];
  const selectProjections: any[] = [];
  const resultsQueue: any[] = [];
  let throwOnUpdate = false;

  function resolveNext() {
    return resultsQueue.length ? resultsQueue.shift() : undefined;
  }

  const chain: any = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return Promise.resolve(resolveNext());
    },
    groupBy() {
      return this;
    },
    limit() {
      return Promise.resolve(resolveNext());
    },
    returning() {
      return Promise.resolve(resolveNext());
    },
    then(onFulfilled: (value: any) => any) {
      return Promise.resolve(resolveNext()).then(onFulfilled);
    },
  };

  const db = {
    select(projection?: any) {
      selectProjections.push(projection);
      return { ...chain };
    },
    insert(table: any) {
      const c = {
        ...chain,
        values(payload: any) {
          insertCalls.push({ table, payload });
          return c;
        },
      };
      return c;
    },
    update(table: any) {
      updateCalls.push({ table });
      const c = {
        ...chain,
        set() {
          return c;
        },
        where() {
          // Returned object is awaitable (for callers that await where())
          // and also supports .returning() (for conditional-consume callers).
          return {
            returning() {
              if (throwOnUpdate) {
                return Promise.reject(new Error("update failed"));
              }
              return Promise.resolve(resolveNext());
            },
            then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
              if (throwOnUpdate) {
                return Promise.reject(new Error("update failed")).then(
                  onFulfilled,
                  onRejected,
                );
              }
              return Promise.resolve({ ok: true }).then(onFulfilled);
            },
          };
        },
      };
      return c;
    },
    __setMockResults(arr: any[]) {
      resultsQueue.length = 0;
      resultsQueue.push(...arr);
    },
    __getInsertCalls() {
      return insertCalls.slice();
    },
    __getUpdateCalls() {
      return updateCalls.slice();
    },
    __getSelectProjections() {
      return selectProjections.slice();
    },
    __resetInserts() {
      insertCalls.length = 0;
      updateCalls.length = 0;
      selectProjections.length = 0;
    },
    __setThrowUpdate(v: boolean) {
      throwOnUpdate = v;
    },
  } as any;

  const passkeyCredentials = { __tag: "passkeyCredentials" } as any;
  const passkeyClaims = { __tag: "passkeyClaims" } as any;
  const activityFeed = { __tag: "activityFeed" } as any;
  const users = {
    __tag: "users",
    // Non-undefined so the real drizzle `sql` template used to bump
    // tokenVersion can interpolate it without throwing.
    tokenVersion: { __tag: "users.tokenVersion" },
  } as any;

  return { db, passkeyCredentials, passkeyClaims, activityFeed, users };
});

// Mock claim token generator
vi.mock("@/lib/auth/webauthn", async (importOriginal) => ({
  // Partial mock rather than a full stub: SUPPLY-02 made getWebAuthnOrigin the
  // single source of truth for the magic-link origin, and stubbing it here
  // would stop this test noticing if the link and the ceremony ever drifted
  // apart again. Only the token minting is faked.
  ...(await importOriginal<typeof import("@/lib/auth/webauthn")>()),
  createClaimToken: vi.fn(
    async (claimId: string, userId: string) => `mocktoken-${claimId}-${userId}`,
  ),
}));

// Access mocked db helpers
const mockedDbModule = vi.importMock("@/lib/db") as unknown as Promise<{
  db: any;
  activityFeed: any;
}>;

describe("devices service", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    const { db } = await mockedDbModule;
    db.__resetInserts();
    db.__setThrowUpdate(false);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("listDevices maps rows to API format", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const later = new Date("2025-01-02T12:34:56Z");
    const { db } = await mockedDbModule;
    db.__setMockResults([
      [
        {
          id: "cred1",
          credentialId: "c-1",
          deviceName: "Pixel 8",
          createdAt: now,
          lastUsed: later,
        },
        {
          id: "cred2",
          credentialId: "c-2",
          deviceName: null,
          createdAt: now,
          lastUsed: null,
        },
      ],
    ]);

    const result = await listDevices("user-1");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "cred1",
      credentialId: "c-1",
      deviceName: "Pixel 8",
      createdAt: now.toISOString(),
      lastUsed: later.toISOString(),
    });
    expect(result[1]).toMatchObject({
      id: "cred2",
      credentialId: "c-2",
      deviceName: null,
      createdAt: now.toISOString(),
      lastUsed: null,
    });
  });

  // DATA-08a: countActiveDevices aggregates in the database. The mock returns a
  // single aggregate row, so code that fell back to `rows.length` would report
  // 1 here instead of 7.
  it("countActiveDevices reads the aggregate value, not the row count (DATA-08a)", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[{ value: 7 }]]);
    const count = await countActiveDevices("u-1");
    expect(count).toBe(7);

    // The query must project an aggregate, never the full credential rows.
    const projections = db.__getSelectProjections();
    expect(projections[0]).toBeDefined();
    expect(Object.keys(projections[0])).toEqual(["value"]);
  });

  it("countActiveDevices returns 0 when the aggregate row is missing", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[]]);
    expect(await countActiveDevices("u-1")).toBe(0);
  });

  it("initiateClaim returns maxDevices when >= 10 active", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[{ value: 10 }]]);
    const res = await initiateClaim("user-1", "user");
    expect(res).toBe("maxDevices");
  });

  it("initiateClaim enforces rate limit for user initiator", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([
      // countActiveDevices: less than 10
      [{ value: 1 }],
      // claims in last hour: 5 (DATA-08a: an aggregate, not 5 materialised rows)
      [{ value: 5 }],
    ]);
    const res = await initiateClaim("user-1", "user");
    expect(res).toBe("rateLimit");
  });

  it("initiateClaim enforces rate limit for admin initiator too (API-07)", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([
      // countActiveDevices: less than 10
      [{ value: 1 }],
      // claims in last hour: 5
      [{ value: 5 }],
    ]);
    const res = await initiateClaim("user-1", "admin");
    expect(res).toBe("rateLimit");
  });

  it("initiateClaim creates claim and returns token, magic link and qr payload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "demo.vercel.app";

    const { db } = await mockedDbModule;
    db.__setMockResults([
      // countActiveDevices
      [{ value: 1 }],
      // claims last hour
      [{ value: 0 }],
      // insert(passkeyClaims).returning()
      [{ id: "claim-123" }],
    ]);

    const res = await initiateClaim("user-1", "user");
    expect(typeof res).toBe("object");
    const info = res as Exclude<typeof res, "maxDevices" | "rateLimit">;
    expect(info.claimId).toBe("claim-123");
    expect(info.token).toBe("mocktoken-claim-123-user-1");
    expect(info.magicLink).toMatch(
      /^https:\/\/demo\.vercel\.app\/auth\/claim\?token=.+/,
    );
    expect(info.qrPayload).toBe(info.magicLink);
    expect(info.claimCode).toHaveLength(12);
    expect(info.expiresAt).toBe(
      new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    );

    const { activityFeed, db: db2 } = await mockedDbModule;
    const inserts = db2.__getInsertCalls();
    const activityInsert = inserts.find((c: any) => c.table === activityFeed);
    expect(activityInsert?.payload).toMatchObject({
      userId: "user-1",
      activityType: "claim_generated",
    });

    vi.useRealTimers();
  });

  it("consumeClaim returns the row when the conditional update matches (AUTH-03)", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[{ id: "claim-1", status: "consumed" }]]);
    const row = await consumeClaim(db, "claim-1");
    expect(row).toMatchObject({ id: "claim-1", status: "consumed" });
  });

  it("consumeClaim returns null when no row matches (already consumed/expired)", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[]]);
    const row = await consumeClaim(db, "claim-1");
    expect(row).toBeNull();
  });

  it("cancelClaim returns success and performs update", async () => {
    const { db } = await mockedDbModule;
    db.__setThrowUpdate(false);
    const res = await cancelClaim("user-1", "claim-1");
    expect(res).toBe("success");
  });

  it("cancelClaim returns notFound on update error", async () => {
    const { db } = await mockedDbModule;
    db.__setThrowUpdate(true);
    const res = await cancelClaim("user-1", "claim-1");
    expect(res).toBe("notFound");
  });

  it("deletePasskey enforces minimum device count", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[{ value: 1 }]]); // countActiveDevices -> 1
    const res = await deletePasskey("user-1", "cred-1");
    expect(res).toBe("minimum");
  });

  it("deletePasskey updates credential and inserts activity when allowed", async () => {
    const { db, activityFeed, users } = (await mockedDbModule) as any;
    db.__setMockResults([
      // countActiveDevices
      [{ value: 2 }],
    ]);

    const result = await deletePasskey("user-1", "cred-9");
    expect(result).toBe("success");

    const inserts = db.__getInsertCalls();
    const act = inserts.find((c: any) => c.table === activityFeed);
    expect(act?.payload).toMatchObject({
      userId: "user-1",
      activityType: "passkey_deleted",
      metadata: { credentialId: "cred-9" },
    });

    // AUTH-02: deleting a passkey bumps the user's token version to revoke
    // all outstanding sessions.
    const updates = db.__getUpdateCalls();
    expect(updates.some((c: any) => c.table === users)).toBe(true);
  });
});
