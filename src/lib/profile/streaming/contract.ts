import { defineContract, schemas, type } from "../../api/contract";
import type { updateStreamingPreferencesSchemas } from "./schemas";
import type { StreamingPreferences } from "./types";

export const getStreamingPreferences = defineContract({
  method: "GET",
  path: "/api/profile/streaming",
  label: "Fetch streaming preferences",
  response: type<StreamingPreferences>(),
  errors: {
    dbError: { status: 500, message: "Fetch streaming preferences failed" },
  },
});

export const updateStreamingPreferences = defineContract({
  method: "POST",
  path: "/api/profile/streaming",
  label: "Update streaming preferences",
  schemas: schemas<typeof updateStreamingPreferencesSchemas>(),
  response: type<StreamingPreferences>(),
  errors: {
    invalidRegion: {
      status: 400,
      message: "Region is required and must be a 2-letter code.",
    },
    dbError: { status: 500, message: "Update streaming preferences failed" },
  },
});
