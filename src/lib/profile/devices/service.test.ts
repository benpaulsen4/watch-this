import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelClaim,
  countActiveDevices,
  deletePasskey,
  initiateClaim,
  listDevices,
} from "./service";

// Mock DB module with minimal drizzle-like chaining and helpers
vi.mock("@/lib/db", () => {
  const insertCalls: Array<{ table: any; payload: any }> = [];
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
    select() {
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
    update(_table: any) {
      const c = {
        ...chain,
        set() {
          return c;
        },
        where() {
          if (throwOnUpdate) {
            return Promise.reject(new Error("update failed"));
          }
          return Promise.resolve({ ok: true });
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
    __resetInserts() {
      insertCalls.length = 0;
    },
    __setThrowUpdate(v: boolean) {
      throwOnUpdate = v;
    },
  } as any;

  const passkeyCredentials = { __tag: "passkeyCredentials" } as any;
  const passkeyClaims = { __tag: "passkeyClaims" } as any;
  const activityFeed = { __tag: "activityFeed" } as any;

  return { db, passkeyCredentials, passkeyClaims, activityFeed };
});

// Mock claim token generator
vi.mock("@/lib/auth/webauthn", () => ({
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

  it("countActiveDevices returns rows length", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([[{ id: "a" }, { id: "b" }, { id: "c" }]]);
    const count = await countActiveDevices("u-1");
    expect(count).toBe(3);
  });

  it("initiateClaim returns maxDevices when >= 10 active", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([
      [
        { id: "a" },
        { id: "b" },
        { id: "c" },
        { id: "d" },
        { id: "e" },
        { id: "f" },
        { id: "g" },
        { id: "h" },
        { id: "i" },
        { id: "j" },
      ],
    ]);
    const res = await initiateClaim("user-1", "user");
    expect(res).toBe("maxDevices");
  });

  it("initiateClaim enforces rate limit for user initiator", async () => {
    const { db } = await mockedDbModule;
    db.__setMockResults([
      // countActiveDevices: less than 10
      [{ id: "a" }],
      // claims in last hour: 5
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    ]);
    const res = await initiateClaim("user-1", "user");
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
      [{ id: "a" }],
      // claims last hour
      [],
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
    db.__setMockResults([[{ id: "only" }]]); // countActiveDevices -> 1
    const res = await deletePasskey("user-1", "cred-1");
    expect(res).toBe("minimum");
  });

  it("deletePasskey updates credential and inserts activity when allowed", async () => {
    const { db, activityFeed } = await mockedDbModule;
    db.__setMockResults([
      // countActiveDevices
      [{ id: "a" }, { id: "b" }],
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
  });
});
