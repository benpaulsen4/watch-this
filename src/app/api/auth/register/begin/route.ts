import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { registerBeginSchemas } from "@/lib/auth/schemas";
import type { RegisterBeginResponse } from "@/lib/auth/types";
import {
  createChallengeToken,
  generatePasskeyRegistrationOptions,
} from "@/lib/auth/webauthn";

// POST /api/auth/register/begin - registration options for a new account
export const POST = publicRoute(
  authApi.registerBegin,
  registerBeginSchemas,
  async ({ body: { username } }) => {
    let options: RegisterBeginResponse["options"];
    try {
      options = await generatePasskeyRegistrationOptions(username);
    } catch (error) {
      if (error instanceof Error && error.message === "Username already exists") {
        return "usernameTaken";
      }
      throw error;
    }

    const response = NextResponse.json({
      options,
    } satisfies RegisterBeginResponse);

    // Set challenge in httpOnly cookie for security
    response.cookies.set(
      "registration-challenge",
      await createChallengeToken(options.challenge, {
        flow: "register",
        username,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 60, // 10 minutes
        path: "/api/auth/register",
      },
    );

    return response;
  },
);
