import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import type { AuthenticateBeginResponse } from "@/lib/auth/types";
import {
  createChallengeToken,
  generatePasskeyAuthenticationOptions,
} from "@/lib/auth/webauthn";

// GET /api/auth/authenticate/begin - sign-in options for any passkey
export const GET = publicRoute(authApi.authenticateBegin, {}, async () => {
  const options = await generatePasskeyAuthenticationOptions();

  const response = NextResponse.json({
    options,
  } satisfies AuthenticateBeginResponse);

  // Set challenge in httpOnly cookie for security
  response.cookies.set(
    "authentication-challenge",
    // Usernameless auth: the subject is unknown until verification, so only
    // the flow is bound here.
    await createChallengeToken(options.challenge, { flow: "authenticate" }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60, // 10 minutes
      path: "/api/auth/authenticate",
    },
  );

  return response;
});
