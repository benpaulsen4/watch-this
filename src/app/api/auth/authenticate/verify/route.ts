import { NextRequest, NextResponse } from "next/server";
import {
  verifyPasskeyAuthentication,
  createSessionToken,
  verifyChallengeToken,
} from "@/lib/auth/webauthn";
import { AuthenticationResponseJSON } from "@simplewebauthn/browser";

interface RequestBody {
  authenticationResponse: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { authenticationResponse } = body;

    if (
      !authenticationResponse ||
      !(authenticationResponse as AuthenticationResponseJSON)?.id
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify challenge
    const storedChallenge = request.cookies.get(
      "authentication-challenge"
    )?.value;
    if (!storedChallenge) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 400 }
      );
    }

    const challengePayload = await verifyChallengeToken(storedChallenge);
    if (!challengePayload) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 400 }
      );
    }

    // Verify authentication
    const { user, credential } = await verifyPasskeyAuthentication(
      authenticationResponse as AuthenticationResponseJSON,
      challengePayload.challenge
    );

    // Create session token
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
      token,
    });

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
  } catch (error) {
    console.error("Authentication verification error:", error);

    if (error instanceof Error) {
      if (error.message === "Credential not found") {
        return NextResponse.json(
          { error: "Credential not found" },
          { status: 404 }
        );
      }

      if (error.message === "Authentication verification failed") {
        return NextResponse.json(
          { error: "Authentication verification failed" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
