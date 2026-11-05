import { defineContract, schemas, type } from "../api/contract";
import type {
  createListItemSchemas,
  createListSchemas,
  deleteListItemSchemas,
  deleteListSchemas,
  getListItemsSchemas,
  getListSchemas,
  listContentListsSchemas,
  updateListSchemas,
} from "./schemas";
import type {
  ContentListEntry,
  DeleteResponse,
  GetListItemsResponse,
  GetListResponse,
  ListItemRow,
  ListListsResponse,
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
