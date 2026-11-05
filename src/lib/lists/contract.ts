import { defineContract, schemas, type } from "../api/contract";
import type {
  createListSchemas,
  deleteListSchemas,
  getListSchemas,
  updateListSchemas,
} from "./schemas";
import type {
  DeleteResponse,
  GetListResponse,
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
