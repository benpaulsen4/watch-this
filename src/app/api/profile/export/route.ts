import { NextResponse } from "next/server";

import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
import { exportUserData } from "@/lib/profile/data/service";

// GET /api/profile/export?format=csv|json - Export user's lists data
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    if (!format || (format !== "json" && format !== "csv")) {
      return NextResponse.json(
        { error: "Format parameter is required and must be 'csv' or 'json'" },
        { status: 400 }
      );
    }
    const result = await exportUserData(request.user.id, format);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Export data error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
});
