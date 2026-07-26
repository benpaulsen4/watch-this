import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
  generateRegistrationOptions,
  type GenerateRegistrationOptionsOpts,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";

import { passkeyCredentials, type User, users } from "../db";
import { expectRow } from "../db/expectRow";
import { db } from "../db/index";

const RP_NAME = process.env.WEBAUTHN_RP_NAME || "WatchThis";

// SUPPLY-02. WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN used to fall back to localhost
// unconditionally. A production deploy missing either one would therefore
// validate every ceremony against localhost and *succeed* -- the RP ID and
// origin checks are string comparisons, so the wrong expected value is not an
// error, it is a silently wrong security decision. Fail closed instead, the
// same way getJwtSecret() does for WEBAUTHN_SECRET below. The localhost
// defaults stay for development, where they are what you actually want.
//
// Read on each call rather than cached at module scope: these are plain env
// reads with nothing to memoise, and a module-scope throw would crash at import
// time during `next build`, which evaluates route modules without runtime env.
function requireInProduction(
  name: "WEBAUTHN_RP_ID" | "WEBAUTHN_ORIGIN",
  value: string | undefined,
  developmentDefault: string
): string {
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} environment variable is required in production; refusing to ` +
        `validate WebAuthn ceremonies against ${developmentDefault}`
    );
  }
  return developmentDefault;
}

export function getRpId(): string {
  return process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_URL!
    : requireInProduction(
        "WEBAUTHN_RP_ID",
        process.env.WEBAUTHN_RP_ID,
        "localhost"
      );
}

// The single source of truth for the expected WebAuthn origin. Exported because
// the device-claim service builds magic links from the same value and used to
// derive it independently, which let the two drift apart.
export function getWebAuthnOrigin(): string {
  // The `&& VERCEL_URL` is not redundant. The getOrigin() this replaced in
  // devices/service.ts guarded on it and fell through to WEBAUTHN_ORIGIN when it
  // was absent; without the guard a preview deployment missing VERCEL_URL would
  // build the literal string "https://undefined" and hand it to the ceremony as
  // the expected origin -- silently wrong, which is the exact failure this
  // change exists to remove.
  //
  // getRpId above deliberately keeps its unguarded `VERCEL_URL!`: that, and the
  // instability of a deployment-specific RP ID, are AUTH-07, which the owner has
  // decided not to address. This function is only restoring a guard that existed
  // on master.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return requireInProduction(
    "WEBAUTHN_ORIGIN",
    process.env.WEBAUTHN_ORIGIN,
    "http://localhost:3000"
  );
}

let jwtSecretCache: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (jwtSecretCache) return jwtSecretCache;

  const secret = process.env.WEBAUTHN_SECRET;
  if (!secret) {
    throw new Error("WEBAUTHN_SECRET environment variable is required");
  }

  jwtSecretCache = new TextEncoder().encode(secret);
  return jwtSecretCache;
}

// Distinct token types. Every JWT this module signs carries a `typ` claim so a
// token minted for one purpose (e.g. a short-lived claim token) can never be
// replayed as another (e.g. a 7-day session), even though they share a secret.
const TOKEN_TYPE = {
  SESSION: "session",
  CLAIM: "claim",
  CHALLENGE: "challenge",
} as const;

// A Drizzle query executor: either the top-level `db` or a transaction handle.
// Narrowed to the query builders this module uses so both `db` and a
// transaction handle satisfy it, letting callers run credential writes inside
// an existing transaction (commit/roll back atomically with surrounding work).
export type DbExecutor = Pick<typeof db, "select" | "insert">;

export interface AuthSession {
  userId: string;
  username: string;
  tokenVersion: number;
}

// WebAuthn challenge tokens are issued in a "begin" step and redeemed in a
// "verify" step. Binding the flow (and, where known, the username/user/claim
// it was minted for) into the token prevents a challenge issued for one flow or
// subject from being replayed in another.
export type ChallengeFlow = "register" | "authenticate" | "claim";

export interface ChallengeBinding {
  flow: ChallengeFlow;
  username?: string;
  userId?: string;
  claimId?: string;
}

export interface ChallengePayload {
  challenge: string;
  flow: ChallengeFlow;
  username?: string;
  userId?: string;
  claimId?: string;
}

// Generate registration options for new passkey
export async function generatePasskeyRegistrationOptions(username: string) {
  // Check if username already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("Username already exists");
  }

  const options: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: getRpId(),
    userName: username,
    userDisplayName: username,
    timeout: 60000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  };

  return await generateRegistrationOptions(options);
}

// Verify registration response and create user
export async function verifyPasskeyRegistration(
  username: string,
  registrationResponse: RegistrationResponseJSON,
  expectedChallenge: string,
  deviceName?: string,
  timezone?: string
) {
  const verification: VerifyRegistrationResponseOpts = {
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getRpId(),
  };

  const verificationResult = await verifyRegistrationResponse(verification);

  if (!verificationResult.verified || !verificationResult.registrationInfo) {
    throw new Error("Registration verification failed");
  }

  const { credential } = verificationResult.registrationInfo;
  const credentialID = credential.id;
  const credentialPublicKey = credential.publicKey;
  const counter = credential.counter;

  // Create user and passkey credential in transaction
  const result = await db.transaction(async (tx) => {
    // Both of these are unconditional single-row inserts with no onConflict
    // clause, so each returns its new row or throws and aborts the transaction.
    // Unwrapping here keeps the function's return type free of `undefined`,
    // which callers (the register/verify route) rely on.
    const newUser = expectRow(
      await tx
        .insert(users)
        .values({
          username,
          timezone: timezone || "UTC",
        })
        .returning(),
      "verifyPasskeyRegistration insert users"
    );

    // Create passkey credential
    const credential = expectRow(
      await tx
        .insert(passkeyCredentials)
        .values({
          userId: newUser.id,
          credentialId: credentialID,
          publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
          counter,
          deviceName: deviceName || "Unknown Device",
        })
        .returning(),
      "verifyPasskeyRegistration insert passkeyCredentials"
    );

    return { user: newUser, credential };
  });

  return result;
}

// Generate registration options for adding an additional passkey to an existing user
export async function generateAdditionalPasskeyRegistrationOptions(
  userId: string
) {
  const userData = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const u = userData[0];
  if (!u) {
    throw new Error("User not found");
  }

  const options: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: getRpId(),
    userName: u.username,
    userDisplayName: u.username,
    timeout: 60000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  };

  return await generateRegistrationOptions(options);
}

// Verify registration response and add credential to existing user
export async function verifyAdditionalPasskeyRegistration(
  userId: string,
  registrationResponse: RegistrationResponseJSON,
  expectedChallenge: string,
  deviceName?: string,
  // Run the device-cap read and credential insert on this executor. Pass a
  // transaction handle so the credential is committed/rolled back together
  // with the caller's other writes (e.g. consuming a passkey claim).
  executor: DbExecutor = db
) {
  const verification: VerifyRegistrationResponseOpts = {
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getRpId(),
  };

  const verificationResult = await verifyRegistrationResponse(verification);

  if (!verificationResult.verified || !verificationResult.registrationInfo) {
    throw new Error("Registration verification failed");
  }

  const { credential } = verificationResult.registrationInfo;
  const credentialID = credential.id;
  const credentialPublicKey = credential.publicKey;
  const counter = credential.counter;
  // DATA-08a: count in the database rather than selecting every credential row
  // to read `.length`. This is on the registration hot path.
  const [activeDevices] = await executor
    .select({ value: count() })
    .from(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        isNull(passkeyCredentials.deletedAt)
      )
    );

  if ((activeDevices?.value ?? 0) >= 10) {
    throw new Error("Maximum devices reached");
  }

  const [newCredential] = await executor
    .insert(passkeyCredentials)
    .values({
      userId,
      credentialId: credentialID,
      publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
      counter,
      deviceName: deviceName || "Unknown Device",
    })
    .returning();

  return { credential: newCredential };
}

// Create JWT claim token
export async function createClaimToken(
  claimId: string,
  userId: string
): Promise<string> {
  const payload = { typ: TOKEN_TYPE.CLAIM, claimId, userId };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecret());
}

// Verify JWT claim token
export async function verifyClaimToken(
  token: string
): Promise<{ claimId: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.typ !== TOKEN_TYPE.CLAIM) return null;
    return {
      claimId: payload.claimId as string,
      userId: payload.userId as string,
    };
  } catch {
    return null;
  }
}

// Generate authentication options for existing user
export async function generatePasskeyAuthenticationOptions() {
  const options: GenerateAuthenticationOptionsOpts = {
    rpID: getRpId(),
    timeout: 60000,
    userVerification: "preferred",
  };

  return await generateAuthenticationOptions(options);
}

// Verify authentication response
export async function verifyPasskeyAuthentication(
  authenticationResponse: AuthenticationResponseJSON,
  expectedChallenge: string
) {
  // Get credential and user info
  const credentialData = await db
    .select({
      credential: passkeyCredentials,
      user: users,
    })
    .from(passkeyCredentials)
    .innerJoin(users, eq(users.id, passkeyCredentials.userId))
    .where(
      and(
        eq(passkeyCredentials.credentialId, authenticationResponse.id),
        isNull(passkeyCredentials.deletedAt)
      )
    )
    .limit(1);

  const credentialRow = credentialData[0];
  if (!credentialRow) {
    throw new Error("Credential not found");
  }

  const { credential, user } = credentialRow;

  const verification = {
    response: authenticationResponse as AuthenticationResponseJSON,
    expectedChallenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getRpId(),
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, "base64url"),
      counter: credential.counter,
    },
  };

  const verificationResult = await verifyAuthenticationResponse(verification);

  if (!verificationResult.verified) {
    throw new Error("Authentication verification failed");
  }

  // Update counter and last used
  await db
    .update(passkeyCredentials)
    .set({
      counter: verificationResult.authenticationInfo.newCounter,
      lastUsed: new Date(),
    })
    .where(eq(passkeyCredentials.id, credential.id));

  return { user, credential };
}

// Create JWT session token
export async function createSessionToken(user: User): Promise<string> {
  const payload = {
    typ: TOKEN_TYPE.SESSION,
    userId: user.id,
    username: user.username,
    tokenVersion: user.tokenVersion,
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

// Verify JWT session token
export async function verifySessionToken(
  token: string
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.typ !== TOKEN_TYPE.SESSION) return null;
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      tokenVersion: (payload.tokenVersion as number | undefined) ?? 0,
    };
  } catch {
    return null;
  }
}

// Create JWT challenge token
export async function createChallengeToken(
  challenge: string,
  binding: ChallengeBinding
): Promise<string> {
  const payload = {
    typ: TOKEN_TYPE.CHALLENGE,
    challenge,
    flow: binding.flow,
    ...(binding.username !== undefined ? { username: binding.username } : {}),
    ...(binding.userId !== undefined ? { userId: binding.userId } : {}),
    ...(binding.claimId !== undefined ? { claimId: binding.claimId } : {}),
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecret());
}

// Verify JWT challenge token. The caller must pass the flow it expects, plus
// any subject identifiers (username/userId/claimId) it knows; a token whose
// bound values don't match is rejected.
//
// TODO(FOLLOW-UP): challenge tokens are still replayable within their 10-minute
// lifetime -- full single-use enforcement needs a server-side nonce store
// (e.g. a `challenge_nonces` table, or the existing session store) recording
// consumed challenge ids. The flow/subject binding below is implemented fully;
// the single-use store is deferred to keep this PR contained.
export async function verifyChallengeToken(
  token: string,
  expected: ChallengeBinding
): Promise<ChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.typ !== TOKEN_TYPE.CHALLENGE) return null;
    if (payload.flow !== expected.flow) return null;
    if (
      expected.username !== undefined &&
      payload.username !== expected.username
    ) {
      return null;
    }
    if (expected.userId !== undefined && payload.userId !== expected.userId) {
      return null;
    }
    if (expected.claimId !== undefined && payload.claimId !== expected.claimId) {
      return null;
    }
    return {
      challenge: payload.challenge as string,
      flow: payload.flow as ChallengeFlow,
      username: payload.username as string | undefined,
      userId: payload.userId as string | undefined,
      claimId: payload.claimId as string | undefined,
    };
  } catch {
    return null;
  }
}

// Get current user from session
export async function getCurrentUser(
  sessionToken?: string
): Promise<User | null> {
  if (!sessionToken) return null;

  const session = await verifySessionToken(sessionToken);
  if (!session) return null;

  const userData = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = userData[0];
  if (!user) return null;

  // Reject sessions minted before the user's token version was bumped
  // (signout-all or passkey deletion), so revocation takes effect immediately
  // rather than waiting for the 7-day JWT expiry.
  if (session.tokenVersion !== user.tokenVersion) return null;

  return user;
}
