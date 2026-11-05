import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  createListCollaboratorSchemas,
  listListCollaboratorsSchemas,
} from "@/lib/lists/schemas";
import {
  createListCollaborator,
  listListCollaborators,
} from "@/lib/lists/service";

// GET /api/lists/[id]/collaborators - Get all collaborators for a list
export const GET = authedRoute(
  listsApi.listListCollaborators,
  listListCollaboratorsSchemas,
  ({ user, params }) => listListCollaborators(user.id, params.id),
);

// POST /api/lists/[id]/collaborators - Add a new collaborator to a list
export const POST = authedRoute(
  listsApi.createListCollaborator,
  createListCollaboratorSchemas,
  ({ user, params, body }) =>
    createListCollaborator(user.id, params.id, body),
);
