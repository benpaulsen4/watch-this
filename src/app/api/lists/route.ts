import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  lists,
  listItems,
  listCollaborators,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, or, sql, desc } from "drizzle-orm";

// GET /api/lists - Get all lists for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    // Get lists with counts in a single optimized query
    const userListsWithCounts = await db
      .select({
        id: lists.id,
        name: lists.name,
        description: lists.description,
        listType: lists.listType,
        isPublic: lists.isPublic,
        syncWatchStatus: lists.syncWatchStatus,
        ownerId: lists.ownerId,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
        itemCount: sql<number>`(
          SELECT COUNT(*) 
          FROM ${listItems} 
          WHERE ${listItems.listId} = ${lists.id}
        )`.as("item_count"),
        collaborators: sql<number>`(
          SELECT COUNT(*) 
          FROM ${listCollaborators} 
          WHERE ${listCollaborators.listId} = ${lists.id}
        )`.as("collaborator_count"),
      })
      .from(lists)
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
      )
      .groupBy(
        lists.id,
        lists.name,
        lists.description,
        lists.listType,
        lists.isPublic,
        lists.ownerId,
        lists.createdAt,
        lists.updatedAt,
      );

    // Get poster URLs for each list (up to 4 items)
    const listsWithPosters = await Promise.all(
      userListsWithCounts.map(async (list) => {
        const posterItems = await db
          .select({
            posterPath: listItems.posterPath,
          })
          .from(listItems)
          .where(eq(listItems.listId, list.id))
          .orderBy(desc(listItems.createdAt))
          .limit(4);

        return {
          ...list,
          posterPaths: posterItems.map((i) => i.posterPath),
        };
      }),
    );

    return NextResponse.json({ lists: listsWithPosters });
  } catch (error) {
    console.error("Error fetching lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch lists" },
      { status: 500 },
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
        { status: 400 },
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "List name must be 100 characters or less" },
        { status: 400 },
      );
    }

    const validListTypes = ["movies", "tv", "mixed"];
    if (!validListTypes.includes(listType)) {
      return NextResponse.json(
        { error: "Invalid list type. Must be 'movies', 'tv', or 'mixed'" },
        { status: 400 },
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
        activityError,
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
      { status: 500 },
    );
  }
});
