import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { markNextEpisodeWatched } from "@/lib/episodes/service";

// POST /api/status/episodes/next - Mark the next available episode as watched
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId } = body;

    // Validation
    if (!tmdbId || typeof tmdbId !== "number") {
      return NextResponse.json(
        { error: "tmdbId is required and must be a number" },
        { status: 400 },
      );
    }

    const result = await markNextEpisodeWatched(userId, tmdbId);
    if (result === "notFound") {
      return NextResponse.json({ error: "TV show not found" }, { status: 404 });
    }
    if (result === "noNextEpisode") {
      return NextResponse.json(
        { error: "No next episode available. You're all caught up!" },
        { status: 400 },
      );
    }
    if (result === "notAired") {
      return NextResponse.json(
        { error: "Next episode hasn't aired yet." },
        { status: 400 },
      );
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Mark next episode as watched");
  }
});
