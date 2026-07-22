import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import {
  createSchedule,
  deleteSchedules,
  listSchedules,
} from "@/lib/schedules/service";
import { CreateScheduleInput } from "@/lib/schedules/types";

// GET /api/schedules - Get user's show schedules
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbIdParam = searchParams.get("tmdbId");
    const dayOfWeekParam = searchParams.get("dayOfWeek");

    let tmdbId: number | undefined;
    if (tmdbIdParam) {
      tmdbId = parseInt(tmdbIdParam, 10);
      if (Number.isNaN(tmdbId) || tmdbId <= 0) {
        return NextResponse.json(
          { error: "tmdbId must be a positive integer" },
          { status: 400 },
        );
      }
    }

    let dayOfWeek: number | undefined;
    if (dayOfWeekParam) {
      dayOfWeek = parseInt(dayOfWeekParam, 10);
      if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json(
          { error: "dayOfWeek must be a number between 0-6" },
          { status: 400 },
        );
      }
    }

    const response = await listSchedules(request.user.id, tmdbId, dayOfWeek);
    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, "Get show schedules");
  }
});

// POST /api/schedules - Add show to schedule
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = (await request.json()) as CreateScheduleInput;
    const { tmdbId, dayOfWeek } = body;

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

    const result = await createSchedule(request.user.id, { tmdbId, dayOfWeek });
    if (result === "notFound") {
      return NextResponse.json(
        {
          error:
            "TV show not found in your library. Add it to your library first.",
        },
        { status: 404 },
      );
    }
    if (result === "invalidStatus") {
      return NextResponse.json(
        {
          error:
            "Cannot schedule completed or dropped shows. Only shows that are planning, watching, or paused can be scheduled.",
        },
        { status: 400 },
      );
    }
    if (result === "duplicate") {
      return NextResponse.json(
        { error: "Show is already scheduled for this day" },
        { status: 409 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Add show to schedule");
  }
});

// DELETE /api/schedules - Remove show from schedule
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbIdParam = searchParams.get("tmdbId");
    const dayOfWeekParam = searchParams.get("dayOfWeek");

    if (!tmdbIdParam) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 },
      );
    }

    const tmdbId = parseInt(tmdbIdParam, 10);
    if (Number.isNaN(tmdbId) || tmdbId <= 0) {
      return NextResponse.json(
        { error: "tmdbId must be a positive integer" },
        { status: 400 },
      );
    }

    let dayOfWeek: number | undefined;
    if (dayOfWeekParam) {
      dayOfWeek = parseInt(dayOfWeekParam, 10);
      if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json(
          { error: "dayOfWeek must be a number between 0-6" },
          { status: 400 },
        );
      }
    }

    const result = await deleteSchedules(request.user.id, tmdbId, dayOfWeek);
    if (result === "notFound") {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Remove show from schedule");
  }
});
