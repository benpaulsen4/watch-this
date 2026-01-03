import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { createListItem, getListItems } from "@/lib/lists/service";
import { WatchStatusEnum } from "@/lib/db/schema";
import { CreateListItemInput } from "@/lib/lists/types";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/")[3]; // /api/lists/[id]/items

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 }
      );
    }

    const watchStatusParams = url.searchParams.getAll("watchStatus");
    const sortOrderParam = url.searchParams.get("sortOrder");

    const validStatuses = [
      "planning",
      "watching",
      "paused",
      "completed",
      "dropped",
      "none",
    ];

    // Validate statuses
    const watchStatus = watchStatusParams.filter((s) =>
      validStatuses.includes(s)
    ) as (WatchStatusEnum | "none")[];

    const sortOrder =
      sortOrderParam === "descending" ? "descending" : "ascending";

    const result = await getListItems(userId, listId, watchStatus, sortOrder);

    if (result === "notFound") {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching list items:", error);
    return NextResponse.json(
      { error: "Failed to fetch list items" },
      { status: 500 }
    );
  }
});

// POST /api/lists/[id]/items - Add item to list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/")[3]; // /api/lists/[id]/items

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CreateListItemInput;
    const { tmdbId, contentType } = body;

    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!["movie", "tv"].includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be either "movie" or "tv"' },
        { status: 400 }
      );
    }
    const result = await createListItem(userId, listId, {
      tmdbId,
      contentType,
    });
    if (result === "notFound") {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }
    if (result === "invalidType") {
      return NextResponse.json(
        { error: "Invalid content type for list" },
        { status: 400 }
      );
    }
    if (result === "conflict") {
      return NextResponse.json(
        { error: "This item is already in the list" },
        { status: 409 }
      );
    }

    return NextResponse.json({ item: result }, { status: 201 });
  } catch (error) {
    console.error("Error adding item to list:", error);
    return NextResponse.json(
      { error: "Failed to add item to list" },
      { status: 500 }
    );
  }
});
