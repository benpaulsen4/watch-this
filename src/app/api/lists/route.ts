import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { listLists, createList } from "@/lib/lists/service";
import { CreateListInput } from "@/lib/lists/types";

// GET /api/lists - Get all lists for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    const listsWithPosters = await listLists(userId);

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
    } = body as CreateListInput;

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

    const created = await createList(userId, {
      name,
      description,
      listType,
      isPublic,
      syncWatchStatus,
    });
    return NextResponse.json({ list: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating list:", error);
    return NextResponse.json(
      { error: "Failed to create list" },
      { status: 500 }
    );
  }
});
