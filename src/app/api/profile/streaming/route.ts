import { NextResponse } from "next/server";
import {
  withAuth,
  handleApiError,
  type AuthenticatedRequest,
} from "@/lib/auth/api-middleware";
import {
  getStreamingPreferences,
  updateStreamingPreferences,
} from "@/lib/profile/streaming/service";

// GET /api/profile/streaming - Fetch user's streaming preferences
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const result = await getStreamingPreferences(request.user.id);
    if (result === "dbError") {
      return NextResponse.json(
        { error: "Fetch streaming preferences failed" },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Fetch streaming preferences");
  }
});

// POST /api/profile/streaming - Update user's country and subscribed providers
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const country: string | undefined = body.country;
    const region: string | undefined = body.region || country;
    const providers:
      | Array<{
          providerId: number;
          providerName?: string;
          logoPath?: string | null;
        }>
      | undefined = body.providers;

    if (country && !/^[A-Z]{2}$/i.test(country)) {
      return NextResponse.json(
        { error: "Invalid country code format. Expected 2-letter code." },
        { status: 400 }
      );
    }
    if (providers && (!region || !/^[A-Z]{2}$/i.test(region))) {
      return NextResponse.json(
        { error: "Region is required and must be a 2-letter code." },
        { status: 400 }
      );
    }

    const result = await updateStreamingPreferences(request.user.id, {
      country,
      region,
      providers,
    });
    if (result === "invalidRegion") {
      return NextResponse.json(
        { error: "Region is required and must be a 2-letter code." },
        { status: 400 }
      );
    }
    if (result === "dbError") {
      return NextResponse.json(
        { error: "Update streaming preferences failed" },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Update streaming preferences");
  }
});
