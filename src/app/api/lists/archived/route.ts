import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { listArchivedLists } from "@/lib/lists/service";

// GET /api/lists/archived - Get all archived lists for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    const listsWithPosters = await listArchivedLists(userId);

    return NextResponse.json({ lists: listsWithPosters });
  } catch (error) {
    console.error("Error fetching archived lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch archived lists" },
      { status: 500 }
    );
  }
});
