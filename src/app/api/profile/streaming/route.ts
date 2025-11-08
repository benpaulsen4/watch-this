import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  users,
  userStreamingProviders,
  type NewUserStreamingProvider,
} from "@/lib/db/schema";
import {
  withAuth,
  handleApiError,
  type AuthenticatedRequest,
} from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";

// GET /api/profile/streaming - Fetch user's streaming preferences
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    // Fetch all saved providers for the user (across regions)
    const savedProviders = await db
      .select()
      .from(userStreamingProviders)
      .where(eq(userStreamingProviders.userId, userId));

    return NextResponse.json({
      country: request.user.country,
      providers: savedProviders.map((p) => ({
        id: p.providerId,
        name: p.providerName,
        logoPath: p.logoPath,
        region: p.region,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Fetch streaming preferences");
  }
});

// POST /api/profile/streaming - Update user's country and subscribed providers
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();

    const country: string | undefined = body.country;
    const region: string | undefined = body.region || country; // default region to country
    const providers:
      | Array<{
          providerId: number;
          providerName?: string;
          logoPath?: string | null;
        }>
      | undefined = body.providers;

    // Validate country format if provided
    if (country && !/^[A-Z]{2}$/i.test(country)) {
      return NextResponse.json(
        { error: "Invalid country code format. Expected 2-letter code." },
        { status: 400 },
      );
    }

    // Update user's country if provided
    if (country) {
      await db.update(users).set({ country }).where(eq(users.id, userId));
    }

    // Update provider subscriptions if provided
    if (providers) {
      if (!region || !/^[A-Z]{2}$/i.test(region)) {
        return NextResponse.json(
          { error: "Region is required and must be a 2-letter code." },
          { status: 400 },
        );
      }

      // Safety limits
      const trimmed = providers.slice(0, 50); // cap at 50

      // Remove existing providers for this user and region
      await db
        .delete(userStreamingProviders)
        .where(
          and(
            eq(userStreamingProviders.userId, userId),
            eq(userStreamingProviders.region, region.toUpperCase()),
          ),
        );

      // Insert new set
      if (trimmed.length > 0) {
        const rows: NewUserStreamingProvider[] = trimmed.map((p) => ({
          userId,
          providerId: p.providerId,
          providerName: p.providerName || null,
          logoPath: p.logoPath || null,
          region: region.toUpperCase(),
        }));

        await db.insert(userStreamingProviders).values(rows);
      }
    }

    // Return updated preferences
    const [userRow] = await db
      .select({ country: users.country })
      .from(users)
      .where(eq(users.id, userId));

    const savedProviders = await db
      .select()
      .from(userStreamingProviders)
      .where(eq(userStreamingProviders.userId, userId));

    return NextResponse.json({
      country: userRow?.country ?? null,
      providers: savedProviders.map((p) => ({
        id: p.providerId,
        name: p.providerName,
        logoPath: p.logoPath,
        region: p.region,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Update streaming preferences");
  }
});
