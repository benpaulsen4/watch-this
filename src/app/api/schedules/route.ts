import { NextResponse } from "next/server";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { showSchedules, userContentStatus } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { tmdbClient } from "@/lib/tmdb/client";

// GET /api/schedules - Get user's show schedules
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const dayOfWeek = searchParams.get("dayOfWeek");

    const whereConditions = [eq(showSchedules.userId, request.user.id)];

    // Filter by specific show if tmdbId provided
    if (tmdbId) {
      whereConditions.push(eq(showSchedules.tmdbId, parseInt(tmdbId)));
    }

    // Filter by specific day if dayOfWeek provided
    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      whereConditions.push(eq(showSchedules.dayOfWeek, parseInt(dayOfWeek)));
    }

    const schedules = await db
      .select()
      .from(showSchedules)
      .where(and(...whereConditions))
      .orderBy(showSchedules.dayOfWeek, showSchedules.tmdbId);

    // Group schedules by day of week for easier consumption
    const schedulesByDay: Record<
      number,
      Array<{
        tmdbId: number;
        id: string;
        createdAt: Date;
        title: string | null;
      }>
    > = {};

    for (let day = 0; day <= 6; day++) {
      schedulesByDay[day] = [];
    }

    // Resolve show titles in parallel, but avoid failing entire response if one fails
    const titleResults = await Promise.all(
      schedules.map(async (schedule) => {
        try {
          const details = await tmdbClient.getTVShowDetails(schedule.tmdbId);
          return { tmdbId: schedule.tmdbId, title: details?.name ?? null };
        } catch {
          return { tmdbId: schedule.tmdbId, title: null };
        }
      }),
    );
    const titleMap = new Map<number, string | null>();
    titleResults.forEach((r) => titleMap.set(r.tmdbId, r.title));

    schedules.forEach((schedule) => {
      schedulesByDay[schedule.dayOfWeek].push({
        tmdbId: schedule.tmdbId,
        id: schedule.id,
        createdAt: schedule.createdAt,
        title: titleMap.get(schedule.tmdbId) ?? null,
      });
    });

    return NextResponse.json({
      schedules: schedulesByDay,
      totalShows: schedules.length,
    });
  } catch (error) {
    return handleApiError(error, "Get show schedules");
  }
});

// POST /api/schedules - Add show to schedule
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const { tmdbId, dayOfWeek } = body;

    // Validation
    if (!tmdbId || typeof tmdbId !== "number") {
      return NextResponse.json(
        { error: "tmdbId is required and must be a number" },
        { status: 400 },
      );
    }

    if (
      dayOfWeek === null ||
      dayOfWeek === undefined ||
      typeof dayOfWeek !== "number" ||
      dayOfWeek < 0 ||
      dayOfWeek > 6
    ) {
      return NextResponse.json(
        { error: "dayOfWeek is required and must be a number between 0-6" },
        { status: 400 },
      );
    }

    // Check if the show exists in user's content status and is a TV show
    const contentStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, request.user.id),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, "tv"),
        ),
      )
      .limit(1);

    if (contentStatus.length === 0) {
      return NextResponse.json(
        {
          error:
            "TV show not found in your library. Add it to your library first.",
        },
        { status: 404 },
      );
    }

    // Check if show is in a valid state for scheduling (not completed or dropped)
    const status = contentStatus[0].status;
    if (status === "completed" || status === "dropped") {
      return NextResponse.json(
        {
          error: `Cannot schedule ${status} shows. Only shows that are planning, watching, or paused can be scheduled.`,
        },
        { status: 400 },
      );
    }

    // Check if schedule already exists
    const existingSchedule = await db
      .select()
      .from(showSchedules)
      .where(
        and(
          eq(showSchedules.userId, request.user.id),
          eq(showSchedules.tmdbId, tmdbId),
          eq(showSchedules.dayOfWeek, dayOfWeek),
        ),
      )
      .limit(1);

    if (existingSchedule.length > 0) {
      return NextResponse.json(
        { error: "Show is already scheduled for this day" },
        { status: 409 },
      );
    }

    // Create new schedule
    const [newSchedule] = await db
      .insert(showSchedules)
      .values({
        userId: request.user.id,
        tmdbId,
        dayOfWeek,
      })
      .returning();

    return NextResponse.json(newSchedule, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Add show to schedule");
  }
});

// DELETE /api/schedules - Remove show from schedule
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const dayOfWeek = searchParams.get("dayOfWeek");

    // Validation
    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 },
      );
    }

    let whereConditions = and(
      eq(showSchedules.userId, request.user.id),
      eq(showSchedules.tmdbId, parseInt(tmdbId)),
    );

    // If dayOfWeek is provided, remove only that specific day
    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      whereConditions = and(
        whereConditions,
        eq(showSchedules.dayOfWeek, parseInt(dayOfWeek)),
      );
    }

    const deletedSchedules = await db
      .delete(showSchedules)
      .where(whereConditions)
      .returning();

    if (deletedSchedules.length === 0) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: `Removed ${deletedSchedules.length} schedule(s)`,
      deletedSchedules,
    });
  } catch (error) {
    return handleApiError(error, "Remove show from schedule");
  }
});
