import { NextResponse } from "next/server";

import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
import { deletePasskey } from "@/lib/profile/devices/service";

export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const credentialId = request.url.split("/").pop()!;
    const res = await deletePasskey(userId, credentialId);
    if (res === "minimum") {
      return NextResponse.json(
        { error: "At least one passkey is required" },
        { status: 400 },
      );
    }
    if (res === "notFound") {
      return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
    }
    return NextResponse.json(res);
  } catch (error) {
    console.error("Delete passkey error:", error);
    return NextResponse.json(
      { error: "Failed to delete passkey" },
      { status: 500 },
    );
  }
});
