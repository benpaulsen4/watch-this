import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listCollaborators, users } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { PermissionLevel } from "@/lib/db/schema";
import {
  listListCollaborators,
  createListCollaborator,
} from "@/lib/lists/service";
import { CreateCollaboratorInput } from "@/lib/lists/types";

// GET /api/lists/[id]/collaborators - Get all collaborators for a list
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[pathParts.length - 2]; // Get list ID from path

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const result = await listListCollaborators(userId, listId);
    if (result === "notFound") {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can view collaborators" },
        { status: 403 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching collaborators:", error);
    return NextResponse.json(
      { error: "Failed to fetch collaborators" },
      { status: 500 },
    );
  }
});

// POST /api/lists/[id]/collaborators - Add a new collaborator to a list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[pathParts.length - 2]; // Get list ID from path

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as CreateCollaboratorInput;
    const { username, permissionLevel = PermissionLevel.COLLABORATOR } = body;

    // Validate input
    if (!username || username.trim().length === 0) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    if (!Object.values(PermissionLevel).includes(permissionLevel)) {
      return NextResponse.json(
        { error: "Invalid permission level" },
        { status: 400 },
      );
    }

    const result = await createListCollaborator(userId, listId, {
      username,
      permissionLevel,
    });
    if (result === "notFound") {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can add collaborators" },
        { status: 403 },
      );
    }
    if (result === "invalidUser") {
      return NextResponse.json(
        { error: "Invalid target user" },
        { status: 400 },
      );
    }
    if (result === "conflict") {
      return NextResponse.json(
        { error: "User is already a collaborator on this list" },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error adding collaborator:", error);
    return NextResponse.json(
      { error: "Failed to add collaborator" },
      { status: 500 },
    );
  }
});
