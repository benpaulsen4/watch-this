import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listCollaborators, users } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { PermissionLevel } from "@/lib/db/schema";

// GET /api/lists/[id]/collaborators - Get all collaborators for a list
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const listId = pathParts[pathParts.length - 2]; // Get list ID from path
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({
        id: lists.id,
        ownerId: lists.ownerId,
        name: lists.name,
      })
      .from(lists)
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.id, listId),
          // User must be owner or collaborator to view collaborators
          eq(lists.ownerId, userId)
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }

    // Get all collaborators for this list
    const collaborators = await db
      .select({
        id: listCollaborators.id,
        userId: listCollaborators.userId,
        username: users.username,
        profilePictureUrl: users.profilePictureUrl,
        permissionLevel: listCollaborators.permissionLevel,
        invitedAt: listCollaborators.invitedAt,
        joinedAt: listCollaborators.joinedAt,
      })
      .from(listCollaborators)
      .innerJoin(users, eq(users.id, listCollaborators.userId))
      .where(eq(listCollaborators.listId, listId));

    return NextResponse.json({ collaborators });
  } catch (error) {
    console.error("Error fetching collaborators:", error);
    return NextResponse.json(
      { error: "Failed to fetch collaborators" },
      { status: 500 }
    );
  }
});

// POST /api/lists/[id]/collaborators - Add a new collaborator to a list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const listId = pathParts[pathParts.length - 2]; // Get list ID from path
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { username, permissionLevel = PermissionLevel.COLLABORATOR } = body;

    // Validate input
    if (!username || username.trim().length === 0) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    if (!Object.values(PermissionLevel).includes(permissionLevel)) {
      return NextResponse.json(
        { error: "Invalid permission level" },
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
      return NextResponse.json(
        { error: "List not found" },
        { status: 404 }
      );
    }

    if (existingList.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can add collaborators" },
        { status: 403 }
      );
    }

    // Check if the user to be added exists
    const [targetUser] = await db
      .select({ id: users.id, username: users.username, profilePictureUrl: users.profilePictureUrl })
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user is trying to add themselves
    if (targetUser.id === userId) {
      return NextResponse.json(
        { error: "Cannot add yourself as a collaborator" },
        { status: 400 }
      );
    }

    // Check if user is already a collaborator
    const [existingCollaborator] = await db
      .select({ id: listCollaborators.id })
      .from(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, targetUser.id)
        )
      )
      .limit(1);

    if (existingCollaborator) {
      return NextResponse.json(
        { error: "User is already a collaborator on this list" },
        { status: 409 }
      );
    }

    // Add the collaborator
    const [newCollaborator] = await db
      .insert(listCollaborators)
      .values({
        listId,
        userId: targetUser.id,
        permissionLevel,
        invitedAt: new Date(),
        joinedAt: new Date(), // Auto-join for now, could be invitation-based later
      })
      .returning();

    // Return the collaborator with user info
    const collaboratorWithUser = {
      id: newCollaborator.id,
      userId: targetUser.id,
      username: targetUser.username,
      profilePictureUrl: targetUser.profilePictureUrl,
      permissionLevel: newCollaborator.permissionLevel,
      invitedAt: newCollaborator.invitedAt,
      joinedAt: newCollaborator.joinedAt,
    };

    return NextResponse.json({ 
      collaborator: collaboratorWithUser,
      message: `${targetUser.username} has been added as a ${permissionLevel} to ${existingList.name}`
    });
  } catch (error) {
    console.error("Error adding collaborator:", error);
    return NextResponse.json(
      { error: "Failed to add collaborator" },
      { status: 500 }
    );
  }
});