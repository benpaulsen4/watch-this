import * as activityApi from "@/lib/activity/contract";
import { listActivityTimelineSchemas } from "@/lib/activity/schemas";
import { listActivityTimeline } from "@/lib/activity/service";
import { authedRoute } from "@/lib/api/route";

// GET /api/activity - Get paginated activity timeline
export const GET = authedRoute(
  activityApi.listActivityTimeline,
  listActivityTimelineSchemas,
  ({ user, query }) =>
    listActivityTimeline(user.id, user.timezone, query),
);
