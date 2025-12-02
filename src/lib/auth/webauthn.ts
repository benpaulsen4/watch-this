import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "../db/index";
import { users, passkeyCredentials, passkeyClaims, type User } from "../db";
import { eq, and, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

const RP_NAME = process.env.WEBAUTHN_RP_NAME || "WatchThis";
const RP_ID =
  process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_URL!
    : process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN =
  process.env.VERCEL_ENV === "preview"
    ? `https://${process.env.VERCEL_URL}`
    : process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
const JWT_SECRET = new TextEncoder().encode(
  process.env.WEBAUTHN_SECRET || "fallback-secret"
);

export interface AuthSession {
  userId: string;
  username: string;
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
    rpID: RP_ID,
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
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
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
    // Create user
    const [newUser] = await tx
      .insert(users)
      .values({
        username,
        timezone: timezone || "UTC",
      })
      .returning();

    // Create passkey credential
    const [credential] = await tx
      .insert(passkeyCredentials)
      .values({
        userId: newUser.id,
        credentialId: credentialID,
        publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
        counter,
        deviceName: deviceName || "Unknown Device",
      })
      .returning();

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

  if (userData.length === 0) {
    throw new Error("User not found");
  }

  const u = userData[0];

  const options: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: RP_ID,
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
  deviceName?: string
) {
  const verification: VerifyRegistrationResponseOpts = {
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  };

  const verificationResult = await verifyRegistrationResponse(verification);

  if (!verificationResult.verified || !verificationResult.registrationInfo) {
    throw new Error("Registration verification failed");
  }

  const { credential } = verificationResult.registrationInfo;
  const credentialID = credential.id;
  const credentialPublicKey = credential.publicKey;
  const counter = credential.counter;
  const activeDevicesRows = await db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        isNull(passkeyCredentials.deletedAt)
      )
    );

  if (activeDevicesRows.length >= 10) {
    throw new Error("Maximum devices reached");
  }

  const [newCredential] = await db
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
  const payload = { claimId, userId };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(JWT_SECRET);
}

// Verify JWT claim token
export async function verifyClaimToken(
  token: string
): Promise<{ claimId: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
    rpID: RP_ID,
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

  if (credentialData.length === 0) {
    throw new Error("Credential not found");
  }

  const { credential, user } = credentialData[0];

  const verification = {
    response: authenticationResponse as AuthenticationResponseJSON,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
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
    userId: user.id,
    username: user.username,
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

// Verify JWT session token
export async function verifySessionToken(
  token: string
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

// Create JWT challenge token
export async function createChallengeToken(challenge: string): Promise<string> {
  const payload = {
    challenge,
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(JWT_SECRET);
}

// Verify JWT challenge token
export async function verifyChallengeToken(
  token: string
): Promise<{ challenge: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      challenge: payload.challenge as string,
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

  return userData[0] || null;
}
