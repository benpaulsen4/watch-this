import { defineContract, schemas, type } from "../api/contract";
import type {
  createListCollaboratorSchemas,
  createListItemSchemas,
  createListSchemas,
  deleteListCollaboratorSchemas,
  deleteListItemSchemas,
  deleteListSchemas,
  getListItemsSchemas,
  getListSchemas,
  listContentListsSchemas,
  listListCollaboratorsSchemas,
  updateListCollaboratorSchemas,
  updateListSchemas,
} from "./schemas";
import type {
  ContentListEntry,
  DeleteResponse,
  GetListItemsResponse,
  GetListResponse,
  ListCollaboratorsResponse,
  ListItemRow,
  ListListsResponse,
  UpdateCollaboratorsResponse,
} from "./types";

const LIST_NOT_FOUND = { status: 404, message: "List not found" };

export const listLists = defineContract({
  method: "GET",
  path: "/api/lists",
  label: "Get lists",
  response: type<{ lists: ListListsResponse[] }>(),
});

export const listArchivedLists = defineContract({
  method: "GET",
  path: "/api/lists/archived",
  label: "Get archived lists",
  response: type<{ lists: ListListsResponse[] }>(),
});

export const getList = defineContract({
  method: "GET",
  path: "/api/lists/[id]",
  label: "Get list",
  schemas: schemas<typeof getListSchemas>(),
  response: type<GetListResponse>(),
  errors: { notFound: LIST_NOT_FOUND },
});

export const createList = defineContract({
  method: "POST",
  path: "/api/lists",
  label: "Create list",
  status: 201,
  schemas: schemas<typeof createListSchemas>(),
  response: type<{ list: ListListsResponse }>(),
});

export const updateList = defineContract({
  method: "PUT",
  path: "/api/lists/[id]",
  label: "Update list",
  schemas: schemas<typeof updateListSchemas>(),
  response: type<{ list: ListListsResponse }>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can update this list",
    },
  },
});

export const deleteList = defineContract({
  method: "DELETE",
  path: "/api/lists/[id]",
  label: "Delete list",
  schemas: schemas<typeof deleteListSchemas>(),
  response: type<DeleteResponse>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can delete this list",
    },
  },
});

export const getListItems = defineContract({
  method: "GET",
  path: "/api/lists/[id]/items",
  label: "Get list items",
  schemas: schemas<typeof getListItemsSchemas>(),
  response: type<GetListItemsResponse>(),
  errors: { notFound: LIST_NOT_FOUND },
});

export const createListItem = defineContract({
  method: "POST",
  path: "/api/lists/[id]/items",
  label: "Add item to list",
  status: 201,
  schemas: schemas<typeof createListItemSchemas>(),
  response: type<{ item: ListItemRow }>(),
  errors: {
    notFound: { status: 404, message: "List not found or access denied" },
    invalidType: { status: 400, message: "Invalid content type for list" },
    conflict: { status: 409, message: "This item is already in the list" },
  },
});

export const deleteListItem = defineContract({
  method: "DELETE",
  path: "/api/lists/[id]/items/[itemId]",
  label: "Remove item from list",
  schemas: schemas<typeof deleteListItemSchemas>(),
  response: type<DeleteResponse>(),
  errors: {
    notFound: { status: 404, message: "Item or list not found" },
  },
});

export const listContentLists = defineContract({
  method: "GET",
  path: "/api/content/[id]/lists",
  label: "Get lists containing content",
  schemas: schemas<typeof listContentListsSchemas>(),
  response: type<ContentListEntry[]>(),
});

export const listListCollaborators = defineContract({
  method: "GET",
  path: "/api/lists/[id]/collaborators",
  label: "Get collaborators",
  schemas: schemas<typeof listListCollaboratorsSchemas>(),
  response: type<ListCollaboratorsResponse>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can view collaborators",
    },
  },
});

export const createListCollaborator = defineContract({
  method: "POST",
  path: "/api/lists/[id]/collaborators",
  label: "Add collaborator",
  schemas: schemas<typeof createListCollaboratorSchemas>(),
  response: type<UpdateCollaboratorsResponse>(),
  errors: {
    notFound: LIST_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can add collaborators",
    },
    invalidUser: { status: 400, message: "Invalid target user" },
    conflict: {
      status: 409,
      message: "User is already a collaborator on this list",
    },
  },
});

const COLLABORATOR_NOT_FOUND = {
  status: 404,
  message: "List or collaborator not found",
};

export const updateListCollaborator = defineContract({
  method: "PUT",
  path: "/api/lists/[id]/collaborators/[userId]",
  label: "Update collaborator",
  schemas: schemas<typeof updateListCollaboratorSchemas>(),
  response: type<UpdateCollaboratorsResponse>(),
  errors: {
    notFound: COLLABORATOR_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can update collaborator permissions",
    },
  },
});

export const deleteListCollaborator = defineContract({
  method: "DELETE",
  path: "/api/lists/[id]/collaborators/[userId]",
  label: "Remove collaborator",
  schemas: schemas<typeof deleteListCollaboratorSchemas>(),
  response: type<DeleteResponse>(),
  errors: {
    notFound: COLLABORATOR_NOT_FOUND,
    forbidden: {
      status: 403,
      message: "Only the list owner can remove collaborators",
    },
  },
});
