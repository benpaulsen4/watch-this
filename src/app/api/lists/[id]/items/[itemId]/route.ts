import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or } from "drizzle-orm";
import { deleteListItem } from "@/lib/lists/service";

// DELETE /api/lists/[id]/items/[itemId] - Remove item from list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];

    if (!listId || !itemId) {
      return NextResponse.json(
        { error: "List ID and Item ID are required" },
        { status: 400 }
      );
    }

    const result = await deleteListItem(userId, listId, itemId);
    if (result === "notFound") {
      return NextResponse.json(
        { error: "Item or list not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error removing item from list:", error);
    return NextResponse.json(
      { error: "Failed to remove item from list" },
      { status: 500 }
    );
  }
});
