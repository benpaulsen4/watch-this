import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import {
  tmdbClient,
  TMDBMovieCastMember,
  TMDBTVAggregateCastMember,
} from "@/lib/tmdb/client";

async function handler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const idParam = searchParams.get("id");
    if (!type || (type !== "movie" && type !== "tv")) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!idParam) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const id = Number(idParam);
    if (Number.isNaN(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    if (type === "movie") {
      const credits = await tmdbClient.getMovieCredits(id);
      const cast = (credits.cast as TMDBMovieCastMember[]).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
      }));
      return NextResponse.json({ cast });
    }

    const credits = await tmdbClient.getTVAggregateCredits(id);
    const cast = (credits.cast as TMDBTVAggregateCastMember[]).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.roles?.[0]?.character ?? null,
      profile_path: c.profile_path,
    }));
    return NextResponse.json({ cast });
  } catch (error) {
    return handleApiError(error, "tmdb/credits");
  }
}

export const GET = withAuth(handler);
