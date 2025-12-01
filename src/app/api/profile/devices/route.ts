import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { listDevices } from "@/lib/profile/devices/service";

// GET /api/profile/devices - Get all passkey devices for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const result = await listDevices(request.user.id);
    if (result === "dbError") {
      return NextResponse.json(
        { error: "Failed to retrieve devices" },
        { status: 500 }
      );
    }
    return NextResponse.json({ devices: result });
  } catch (error) {
    console.error("Get devices error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve devices" },
      { status: 500 }
    );
  }
});
