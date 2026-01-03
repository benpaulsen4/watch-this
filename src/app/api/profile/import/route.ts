import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { importUserData } from "@/lib/profile/data/service";

// POST /api/profile/import - Import user's lists data from JSON only
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const format = formData.get("format") as string;
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!format || format !== "json") {
      return NextResponse.json(
        { error: "Only JSON format is supported for imports" },
        { status: 400 }
      );
    }
    const fileContent = await file.text();
    const result = await importUserData(request.user.id, fileContent);
    if (result === "parseError") {
      return NextResponse.json(
        { error: `Failed to parse JSON file` },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Import data error:", error);
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
});
