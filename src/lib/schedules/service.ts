import { and, eq } from "drizzle-orm";

import { ContentType, db, showSchedules, userContentStatus } from "../db";
import { getAllCachedContent, getCachedContent } from "../tmdb/cache-utils";
import {
  CreateScheduleInput,
  DeleteSchedulesResponse,
  GetSchedulesResponse,
  ScheduleItem,
  SchedulesByDay,
} from "./types";

export async function listSchedules(
  userId: string,
  tmdbId?: number,
  dayOfWeek?: number
): Promise<GetSchedulesResponse> {
  const where = [eq(showSchedules.userId, userId)];
  if (tmdbId !== undefined) where.push(eq(showSchedules.tmdbId, tmdbId));
  if (dayOfWeek !== undefined)
    where.push(eq(showSchedules.dayOfWeek, dayOfWeek));

  const schedules = await db
    .select()
    .from(showSchedules)
    .where(and(...where))
    .orderBy(showSchedules.dayOfWeek, showSchedules.tmdbId);

  const schedulesByDay: SchedulesByDay = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };

  const titleResults = await getAllCachedContent(
    schedules.map((s) => ({
      tmdbId: s.tmdbId,
      contentType: ContentType.TV,
    })),
    userId
  );
  const titleMap = new Map<number, string | null>();
  titleResults.forEach((r) => titleMap.set(r.tmdbId, r.title));

  schedules.forEach((s) => {
    const item: ScheduleItem = {
      id: s.id,
      tmdbId: s.tmdbId,
      createdAt: s.createdAt.toISOString(),
      title: titleMap.get(s.tmdbId) ?? null,
    };
    schedulesByDay[s.dayOfWeek].push(item);
  });

  return { schedules: schedulesByDay, totalShows: schedules.length };
}

export async function createSchedule(
  userId: string,
  input: CreateScheduleInput
): Promise<ScheduleItem | "notFound" | "invalidStatus" | "duplicate"> {
  const { tmdbId, dayOfWeek } = input;

  const contentStatus = await db
    .select()
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, "tv")
      )
    )
    .limit(1);
  if (contentStatus.length === 0) return "notFound";

  const status = contentStatus[0].status;
  if (status === "completed" || status === "dropped") return "invalidStatus";

  const existing = await db
    .select()
    .from(showSchedules)
    .where(
      and(
        eq(showSchedules.userId, userId),
        eq(showSchedules.tmdbId, tmdbId),
        eq(showSchedules.dayOfWeek, dayOfWeek)
      )
    )
    .limit(1);
  if (existing.length > 0) return "duplicate";

  const [created] = await db
    .insert(showSchedules)
    .values({ userId, tmdbId, dayOfWeek })
    .returning();

  const details = await getCachedContent(tmdbId, ContentType.TV, userId);

  return {
    id: created.id,
    tmdbId: created.tmdbId,
    createdAt: created.createdAt.toISOString(),
    title: details.title,
  };
}

export async function deleteSchedules(
  userId: string,
  tmdbId: number,
  dayOfWeek?: number
): Promise<DeleteSchedulesResponse | "notFound"> {
  let where = and(
    eq(showSchedules.userId, userId),
    eq(showSchedules.tmdbId, tmdbId)
  );
  if (dayOfWeek !== undefined) {
    where = and(where, eq(showSchedules.dayOfWeek, dayOfWeek));
  }

  const deleted = await db.delete(showSchedules).where(where).returning();
  if (deleted.length === 0) return "notFound";

  return {
    message: `Removed ${deleted.length} schedule(s)`,
    deletedSchedules: deleted.map((d) => ({
      id: d.id,
      tmdbId: d.tmdbId,
      dayOfWeek: d.dayOfWeek,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}
