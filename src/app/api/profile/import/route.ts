import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api/errors";
import { AuthenticatedRequest, withAuth } from "@/lib/auth/api-middleware";
import { importUserData } from "@/lib/profile/data/service";

// Maximum accepted import file size (API-03). Reject anything larger before
// reading it into memory or processing it.
const MAX_IMPORT_BYTES = 1024 * 1024; // 1 MB

function failure(status: number, body: ApiErrorBody) {
  return NextResponse.json(body, { status });
}

function invalidField(path: string, message: string) {
  return failure(400, {
    error: message,
    code: "validation",
    issues: [{ path, message }],
  });
}

// POST /api/profile/import - Import user's lists data from JSON only. A
// multipart upload, so it stays on `withAuth` rather than a contract, but its
// errors carry the same `code`s.
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const format = formData.get("format") as string;
    if (!file) {
      return invalidField("file", "File is required");
    }
    if (!format || format !== "json") {
      return invalidField("format", "Only JSON format is supported for imports");
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return failure(413, {
        error: "Import file is too large (max 1MB)",
        code: "tooLarge",
      });
    }
    const fileContent = await file.text();
    const result = await importUserData(request.user.id, fileContent);
    if (result === "parseError") {
      return failure(400, {
        error: "Failed to parse JSON file",
        code: "invalidFile",
      });
    }
    if (result === "tooLarge") {
      return failure(413, {
        error: "Import file contains too many entries",
        code: "tooLarge",
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Import data error:", error);
    return failure(500, { error: "Failed to import data", code: "internal" });
  }
});
