import { defineContract, schemas, type } from "../api/contract";
import type {
  completeStorySchemas,
  dismissSeriesFinaleSchemas,
  getOrGenerateSnapshotSchemas,
} from "./schemas";
import type { SeriesFinalePayload, SeriesFinaleSnapshotSummary } from "./types";

const PERIOD_NOT_AVAILABLE = { status: 404, message: "Period not available" };

export const listAvailableSnapshots = defineContract({
  method: "GET",
  path: "/api/series-finale",
  label: "Series Finale list",
  response: type<{ periods: SeriesFinaleSnapshotSummary[] }>(),
});

export const getOrGenerateSnapshot = defineContract({
  method: "GET",
  path: "/api/series-finale/[period]",
  label: "Series Finale payload",
  schemas: schemas<typeof getOrGenerateSnapshotSchemas>(),
  response: type<{
    payload: SeriesFinalePayload;
    storyCompletedAt: Date | null;
  }>(),
  errors: { notFound: PERIOD_NOT_AVAILABLE },
});

export const dismissSeriesFinale = defineContract({
  method: "POST",
  path: "/api/series-finale/[period]/dismiss",
  label: "Series Finale dismiss",
  schemas: schemas<typeof dismissSeriesFinaleSchemas>(),
  response: type<{ success: true }>(),
});

export const completeStory = defineContract({
  method: "POST",
  path: "/api/series-finale/[period]/story-complete",
  label: "Series Finale story complete",
  schemas: schemas<typeof completeStorySchemas>(),
  response: type<{ success: true }>(),
  errors: { notFound: PERIOD_NOT_AVAILABLE },
});
