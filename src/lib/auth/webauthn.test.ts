// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

// The webauthn module imports the db client at module load. We never touch the
// database in these token tests, so stub both specifiers it uses.
vi.mock("../db/index", () => ({ db: {} }));
vi.mock("../db", () => ({ db: {}, users: {}, passkeyCredentials: {} }));

import {
  createChallengeToken,
  createClaimToken,
  createSessionToken,
  verifyChallengeToken,
  verifyClaimToken,
  verifySessionToken,
} from "./webauthn";

const fakeUser = {
  id: "user-123",
  username: "alice",
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

  it("accepts a claim token in the claim verifier", async () => {
    const token = await createClaimToken("claim-1", "user-123");
    const claim = await verifyClaimToken(token);
    expect(claim).toMatchObject({ claimId: "claim-1", userId: "user-123" });
  });

  it("accepts a challenge token in the challenge verifier", async () => {
    const token = await createChallengeToken("chal-abc");
    const challenge = await verifyChallengeToken(token);
    expect(challenge).toMatchObject({ challenge: "chal-abc" });
  });

  it("rejects a claim token presented as a session token", async () => {
    const claimToken = await createClaimToken("claim-1", "user-123");
    expect(await verifySessionToken(claimToken)).toBeNull();
  });

  it("rejects a challenge token presented as a session token", async () => {
    const challengeToken = await createChallengeToken("chal-abc");
    expect(await verifySessionToken(challengeToken)).toBeNull();
  });

  it("rejects a session token presented as a claim token", async () => {
    const sessionToken = await createSessionToken(fakeUser);
    expect(await verifyClaimToken(sessionToken)).toBeNull();
  });

  it("rejects a session token presented as a challenge token", async () => {
    const sessionToken = await createSessionToken(fakeUser);
    expect(await verifyChallengeToken(sessionToken)).toBeNull();
  });

  it("rejects a claim token presented as a challenge token", async () => {
    const claimToken = await createClaimToken("claim-1", "user-123");
    expect(await verifyChallengeToken(claimToken)).toBeNull();
  });
});
