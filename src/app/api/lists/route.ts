import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, activityFeed, ActivityType } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { getListsResponse } from "@/lib/lists/list-utils";

// GET /api/lists - Get all lists for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    const listsWithPosters = await getListsResponse(userId);

    return NextResponse.json({ lists: listsWithPosters });
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

    const {
      name,
      description,
      listType = "mixed",
      isPublic = false,
      syncWatchStatus = false,
    } = body;

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
        syncWatchStatus: Boolean(syncWatchStatus),
      })
      .returning();

    // Generate activity for list creation
    try {
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.LIST_CREATED,
        listId: newList.id,
        metadata: {
          listName: newList.name,
          listType: newList.listType,
          isPublic: newList.isPublic,
        },
        createdAt: new Date(),
      });
    } catch (activityError) {
      console.error(
        "Failed to create activity for list creation:",
        activityError
      );
      // Don't fail the main operation if activity creation fails
    }

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
