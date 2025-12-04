import { NextResponse } from "next/server";
import {
  ContentType,
  ContentTypeEnum,
  MovieWatchStatus,
  MovieWatchStatusEnum,
  TVWatchStatus,
  TVWatchStatusEnum,
} from "@/lib/db/schema";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import {
  getContentStatus,
  createOrUpdateContentStatus,
  updateContentStatus,
  deleteContentStatus,
} from "@/lib/content-status/service";
import type {
  CreateOrUpdateContentStatusInput,
  UpdateContentStatusInput,
} from "@/lib/content-status/types";

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
        { status: 400 },
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 },
      );
    }

    const result = await getContentStatus(
      userId,
      parseInt(tmdbId),
      contentType,
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Get content status");
  }
});

// POST /api/status/content - Create or update content watch status
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = (await request.json()) as CreateOrUpdateContentStatusInput;
    const { tmdbId, contentType, status } = body;

    // Validation
    if (!tmdbId || !contentType || !status) {
      return NextResponse.json(
        { error: "tmdbId, contentType, and status are required" },
        { status: 400 },
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 },
      );
    }

    // Validate status based on content type
    if (contentType === ContentType.MOVIE) {
      if (
        !Object.values(MovieWatchStatus).includes(
          status as MovieWatchStatusEnum,
        )
      ) {
        return NextResponse.json(
          { error: "Invalid movie status. Must be 'planning' or 'completed'" },
          { status: 400 },
        );
      }
    } else if (contentType === ContentType.TV) {
      if (!Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)) {
        return NextResponse.json(
          {
            error:
              "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
          },
          { status: 400 },
        );
      }
    }

    const result = await createOrUpdateContentStatus(userId, {
      tmdbId,
      contentType,
      status,
    });
    if (result === "notFound") {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Create/update content status");
  }
});

// PUT /api/status/content - Update existing content watch status
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = (await request.json()) as UpdateContentStatusInput;
    const { tmdbId, contentType, status } = body;

    // Validation
    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 },
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 },
      );
    }

    // Validate status if provided
    if (status) {
      if (contentType === ContentType.MOVIE) {
        if (
          !Object.values(MovieWatchStatus).includes(
            status as MovieWatchStatusEnum,
          )
        ) {
          return NextResponse.json(
            {
              error: "Invalid movie status. Must be 'planning' or 'completed'",
            },
            { status: 400 },
          );
        }
      } else if (contentType === ContentType.TV) {
        if (
          !Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
            },
            { status: 400 },
          );
        }
      }
    }

    const result = await updateContentStatus(userId, {
      tmdbId,
      contentType,
      status,
    });
    if (result === "notFound") {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
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
        { status: 400 },
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 },
      );
    }

    const result = await deleteContentStatus(
      userId,
      parseInt(tmdbId),
      contentType,
    );
    if (result === "notFound") {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Delete content status");
  }
});
