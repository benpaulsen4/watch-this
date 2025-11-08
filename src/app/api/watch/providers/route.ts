import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  type AuthenticatedRequest,
} from "@/lib/auth/api-middleware";

async function handler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region");

    if (!region) {
      return NextResponse.json(
        { error: "region query parameter is required" },
        { status: 400 },
      );
    }

    const [movieProviders, tvProviders] = await Promise.all([
      tmdbClient.getWatchProviders("movie", region),
      tmdbClient.getWatchProviders("tv", region),
    ]);

    // Merge and de-duplicate providers by provider_id
    const map = new Map<
      number,
      {
        provider_id: number;
        provider_name: string;
        logo_path: string | null;
        display_priority: number;
      }
    >();

    [...movieProviders.results, ...tvProviders.results].forEach((p) => {
      if (!map.has(p.provider_id)) {
        map.set(p.provider_id, p);
      }
    });

    return NextResponse.json({ results: Array.from(map.values()) });
  } catch (error) {
    return handleApiError(error, "Fetch watch providers for region");
  }
}

export const GET = withAuth(handler);
