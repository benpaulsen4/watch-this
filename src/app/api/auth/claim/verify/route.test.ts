// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Transactional fake modelling passkey_claims + passkey_credentials so we can
// assert real rollback semantics: db.transaction snapshots state, runs the
// callback, and restores the snapshot if the callback throws.
vi.mock("@/lib/db", () => {
  const state: {
    claims: Array<{ id: string; status: string }>;
    credentials: Array<{ id: string }>;
  } = { claims: [], credentials: [] };

  let activityShouldThrow = false;

  const tx = {
    insert() {
      return {
        values() {
          if (activityShouldThrow) {
            return Promise.reject(new Error("activity insert failed"));
          }
          return Promise.resolve();
        },
      };
    },
  };

  const db = {
    async transaction(cb: (tx: unknown) => Promise<unknown>) {
      const snapshot = {
        claims: state.claims.map((c) => ({ ...c })),
        credentials: state.credentials.map((c) => ({ ...c })),
      };
      try {
        return await cb(tx);
      } catch (e) {
        // Roll back to the pre-transaction snapshot.
        state.claims = snapshot.claims;
        state.credentials = snapshot.credentials;
        throw e;
      }
    },
    __tx: tx,
    __state: state,
    __reset() {
      state.claims = [{ id: "claim-1", status: "active" }];
      state.credentials = [];
      activityShouldThrow = false;
    },
    __setActivityThrow(v: boolean) {
      activityShouldThrow = v;
    },
  };

  return { db, activityFeed: { __tag: "activityFeed" } };
});

// consumeClaim models the atomic conditional UPDATE against the fake state.
vi.mock("@/lib/profile/devices/service", () => ({
  consumeClaim: vi.fn(async (_executor: unknown, claimId: string) => {
    const { db } = (await vi.importMock("@/lib/db")) as any;
    const claim = db.__state.claims.find(
      (c: any) => c.id === claimId && c.status === "active",
    );
    if (!claim) return null;
    claim.status = "consumed";
    return { ...claim };
  }),
}));

// Token verification is unrelated to atomicity; stub it. The passkey
// registration pushes a credential into the fake state (via the transaction).
vi.mock("@/lib/auth/webauthn", () => ({
  verifyClaimToken: vi.fn(async () => ({
    claimId: "claim-1",
    userId: "user-1",
  })),
  verifyChallengeToken: vi.fn(async () => ({
    challenge: "chal",
    flow: "claim",
    userId: "user-1",
    claimId: "claim-1",
  })),
  verifyAdditionalPasskeyRegistration: vi.fn(
    async (
      _userId: string,
      _resp: unknown,
      _challenge: string,
      _deviceName: string | undefined,
      _executor: unknown,
    ) => {
      const { db } = (await vi.importMock("@/lib/db")) as any;
      db.__state.credentials.push({ id: "new-cred" });
      return { credential: { id: "new-cred" } };
    },
  ),
}));

import { verifyAdditionalPasskeyRegistration } from "@/lib/auth/webauthn";
import { db as mockDb } from "@/lib/db";

import { POST } from "./route";

const db = mockDb as unknown as {
  __tx: unknown;
  __state: {
    claims: Array<{ id: string; status: string }>;
    credentials: Array<{ id: string }>;
  };
  __reset: () => void;
  __setActivityThrow: (v: boolean) => void;
};

function makeRequest() {
  return {
    json: async () => ({
      token: "t",
      challengeToken: "ct",
      registrationResponse: { id: "r" },
      deviceName: "dev",
    }),
  } as any;
}

describe("claim verify route atomicity (AUTH-03)", () => {
  beforeEach(() => {
    db.__reset();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("registers the passkey on the same transaction executor as the consume", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The register call must receive the transaction handle (5th arg), proving
    // the credential insert participates in the same transaction.
    const call = (verifyAdditionalPasskeyRegistration as any).mock.calls[0];
    expect(call[4]).toBe(db.__tx);

    // Success commits: claim consumed and credential persisted.
    expect(db.__state.claims[0]!.status).toBe("consumed");
    expect(db.__state.credentials).toHaveLength(1);
  });

  it("rolls back the consume AND the credential when a later step throws", async () => {
    // Force the activity insert (after the credential insert) to fail.
    db.__setActivityThrow(true);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    // Whole unit rolled back: claim is active again (retryable) and no orphan
    // credential was persisted.
    expect(db.__state.claims[0]!.status).toBe("active");
    expect(db.__state.credentials).toHaveLength(0);
  });
});
