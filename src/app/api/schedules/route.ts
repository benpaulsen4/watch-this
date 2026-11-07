import { authedRoute } from "@/lib/api/route";
import {
  addSchedule,
  getSchedules,
  removeSchedules,
} from "@/lib/schedules/contract";
import {
  addScheduleSchemas,
  getSchedulesSchemas,
  removeSchedulesSchemas,
} from "@/lib/schedules/schemas";
import {
  createSchedule,
  deleteSchedules,
  listSchedules,
} from "@/lib/schedules/service";

// GET /api/schedules - Get user's show schedules
export const GET = authedRoute(
  getSchedules,
  getSchedulesSchemas,
  ({ user, query }) => listSchedules(user.id, query.tmdbId, query.dayOfWeek),
);

// POST /api/schedules - Add show to schedule
export const POST = authedRoute(
  addSchedule,
  addScheduleSchemas,
  ({ user, body }) => createSchedule(user.id, body),
);

// DELETE /api/schedules - Remove show from schedule
export const DELETE = authedRoute(
  removeSchedules,
  removeSchedulesSchemas,
  ({ user, query }) => deleteSchedules(user.id, query.tmdbId, query.dayOfWeek),
);
