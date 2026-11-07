import { defineContract, schemas, type } from "../api/contract";
import type { listActivityTimelineSchemas } from "./schemas";
import type { ActivityTimelineResponse } from "./types";

export const listActivityTimeline = defineContract({
  method: "GET",
  path: "/api/activity",
  label: "Get activity timeline",
  schemas: schemas<typeof listActivityTimelineSchemas>(),
  response: type<ActivityTimelineResponse>(),
  errors: { invalidCursor: { status: 400, message: "Invalid cursor" } },
});
