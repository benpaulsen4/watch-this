import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listCollaborators, users } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { PermissionLevel } from "@/lib/db/schema";
import { updateListCollaborator, deleteListCollaborator } from "@/lib/lists/service";
import { UpdateCollaboratorInput } from "@/lib/lists/types";

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
        { status: 400 },
      );
    }

    const body = (await request.json()) as UpdateCollaboratorInput;
    const { permissionLevel } = body;

    // Validate input
    if (
      !permissionLevel ||
      !Object.values(PermissionLevel).includes(permissionLevel)
    ) {
      return NextResponse.json(
        { error: "Valid permission level is required" },
        { status: 400 },
      );
    }

    const result = await updateListCollaborator(userId, listId, collaboratorUserId, { permissionLevel });
    if (result === "notFound") {
      return NextResponse.json({ error: "List or collaborator not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can update collaborator permissions" },
        { status: 403 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating collaborator:", error);
    return NextResponse.json(
      { error: "Failed to update collaborator" },
      { status: 500 },
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
        { status: 400 },
      );
    }

    const result = await deleteListCollaborator(userId, listId, collaboratorUserId);
    if (result === "notFound") {
      return NextResponse.json({ error: "List or collaborator not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can remove collaborators" },
        { status: 403 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error removing collaborator:", error);
    return NextResponse.json(
      { error: "Failed to remove collaborator" },
      { status: 500 },
    );
  }
});
