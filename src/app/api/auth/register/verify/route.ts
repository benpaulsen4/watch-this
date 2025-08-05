import { NextRequest, NextResponse } from "next/server";
import {
  verifyPasskeyRegistration,
  createSessionToken,
} from "@/lib/auth/webauthn";
import { RegistrationResponseJSON } from "@simplewebauthn/server";

interface RequestBody {
  username: string;
  registrationResponse: unknown;
  challenge: string;
  deviceName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { username, registrationResponse, challenge, deviceName } = body;

    if (
      !username ||
      !registrationResponse ||
      !(registrationResponse as RegistrationResponseJSON)?.id ||
      !challenge
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify challenge matches the one stored in cookie
    const storedChallenge = request.cookies.get(
      "registration-challenge"
    )?.value;
    if (!storedChallenge || storedChallenge !== challenge) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 400 }
      );
    }

    // Verify registration
    const { user, credential } = await verifyPasskeyRegistration(
      username.trim(),
      registrationResponse as RegistrationResponseJSON,
      challenge,
      deviceName
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
        createdAt: credential.createdAt,
      },
      token,
    });

    // Clear registration challenge cookie
    response.cookies.delete("registration-challenge");

    // Set session cookie
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Registration verification error:", error);

    if (error instanceof Error) {
      if (error.message === "Username already exists") {
        return NextResponse.json(
          { error: "Username already exists" },
          { status: 409 }
        );
      }

      if (error.message === "Registration verification failed") {
        return NextResponse.json(
          { error: "Registration verification failed" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
