import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or } from "drizzle-orm";
import { createListItem } from "@/lib/lists/service";
import { CreateListItemInput } from "@/lib/lists/types";

// POST /api/lists/[id]/items - Add item to list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/")[3]; // /api/lists/[id]/items

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as CreateListItemInput;
    const { tmdbId, contentType, title, posterPath } = body;

    if (!tmdbId || !contentType || !title) {
      return NextResponse.json(
        { error: "tmdbId, contentType, and title are required" },
        { status: 400 },
      );
    }

    if (!["movie", "tv"].includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be either "movie" or "tv"' },
        { status: 400 },
      );
    }
    const result = await createListItem(userId, listId, {
      tmdbId,
      contentType,
      title,
      posterPath,
    });
    if (result === "notFound") {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 },
      );
    }
    if (result === "invalidType") {
      return NextResponse.json(
        { error: "Invalid content type for list" },
        { status: 400 },
      );
    }
    if (result === "conflict") {
      return NextResponse.json(
        { error: "This item is already in the list" },
        { status: 409 },
      );
    }

    return NextResponse.json({ item: result }, { status: 201 });
  } catch (error) {
    console.error("Error adding item to list:", error);
    return NextResponse.json(
      { error: "Failed to add item to list" },
      { status: 500 },
    );
  }
});
