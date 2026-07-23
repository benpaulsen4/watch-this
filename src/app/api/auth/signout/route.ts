import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/webauthn";
import { db, users } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // "Sign out all devices": bump the user's token version so every
    // outstanding session JWT is rejected on its next request, not just the
    // cookie on this device. Opt in via `?all=1` or a JSON `{ all: true }`
    // body. Ordinary single-device signout stays cookie-clear only.
    let signOutAll = request.nextUrl.searchParams.get("all") === "1";
    if (!signOutAll) {
      try {
        const body = await request.json();
        if (body && body.all === true) signOutAll = true;
      } catch {
        // No/invalid body -- treat as single-device signout.
      }
    }

    if (signOutAll) {
      const sessionToken = request.cookies.get("session")?.value;
      const user = sessionToken ? await getCurrentUser(sessionToken) : null;
      if (user) {
        await db
          .update(users)
          .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
          .where(eq(users.id, user.id));
      }
    }

    const response = NextResponse.json({
      success: true,
      message: "Signed out successfully",
    });

    // Clear session cookie
    response.cookies.delete("session");

    // Also clear any challenge cookies that might exist
    response.cookies.delete("registration-challenge");
    response.cookies.delete("authentication-challenge");

    return response;
  } catch (error) {
    console.error("Sign out error:", error);

    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 });
  }
}
