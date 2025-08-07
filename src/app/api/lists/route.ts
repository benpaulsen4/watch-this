import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, or, count } from "drizzle-orm";

// GET /api/lists - Get all lists for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    // Get lists owned by user or where user is a collaborator
    const userLists = await db
      .select({
        id: lists.id,
        name: lists.name,
        description: lists.description,
        listType: lists.listType,
        isPublic: lists.isPublic,
        ownerId: lists.ownerId,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        or(
          eq(lists.ownerId, userId),
          eq(listCollaborators.userId, userId)
        )
      )
      .groupBy(lists.id);

    // Get item counts and collaborator counts for each list
    const listsWithCounts = await Promise.all(
      userLists.map(async (list) => {
        const [itemCountResult, collaboratorCountResult] = await Promise.all([
          db
            .select({ count: count() })
            .from(listItems)
            .where(eq(listItems.listId, list.id)),
          db
            .select({ count: count() })
            .from(listCollaborators)
            .where(eq(listCollaborators.listId, list.id))
        ]);

        return {
          ...list,
          itemCount: itemCountResult[0]?.count || 0,
          collaborators: collaboratorCountResult[0]?.count || 0,
        };
      })
    );

    return NextResponse.json({ lists: listsWithCounts });
  } catch (error) {
    console.error("Error fetching lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch lists" },
      { status: 500 }
    );
  }
});

// POST /api/lists - Create a new list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    
    const { name, description, listType = "mixed", isPublic = false } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "List name is required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "List name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const validListTypes = ["movies", "tv", "mixed"];
    if (!validListTypes.includes(listType)) {
      return NextResponse.json(
        { error: "Invalid list type. Must be 'movies', 'tv', or 'mixed'" },
        { status: 400 }
      );
    }

    // Create the new list
    const [newList] = await db
      .insert(lists)
      .values({
        ownerId: userId,
        name: name.trim(),
        description: description?.trim() || null,
        listType,
        isPublic: Boolean(isPublic),
      })
      .returning();

    // Return the new list with counts
    const listWithCounts = {
      ...newList,
      itemCount: 0,
      collaborators: 0,
    };

    return NextResponse.json({ list: listWithCounts }, { status: 201 });
  } catch (error) {
    console.error("Error creating list:", error);
    return NextResponse.json(
      { error: "Failed to create list" },
      { status: 500 }
    );
  }
});