import { authedRoute } from "@/lib/api/route";
import * as contentStatusApi from "@/lib/content-status/contract";
import {
  createOrUpdateContentStatusSchemas,
  deleteContentStatusSchemas,
  getContentStatusSchemas,
  updateContentStatusSchemas,
} from "@/lib/content-status/schemas";
import {
  createOrUpdateContentStatus,
  deleteContentStatus,
  getContentStatus,
  updateContentStatus,
} from "@/lib/content-status/service";

// GET /api/status/content - Get content watch status for authenticated user
export const GET = authedRoute(
  contentStatusApi.getContentStatus,
  getContentStatusSchemas,
  ({ user, query }) =>
    getContentStatus(user.id, query.tmdbId, query.contentType),
);

// POST /api/status/content - Create or update content watch status
export const POST = authedRoute(
  contentStatusApi.createOrUpdateContentStatus,
  createOrUpdateContentStatusSchemas,
  ({ user, body }) => createOrUpdateContentStatus(user.id, body),
);

// PUT /api/status/content - Update existing content watch status
export const PUT = authedRoute(
  contentStatusApi.updateContentStatus,
  updateContentStatusSchemas,
  ({ user, body }) => updateContentStatus(user.id, body),
);

// DELETE /api/status/content - Remove content watch status
export const DELETE = authedRoute(
  contentStatusApi.deleteContentStatus,
  deleteContentStatusSchemas,
  ({ user, query }) =>
    deleteContentStatus(user.id, query.tmdbId, query.contentType),
);
