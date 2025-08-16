import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userContentStatus, ContentType, ContentTypeEnum, MovieWatchStatus, MovieWatchStatusEnum, TVWatchStatus, TVWatchStatusEnum } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest, handleApiError } from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";

// GET /api/status/content - Get content watch status for authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const contentType = searchParams.get("contentType");

    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    const status = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    return NextResponse.json({ 
      status: status[0] || null 
    });
  } catch (error) {
    return handleApiError(error, "Get content status");
  }
});

// POST /api/status/content - Create or update content watch status
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json() as {
      tmdbId: number;
      contentType: string;
      status: string;
      shareStatusUpdates?: boolean;
    };
    const { tmdbId, contentType, status, shareStatusUpdates = true } = body;

    // Validation
    if (!tmdbId || !contentType || !status) {
      return NextResponse.json(
        { error: "tmdbId, contentType, and status are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Validate status based on content type
    if (contentType === ContentType.MOVIE) {
      if (!Object.values(MovieWatchStatus).includes(status as MovieWatchStatusEnum)) {
        return NextResponse.json(
          { error: "Invalid movie status. Must be 'planning' or 'completed'" },
          { status: 400 }
        );
      }
    } else if (contentType === ContentType.TV) {
      if (!Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)) {
        return NextResponse.json(
          { error: "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'" },
          { status: 400 }
        );
      }
    }

    // Check if status already exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    let result;
    if (existingStatus.length > 0) {
      // Update existing status
      [result] = await db
        .update(userContentStatus)
        .set({
          status,
          shareStatusUpdates,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, contentType)
          )
        )
        .returning();
    } else {
      // Create new status
      [result] = await db
        .insert(userContentStatus)
        .values({
          userId,
          tmdbId,
          contentType,
          status,
          shareStatusUpdates,
        })
        .returning();
    }

    return NextResponse.json({ status: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Create/update content status");
  }
});

// PUT /api/status/content - Update existing content watch status
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json() as {
      tmdbId: number;
      contentType: string;
      status?: string;
      shareStatusUpdates?: boolean;
    };
    const { tmdbId, contentType, status, shareStatusUpdates } = body;

    // Validation
    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status) {
      if (contentType === ContentType.MOVIE) {
        if (!Object.values(MovieWatchStatus).includes(status as MovieWatchStatusEnum)) {
          return NextResponse.json(
            { error: "Invalid movie status. Must be 'planning' or 'completed'" },
            { status: 400 }
          );
        }
      } else if (contentType === ContentType.TV) {
        if (!Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)) {
          return NextResponse.json(
            { error: "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'" },
            { status: 400 }
          );
        }
      }
    }

    // Check if status exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    if (existingStatus.length === 0) {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: {
      updatedAt: Date;
      status?: string;
      shareStatusUpdates?: boolean;
    } = {
      updatedAt: new Date(),
    };
    
    if (status !== undefined) updateData.status = status;
    if (shareStatusUpdates !== undefined) updateData.shareStatusUpdates = shareStatusUpdates;

    const [result] = await db
      .update(userContentStatus)
      .set(updateData)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .returning();

    return NextResponse.json({ status: result });
  } catch (error) {
    return handleApiError(error, "Update content status");
  }
});

// DELETE /api/status/content - Remove content watch status
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const contentType = searchParams.get("contentType");

    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Check if status exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    if (existingStatus.length === 0) {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 }
      );
    }

    await db
      .delete(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      );

    return NextResponse.json({ message: "Content status removed successfully" });
  } catch (error) {
    return handleApiError(error, "Delete content status");
  }
});