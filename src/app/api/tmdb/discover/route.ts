import { NextRequest, NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import { getCurrentUser } from "@/lib/auth/webauthn";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    // TODO get the user and auth status from middleware state
    const sessionToken = request.cookies.get("session")?.value;
    const user = await getCurrentUser(sessionToken);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "movie" | "tv";
    const page = parseInt(searchParams.get("page") || "1");
    const genre = searchParams.get("genre");
    const year = searchParams.get("year");
    const sortBy = searchParams.get("sort_by");

    if (!type || !["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 }
      );
    }

    if (page < 1 || page > 1000) {
      return NextResponse.json(
        { error: "Page must be between 1 and 1000" },
        { status: 400 }
      );
    }

    const params: {
      page?: number;
      genre?: number;
      year?: number;
      sortBy?: string;
    } = {
      page,
    };

    if (genre) {
      const genreId = parseInt(genre);
      if (!isNaN(genreId) && genreId > 0) {
        params.genre = genreId;
      }
    }

    if (year) {
      const yearNum = parseInt(year);
      if (
        !isNaN(yearNum) &&
        yearNum >= 1900 &&
        yearNum <= new Date().getFullYear() + 5
      ) {
        params.year = yearNum;
      }
    }

    if (sortBy) {
      const validSortOptions = [
        "popularity.desc",
        "popularity.asc",
        "vote_average.desc",
        "vote_average.asc",
        "release_date.desc",
        "release_date.asc",
        "first_air_date.desc",
        "first_air_date.asc",
      ];

      if (validSortOptions.includes(sortBy)) {
        params.sortBy = sortBy;
      }
    }

    let results;

    if (type === "movie") {
      results = await tmdbClient.discoverMovies(params);
    } else {
      results = await tmdbClient.discoverTVShows(params);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("TMDB discover error:", error);

    if (error instanceof Error && error.message.includes("TMDB API error")) {
      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to discover content" },
      { status: 500 }
    );
  }
}
