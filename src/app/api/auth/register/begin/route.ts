import { NextRequest, NextResponse } from "next/server";
import { generatePasskeyRegistrationOptions } from "@/lib/auth/webauthn";

interface RequestBody {
  username: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { username } = body;

    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    if (!usernameRegex.test(username.trim())) {
      return NextResponse.json(
        {
          error:
            "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens",
        },
        { status: 400 }
      );
    }

    const options = await generatePasskeyRegistrationOptions(username.trim());

    // Store challenge in session for verification
    const response = NextResponse.json({
      options,
      challenge: options.challenge,
    });

    // Set challenge in httpOnly cookie for security
    response.cookies.set("registration-challenge", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60, // 5 minutes
      path: "/api/auth/register",
    });

    return response;
  } catch (error) {
    console.error("Registration begin error:", error);

    if (error instanceof Error && error.message === "Username already exists") {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate registration options" },
      { status: 500 }
    );
  }
}
