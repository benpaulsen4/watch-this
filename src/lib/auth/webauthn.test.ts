// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

// The webauthn module imports the db client at module load. We never touch the
// database in these token tests, so stub both specifiers it uses.
vi.mock("../db/index", () => ({ db: {} }));
vi.mock("../db", () => ({ db: {}, users: {}, passkeyCredentials: {} }));

// Stubbed so the device-cap test can exercise the DB-facing half of
// verifyAdditionalPasskeyRegistration without a real authenticator response.
vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: "cred-new",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
      },
    },
  })),
}));

import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import {
  createChallengeToken,
  createClaimToken,
  createSessionToken,
  type DbExecutor,
  verifyAdditionalPasskeyRegistration,
  verifyChallengeToken,
  verifyClaimToken,
  verifySessionToken,
} from "./webauthn";

const fakeUser = {
  id: "user-123",
  username: "alice",
  tokenVersion: 3,
} as Parameters<typeof createSessionToken>[0];

beforeAll(() => {
  process.env.WEBAUTHN_SECRET = "test-secret-value-for-webauthn-unit-tests";
});

describe("webauthn token type binding (AUTH-01)", () => {
  it("accepts a session token in the session verifier", async () => {
    const token = await createSessionToken(fakeUser);
    const session = await verifySessionToken(token);
    expect(session).toMatchObject({ userId: "user-123", username: "alice" });
  });

  it("round-trips the token version in the session token (AUTH-02)", async () => {
    const token = await createSessionToken(fakeUser);
    const session = await verifySessionToken(token);
    expect(session?.tokenVersion).toBe(3);
  });

  it("accepts a claim token in the claim verifier", async () => {
    const token = await createClaimToken("claim-1", "user-123");
    const claim = await verifyClaimToken(token);
    expect(claim).toMatchObject({ claimId: "claim-1", userId: "user-123" });
  });

  it("accepts a challenge token in the challenge verifier", async () => {
    const token = await createChallengeToken("chal-abc", {
      flow: "authenticate",
    });
    const challenge = await verifyChallengeToken(token, {
      flow: "authenticate",
    });
    expect(challenge).toMatchObject({ challenge: "chal-abc", flow: "authenticate" });
  });

  it("rejects a claim token presented as a session token", async () => {
    const claimToken = await createClaimToken("claim-1", "user-123");
    expect(await verifySessionToken(claimToken)).toBeNull();
  });

  it("rejects a challenge token presented as a session token", async () => {
    const challengeToken = await createChallengeToken("chal-abc", {
      flow: "authenticate",
    });
    expect(await verifySessionToken(challengeToken)).toBeNull();
  });

  it("rejects a session token presented as a claim token", async () => {
    const sessionToken = await createSessionToken(fakeUser);
    expect(await verifyClaimToken(sessionToken)).toBeNull();
  });

  it("rejects a session token presented as a challenge token", async () => {
    const sessionToken = await createSessionToken(fakeUser);
    expect(
      await verifyChallengeToken(sessionToken, { flow: "authenticate" }),
    ).toBeNull();
  });

  it("rejects a claim token presented as a challenge token", async () => {
    const claimToken = await createClaimToken("claim-1", "user-123");
    expect(
      await verifyChallengeToken(claimToken, { flow: "claim" }),
    ).toBeNull();
  });
});

describe("verifyAdditionalPasskeyRegistration device cap (DATA-08a)", () => {
  // The executor returns a single aggregate row. Code that counted by selecting
  // every credential row and reading `.length` would see 1 here and let the
  // 11th device through.
  function makeExecutor(countValue: number) {
    const selectProjections: unknown[] = [];
    const inserted: unknown[] = [];
    const executor = {
      select(projection?: unknown) {
        selectProjections.push(projection);
        return {
          from: () => ({
            where: async () => [{ value: countValue }],
          }),
        };
      },
      insert() {
        return {
          values(payload: unknown) {
            inserted.push(payload);
            return { returning: async () => [{ id: "cred-row-1" }] };
          },
        };
      },
    } as unknown as DbExecutor;
    return { executor, selectProjections, inserted };
  }

  const response = {} as RegistrationResponseJSON;

  it("rejects registration once the aggregate count reaches the cap", async () => {
    const { executor } = makeExecutor(10);
    await expect(
      verifyAdditionalPasskeyRegistration(
        "user-1",
        response,
        "chal",
        "iPhone",
        executor,
      ),
    ).rejects.toThrow(/Maximum devices reached/);
  });

  it("aggregates in the database rather than materialising credential rows", async () => {
    const { executor, selectProjections, inserted } = makeExecutor(2);
    const result = await verifyAdditionalPasskeyRegistration(
      "user-1",
      response,
      "chal",
      "iPhone",
      executor,
    );
    expect(result.credential).toMatchObject({ id: "cred-row-1" });
    expect(Object.keys(selectProjections[0] as object)).toEqual(["value"]);
    expect(inserted).toHaveLength(1);
  });
});

describe("webauthn challenge flow/subject binding (AUTH-06)", () => {
  it("rejects a challenge minted for a different flow", async () => {
    const token = await createChallengeToken("chal", { flow: "register" });
    expect(await verifyChallengeToken(token, { flow: "authenticate" })).toBeNull();
    expect(await verifyChallengeToken(token, { flow: "claim" })).toBeNull();
  });

  it("rejects a register challenge redeemed with a different username", async () => {
    const token = await createChallengeToken("chal", {
      flow: "register",
      username: "alice",
    });
    expect(
      await verifyChallengeToken(token, { flow: "register", username: "mallory" }),
    ).toBeNull();
    expect(
      await verifyChallengeToken(token, { flow: "register", username: "alice" }),
    ).toMatchObject({ challenge: "chal", username: "alice" });
  });

  it("rejects a claim challenge redeemed with a different user or claim id", async () => {
    const token = await createChallengeToken("chal", {
      flow: "claim",
      userId: "user-1",
      claimId: "claim-1",
    });
    expect(
      await verifyChallengeToken(token, {
        flow: "claim",
        userId: "user-2",
        claimId: "claim-1",
      }),
    ).toBeNull();
    expect(
      await verifyChallengeToken(token, {
        flow: "claim",
        userId: "user-1",
        claimId: "claim-2",
      }),
    ).toBeNull();
    expect(
      await verifyChallengeToken(token, {
        flow: "claim",
        userId: "user-1",
        claimId: "claim-1",
      }),
    ).toMatchObject({ userId: "user-1", claimId: "claim-1" });
  });
});
