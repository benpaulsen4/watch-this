import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { listCollaborators,listItems, lists } from "@/lib/db/schema";

async function handler(request: AuthenticatedRequest) {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const id = url.pathname.split("/").slice(-2, -1)[0]; // Get the [id] part from /api/content/[id]/lists

    const contentId = parseInt(id);
    if (isNaN(contentId)) {
      return NextResponse.json(
        { error: "Invalid content ID" },
        { status: 400 },
      );
    }

    // Find all lists where the user is owner or collaborator that contain this content
    const userListsWithContent = await db
      .select({
        listId: lists.id,
        itemId: listItems.id,
      })
      .from(lists)
      .innerJoin(listItems, eq(lists.id, listItems.listId))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
          eq(listItems.tmdbId, contentId),
        ),
      );

    const results = userListsWithContent.map((item) => ({
      listId: item.listId,
      itemId: item.itemId,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching lists with content:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const GET = withAuth(handler);
