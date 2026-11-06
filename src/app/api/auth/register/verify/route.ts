import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { registerVerifySchemas } from "@/lib/auth/schemas";
import type { RegisterVerifyResponse } from "@/lib/auth/types";
import {
  createSessionToken,
  verifyChallengeToken,
  verifyPasskeyRegistration,
} from "@/lib/auth/webauthn";

// POST /api/auth/register/verify - create the account and sign it in
export const POST = publicRoute(
  authApi.registerVerify,
  registerVerifySchemas,
  async ({ request, body }) => {
    const { username, registrationResponse, deviceName, timezone } = body;

    const storedChallenge = request.cookies.get("registration-challenge")?.value;
    if (!storedChallenge) return "invalidChallenge";

    const challengePayload = await verifyChallengeToken(storedChallenge, {
      flow: "register",
      username,
    });
    if (!challengePayload) return "invalidChallenge";

    let registered: Awaited<ReturnType<typeof verifyPasskeyRegistration>>;
    try {
      registered = await verifyPasskeyRegistration(
        username,
        registrationResponse as unknown as RegistrationResponseJSON,
        challengePayload.challenge,
        deviceName,
        timezone,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Username already exists") return "usernameTaken";
        if (error.message === "Registration verification failed") {
          return "verificationFailed";
        }
      }
      throw error;
    }
    const { user, credential } = registered;

    const token = await createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      credential: {
        id: credential.id,
        deviceName: credential.deviceName,
        createdAt: credential.createdAt,
      },
    } satisfies RegisterVerifyResponse);

    // Clear registration challenge cookie
    response.cookies.delete("registration-challenge");

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
