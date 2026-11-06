import { authedRoute } from "@/lib/api/route";
import * as streamingApi from "@/lib/profile/streaming/contract";
import { updateStreamingPreferencesSchemas } from "@/lib/profile/streaming/schemas";
import {
  getStreamingPreferences,
  updateStreamingPreferences,
} from "@/lib/profile/streaming/service";

// GET /api/profile/streaming - Fetch user's streaming preferences
export const GET = authedRoute(
  streamingApi.getStreamingPreferences,
  {},
  ({ user }) => getStreamingPreferences(user.id),
);

// POST /api/profile/streaming - Update user's country and subscribed providers
export const POST = authedRoute(
  streamingApi.updateStreamingPreferences,
  updateStreamingPreferencesSchemas,
  ({ user, body }) => updateStreamingPreferences(user.id, body),
);
