import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, max } from "drizzle-orm";
import { asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { tmdbClient } from "@/lib/tmdb/client";

// POST /api/lists/[id]/items - Add item to list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/')[3]; // /api/lists/[id]/items
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { tmdbId, contentType, title, posterPath, notes } = body;

    // Validate required fields
    if (!tmdbId || !contentType || !title) {
      return NextResponse.json(
        { error: 'tmdbId, contentType, and title are required' },
        { status: 400 }
      );
    }

    // Validate contentType
    if (!['movie', 'tv'].includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be either "movie" or "tv"' },
        { status: 400 }
      );
    }

    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({ ownerId: lists.ownerId, listType: lists.listType })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found" },
        { status: 404 }
      );
    }

    // For now, only allow list owners to add items
    // TODO: Add collaborator permission checking
    if (listData.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can add items" },
        { status: 403 }
      );
    }

    // Check if item already exists in the list
    const [existingItem] = await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(
        and(
          eq(listItems.listId, listId),
          eq(listItems.tmdbId, tmdbId),
          eq(listItems.contentType, contentType)
        )
      )
      .limit(1);

    if (existingItem) {
      return NextResponse.json(
        { error: "This item is already in the list" },
        { status: 409 }
      );
    }

    // Get the next sort order
    const [maxSortResult] = await db
      .select({ maxSort: max(listItems.sortOrder) })
      .from(listItems)
      .where(eq(listItems.listId, listId));

    const nextSortOrder = (maxSortResult?.maxSort || 0) + 1;

    // Create the new list item
    const [newItem] = await db
      .insert(listItems)
      .values({
        id: uuidv4(),
        listId,
        tmdbId: Number(tmdbId),
        contentType,
        title: title.trim(),
        posterPath: posterPath || null,
        notes: notes?.trim() || null,
        sortOrder: nextSortOrder,
        addedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error("Error adding item to list:", error);
    return NextResponse.json(
      { error: "Failed to add item to list" },
      { status: 500 }
    );
  }
});

// GET /api/lists/[id]/items - Get all items in a list with complete TMDB data
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/')[3]; // /api/lists/[id]/items
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    // Check if user has access to this list
    const [listData] = await db
      .select({ ownerId: lists.ownerId, isPublic: lists.isPublic })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found" },
        { status: 404 }
      );
    }

    // Check access permissions
    if (!listData.isPublic && listData.ownerId !== userId) {
      // TODO: Add collaborator permission checking
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get all items in the list
    const items = await db
      .select({
        id: listItems.id,
        tmdbId: listItems.tmdbId,
        contentType: listItems.contentType,
        title: listItems.title,
        posterPath: listItems.posterPath,
        notes: listItems.notes,
        addedAt: listItems.addedAt,
        sortOrder: listItems.sortOrder,
      })
      .from(listItems)
      .where(eq(listItems.listId, listId))
      .orderBy(asc(listItems.sortOrder), asc(listItems.addedAt));

    // Fetch complete TMDB data for each item
    const enrichedItems = await Promise.allSettled(
      items.map(async (item) => {
        try {
          let tmdbData;
          if (item.contentType === 'movie') {
            tmdbData = await tmdbClient.getMovieDetails(item.tmdbId);
          } else {
            tmdbData = await tmdbClient.getTVShowDetails(item.tmdbId);
          }

          // Merge list item data with TMDB data
          return {
            ...tmdbData,
            // Override with list-specific data
            listItemId: item.id,
            addedAt: item.addedAt,
            notes: item.notes,
            sortOrder: item.sortOrder,
          };
        } catch (error: unknown) {
          console.error(`Failed to fetch TMDB data for item ${item.id}:`, error);
          // Fallback to basic data if TMDB fetch fails
          return {
            id: item.tmdbId,
            title: item.contentType === 'movie' ? item.title : undefined,
            name: item.contentType === 'tv' ? item.title : undefined,
            poster_path: item.posterPath,
            vote_average: 0,
            vote_count: 0,
            overview: item.notes || '',
            release_date: item.contentType === 'movie' ? '' : undefined,
            first_air_date: item.contentType === 'tv' ? '' : undefined,
            genre_ids: [],
            adult: false,
            backdrop_path: null,
            original_language: 'en',
            original_title: item.contentType === 'movie' ? item.title : undefined,
            original_name: item.contentType === 'tv' ? item.title : undefined,
            popularity: 0,
            video: item.contentType === 'movie' ? false : undefined,
            origin_country: item.contentType === 'tv' ? [] : undefined,
            // List-specific data
            listItemId: item.id,
            addedAt: item.addedAt,
            notes: item.notes,
            sortOrder: item.sortOrder,
          };
        }
      })
    );

    // Filter out failed requests and extract successful results
    const successfulItems = enrichedItems
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<unknown>).value);

    return NextResponse.json({ items: successfulItems });
  } catch (error) {
    console.error("Error fetching list items:", error);
    return NextResponse.json(
      { error: "Failed to fetch list items" },
      { status: 500 }
    );
  }
});

// DELETE /api/lists/[id]/items - Remove item from list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/')[3]; // /api/lists/[id]/items
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { listItemId } = body;

    if (!listItemId) {
      return NextResponse.json(
        { error: 'listItemId is required' },
        { status: 400 }
      );
    }

    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found" },
        { status: 404 }
      );
    }

    // For now, only allow list owners to remove items
    // TODO: Add collaborator permission checking
    if (listData.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can remove items" },
        { status: 403 }
      );
    }

    // Check if the item exists and belongs to this list
    const [existingItem] = await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(
        and(
          eq(listItems.id, listItemId),
          eq(listItems.listId, listId)
        )
      )
      .limit(1);

    if (!existingItem) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 }
      );
    }

    // Delete the item
    await db
      .delete(listItems)
      .where(
        and(
          eq(listItems.id, listItemId),
          eq(listItems.listId, listId)
        )
      );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error removing item from list:", error);
    return NextResponse.json(
      { error: "Failed to remove item from list" },
      { status: 500 }
    );
  }
});