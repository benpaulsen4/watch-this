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
import { db, users, passkeyCredentials, type User } from "../db";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

const RP_NAME = process.env.WEBAUTHN_RP_NAME || "WatchThis";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
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
    supportedAlgorithmIDs: [-7, -257],
  };

  return await generateRegistrationOptions(options);
}

// Verify registration response and create user
export async function verifyPasskeyRegistration(
  username: string,
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

  // Create user and passkey credential in transaction
  const result = await db.transaction(async (tx) => {
    // Create user
    const [newUser] = await tx
      .insert(users)
      .values({
        username,
      })
      .returning();

    // Create passkey credential
    const [credential] = await tx
      .insert(passkeyCredentials)
      .values({
        userId: newUser.id,
        credentialId: Buffer.from(credentialID).toString("base64url"),
        publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
        counter,
        deviceName: deviceName || "Unknown Device",
      })
      .returning();

    return { user: newUser, credential };
  });

  return result;
}

// Generate authentication options for existing user
export async function generatePasskeyAuthenticationOptions(username?: string) {
  let allowCredentials: {
    id: string;
    transports?: ("internal" | "hybrid")[];
  }[] = [];

  if (username) {
    // Get user's credentials
    const userCredentials = await db
      .select({ credentialId: passkeyCredentials.credentialId })
      .from(passkeyCredentials)
      .innerJoin(users, eq(users.id, passkeyCredentials.userId))
      .where(eq(users.username, username));

    allowCredentials = userCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: ["internal", "hybrid"],
    }));
  }

  const options: GenerateAuthenticationOptionsOpts = {
    rpID: RP_ID,
    timeout: 60000,
    allowCredentials:
      allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: "preferred",
  };

  return await generateAuthenticationOptions(options);
}

// Verify authentication response
export async function verifyPasskeyAuthentication(
  authenticationResponse: AuthenticationResponseJSON,
  expectedChallenge: string
) {
  const response = authenticationResponse;
  const credentialId = Buffer.from(response.id, "base64url").toString(
    "base64url"
  );

  // Get credential and user info
  const credentialData = await db
    .select({
      credential: passkeyCredentials,
      user: users,
    })
    .from(passkeyCredentials)
    .innerJoin(users, eq(users.id, passkeyCredentials.userId))
    .where(eq(passkeyCredentials.credentialId, credentialId))
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
