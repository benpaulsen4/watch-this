import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  deleteListCollaboratorSchemas,
  updateListCollaboratorSchemas,
} from "@/lib/lists/schemas";
import {
  deleteListCollaborator,
  updateListCollaborator,
} from "@/lib/lists/service";

// PUT /api/lists/[id]/collaborators/[userId] - Update collaborator permissions
export const PUT = authedRoute(
  listsApi.updateListCollaborator,
  updateListCollaboratorSchemas,
  ({ user, params, body }) =>
    updateListCollaborator(user.id, params.id, params.userId, body),
);

// DELETE /api/lists/[id]/collaborators/[userId] - Remove a collaborator from a list
export const DELETE = authedRoute(
  listsApi.deleteListCollaborator,
  deleteListCollaboratorSchemas,
  ({ user, params }) =>
    deleteListCollaborator(user.id, params.id, params.userId),
);
