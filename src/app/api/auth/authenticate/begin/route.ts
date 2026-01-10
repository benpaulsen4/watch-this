import { NextResponse } from "next/server";

import {
  createChallengeToken,
  generatePasskeyAuthenticationOptions,
} from "@/lib/auth/webauthn";

export async function GET() {
  try {
    const options = await generatePasskeyAuthenticationOptions();

    const response = NextResponse.json({
      options,
    });

    // Set challenge in httpOnly cookie for security
    response.cookies.set(
      "authentication-challenge",
      await createChallengeToken(options.challenge),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 60, // 10 minutes
        path: "/api/auth/authenticate",
      },
    );

    return response;
  } catch (error) {
    console.error("Authentication begin error:", error);

    return NextResponse.json(
      { error: "Failed to generate authentication options" },
      { status: 500 },
    );
  }
}
