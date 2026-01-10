import { NextResponse } from "next/server";

import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
import { initiateClaim,listDevices  } from "@/lib/profile/devices/service";

// GET /api/profile/devices - Get all passkey devices for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const result = await listDevices(request.user.id);
    return NextResponse.json({ devices: result });
  } catch (error) {
    console.error("Get devices error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve devices" },
      { status: 500 },
    );
  }
});

// POST /api/profile/devices - Initiate a new passkey claim for the authenticated user
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const res = await initiateClaim(request.user.id, "user");
    if (res === "rateLimit") {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try later." },
        { status: 429 },
      );
    }
    if (res === "maxDevices") {
      return NextResponse.json(
        { error: "Maximum devices reached" },
        { status: 400 },
      );
    }

    return NextResponse.json(res);
  } catch (error) {
    console.error("Initiate claim error:", error);
    return NextResponse.json(
      { error: "Failed to initiate claim" },
      { status: 500 },
    );
  }
});
