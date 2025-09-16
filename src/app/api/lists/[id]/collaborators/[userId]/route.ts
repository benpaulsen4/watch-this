import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  lists,
  listCollaborators,
  users,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { PermissionLevel } from "@/lib/db/schema";

// PUT /api/lists/[id]/collaborators/[userId] - Update collaborator permissions
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[pathParts.length - 3]; // Get list ID from path
    const collaboratorUserId = pathParts[pathParts.length - 1]; // Get collaborator user ID from path

    if (!listId || !collaboratorUserId) {
      return NextResponse.json(
        { error: "List ID and collaborator user ID are required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { permissionLevel } = body;

    // Validate input
    if (
      !permissionLevel ||
      !Object.values(PermissionLevel).includes(permissionLevel)
    ) {
      return NextResponse.json(
        { error: "Valid permission level is required" },
        { status: 400 }
      );
    }

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId, name: lists.name })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!existingList) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    if (existingList.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can update collaborator permissions" },
        { status: 403 }
      );
    }

    // Check if the collaborator exists
    const [existingCollaborator] = await db
      .select({
        id: listCollaborators.id,
        userId: listCollaborators.userId,
        permissionLevel: listCollaborators.permissionLevel,
      })
      .from(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, collaboratorUserId)
        )
      )
      .limit(1);

    if (!existingCollaborator) {
      return NextResponse.json(
        { error: "Collaborator not found" },
        { status: 404 }
      );
    }

    // Update the collaborator's permission level
    const [updatedCollaborator] = await db
      .update(listCollaborators)
      .set({ permissionLevel })
      .where(eq(listCollaborators.id, existingCollaborator.id))
      .returning();

    // Get user info for response
    const [userInfo] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, collaboratorUserId))
      .limit(1);

    const collaboratorWithUser = {
      id: updatedCollaborator.id,
      userId: updatedCollaborator.userId,
      username: userInfo?.username || "Unknown",
      permissionLevel: updatedCollaborator.permissionLevel,
      createdAt: updatedCollaborator.createdAt,
    };

    return NextResponse.json({
      collaborator: collaboratorWithUser,
      message: `Permission level updated to ${permissionLevel}`,
    });
  } catch (error) {
    console.error("Error updating collaborator:", error);
    return NextResponse.json(
      { error: "Failed to update collaborator" },
      { status: 500 }
    );
  }
});

// DELETE /api/lists/[id]/collaborators/[userId] - Remove a collaborator from a list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[pathParts.length - 3]; // Get list ID from path
    const collaboratorUserId = pathParts[pathParts.length - 1]; // Get collaborator user ID from path

    if (!listId || !collaboratorUserId) {
      return NextResponse.json(
        { error: "List ID and collaborator user ID are required" },
        { status: 400 }
      );
    }

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId, name: lists.name })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!existingList) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    if (existingList.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can remove collaborators" },
        { status: 403 }
      );
    }

    // Check if the collaborator exists
    const [existingCollaborator] = await db
      .select({
        id: listCollaborators.id,
        userId: listCollaborators.userId,
      })
      .from(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, collaboratorUserId)
        )
      )
      .limit(1);

    if (!existingCollaborator) {
      return NextResponse.json(
        { error: "Collaborator not found" },
        { status: 404 }
      );
    }

    // Get user info for response message
    const [userInfo] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, collaboratorUserId))
      .limit(1);

    // Remove the collaborator
    await db
      .delete(listCollaborators)
      .where(eq(listCollaborators.id, existingCollaborator.id));

    // Generate activity for collaborator removal
    try {
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.COLLABORATOR_REMOVED,
        listId,
        metadata: {
          listName: existingList.name,
          collaboratorUsername: userInfo?.username || "Unknown User",
          collaboratorUserId,
        },
        createdAt: new Date(),
      });
    } catch (activityError) {
      console.error(
        "Failed to create activity for collaborator removal:",
        activityError
      );
      // Don't fail the main operation if activity creation fails
    }

    return NextResponse.json({
      message: `${userInfo?.username || "User"} has been removed from ${
        existingList.name
      }`,
    });
  } catch (error) {
    console.error("Error removing collaborator:", error);
    return NextResponse.json(
      { error: "Failed to remove collaborator" },
      { status: 500 }
    );
  }
});
