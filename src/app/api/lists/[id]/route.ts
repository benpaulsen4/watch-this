import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators, users } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or, count, asc } from "drizzle-orm";
import { tmdbClient } from "@/lib/tmdb/client";



// GET /api/lists/[id] - Get a specific list
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/').pop();
    
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
        name: lists.name,
        description: lists.description,
        listType: lists.listType,
        isPublic: lists.isPublic,
        ownerId: lists.ownerId,
        ownerUsername: users.username,
        ownerProfilePictureUrl: users.profilePictureUrl,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .innerJoin(users, eq(users.id, lists.ownerId))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.id, listId),
          or(
            eq(lists.ownerId, userId),
            eq(listCollaborators.userId, userId),
            eq(lists.isPublic, true)
          )
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }

    // Get basic list items and collaborator count
    const [basicItems, collaboratorCountResult] = await Promise.all([
      db
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
        .orderBy(asc(listItems.sortOrder), asc(listItems.addedAt)),
      db
        .select({ count: count() })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, listId))
    ]);

    // Fetch complete TMDB data for each item
    const enrichedItems = await Promise.allSettled(
      basicItems.map(async (item) => {
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
    const items = enrichedItems
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<unknown>).value);

    const listWithItems = {
      ...listData,
      items: items || [],
      collaborators: collaboratorCountResult[0]?.count || 0,
    };

    return NextResponse.json(listWithItems);
  } catch (error) {
    console.error("Error fetching list:", error);
    return NextResponse.json(
      { error: "Failed to fetch list" },
      { status: 500 }
    );
  }
});

// PUT /api/lists/[id] - Update a list
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/').pop();
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    const { name, description, listType, isPublic } = body;

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId })
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
        { error: "Only the list owner can update this list" },
        { status: 403 }
      );
    }

    // Validate input
    if (name !== undefined) {
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
    }

    if (listType !== undefined) {
      const validListTypes = ["movies", "tv", "mixed"];
      if (!validListTypes.includes(listType)) {
        return NextResponse.json(
          { error: "Invalid list type. Must be 'movies', 'tv', or 'mixed'" },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Partial<typeof lists.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (listType !== undefined) updateData.listType = listType;
    if (isPublic !== undefined) updateData.isPublic = Boolean(isPublic);

    // Update the list
    const [updatedList] = await db
      .update(lists)
      .set(updateData)
      .where(eq(lists.id, listId))
      .returning();

    // Get counts for the response
    const [itemCountResult, collaboratorCountResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(listItems)
        .where(eq(listItems.listId, listId)),
      db
        .select({ count: count() })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, listId))
    ]);

    const listWithCounts = {
      ...updatedList,
      itemCount: itemCountResult[0]?.count || 0,
      collaborators: collaboratorCountResult[0]?.count || 0,
    };

    return NextResponse.json({ list: listWithCounts });
  } catch (error) {
    console.error("Error updating list:", error);
    return NextResponse.json(
      { error: "Failed to update list" },
      { status: 500 }
    );
  }
});

// DELETE /api/lists/[id] - Delete a list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split('/').pop();
    
    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId })
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
        { error: "Only the list owner can delete this list" },
        { status: 403 }
      );
    }

    // Delete the list (cascade will handle related records)
    await db.delete(lists).where(eq(lists.id, listId));

    return NextResponse.json({ message: "List deleted successfully" });
  } catch (error) {
    console.error("Error deleting list:", error);
    return NextResponse.json(
      { error: "Failed to delete list" },
      { status: 500 }
    );
  }
});