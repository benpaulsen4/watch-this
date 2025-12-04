import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { cancelClaim } from "@/lib/profile/devices/service";

export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const claimId = request.url.split("/").pop()!;
    const res = await cancelClaim(userId, claimId);
    if (res === "notFound") {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to cancel claim" },
      { status: 500 }
    );
  }
});
