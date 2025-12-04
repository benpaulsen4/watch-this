import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, count } from "drizzle-orm";
import { getList, updateList, deleteList } from "@/lib/lists/service";
import { UpdateListInput } from "@/lib/lists/types";

// GET /api/lists/[id] - Get a specific list
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const listWithItems = await getList(userId, listId);

    return NextResponse.json(listWithItems);
  } catch (error) {
    console.error("Error fetching list:", error);
    return NextResponse.json(
      { error: "Failed to fetch list" },
      { status: 500 },
    );
  }
});

// PUT /api/lists/[id] - Update a list
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as UpdateListInput;
    const { name, description, listType, isPublic, syncWatchStatus } = body;

    // Validate input
    if (name !== undefined) {
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
    }

    if (listType !== undefined) {
      const validListTypes = ["movies", "tv", "mixed"];
      if (!validListTypes.includes(listType)) {
        return NextResponse.json(
          { error: "Invalid list type. Must be 'movies', 'tv', or 'mixed'" },
          { status: 400 },
        );
      }
    }

    const updated = await updateList(userId, listId, body);
    if (updated === "notFound") {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (updated === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can update this list" },
        { status: 403 },
      );
    }

    return NextResponse.json({ list: updated });
  } catch (error) {
    console.error("Error updating list:", error);
    return NextResponse.json(
      { error: "Failed to update list" },
      { status: 500 },
    );
  }
});

// DELETE /api/lists/[id] - Delete a list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const result = await deleteList(userId, listId);
    if (result === "notFound") {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the list owner can delete this list" },
        { status: 403 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error deleting list:", error);
    return NextResponse.json(
      { error: "Failed to delete list" },
      { status: 500 },
    );
  }
});
