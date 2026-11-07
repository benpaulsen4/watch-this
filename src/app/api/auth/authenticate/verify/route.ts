import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { PasskeyError } from "@/lib/auth/passkey-error";
import { authenticateVerifySchemas } from "@/lib/auth/schemas";
import type { AuthenticateVerifyResponse } from "@/lib/auth/types";
import {
  createSessionToken,
  verifyChallengeToken,
  verifyPasskeyAuthentication,
} from "@/lib/auth/webauthn";

// POST /api/auth/authenticate/verify - sign in with a passkey
export const POST = publicRoute(
  authApi.authenticateVerify,
  authenticateVerifySchemas,
  async ({ request, body: { authenticationResponse } }) => {
    const storedChallenge = request.cookies.get(
      "authentication-challenge",
    )?.value;
    if (!storedChallenge) return "invalidChallenge";

    const challengePayload = await verifyChallengeToken(storedChallenge, {
      flow: "authenticate",
    });
    if (!challengePayload) return "invalidChallenge";

    let authenticated: Awaited<ReturnType<typeof verifyPasskeyAuthentication>>;
    try {
      authenticated = await verifyPasskeyAuthentication(
        authenticationResponse as unknown as AuthenticationResponseJSON,
        challengePayload.challenge,
      );
    } catch (error) {
      if (
        error instanceof PasskeyError &&
        (error.code === "credentialNotFound" ||
          error.code === "verificationFailed")
      ) {
        return error.code;
      }
      throw error;
    }
    const { user, credential } = authenticated;

    const token = await createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
      credential: {
        id: credential.id,
        deviceName: credential.deviceName,
        lastUsed: credential.lastUsed,
      },
    } satisfies AuthenticateVerifyResponse);

    // Clear authentication challenge cookie
    response.cookies.delete("authentication-challenge");

    // Set session cookie
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  },
);
