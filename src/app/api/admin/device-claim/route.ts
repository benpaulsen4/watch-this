import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { initiateClaim } from "@/lib/profile/devices/service";

export async function POST(request: NextRequest) {
  try {
    const secretHeader =
      request.headers.get("x-admin-secret") ||
      request.headers.get("X-Admin-Secret");
    if (
      !process.env.ADMIN_API_SECRET ||
      secretHeader !== process.env.ADMIN_API_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username, userId } = body || {};
    if (!username && !userId) {
      return NextResponse.json(
        { error: "username or userId required" },
        { status: 400 }
      );
    }

    let targetUserId = userId as string | undefined;
    if (!targetUserId && username) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      targetUserId = rows[0].id;
    }

    const res = await initiateClaim(targetUserId!, "admin");
    if (res === "maxDevices") {
      return NextResponse.json(
        { error: "Maximum devices reached" },
        { status: 400 }
      );
    }

    return NextResponse.json(res);
  } catch (error) {
    console.error("Admin device claim error:", error);
    return NextResponse.json(
      { error: "Failed to create device claim" },
      { status: 500 }
    );
  }
}
