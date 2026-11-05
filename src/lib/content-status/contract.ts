import { defineContract, schemas, type } from "../api/contract";
import type {
  createOrUpdateContentStatusSchemas,
  deleteContentStatusSchemas,
  getContentStatusSchemas,
  updateContentStatusSchemas,
} from "./schemas";
import type {
  ContentStatusItem,
  DeleteContentStatusResult,
  GetContentStatusResponse,
} from "./types";

const STATUS_NOT_FOUND = { status: 404, message: "Content status not found" };

export const getContentStatus = defineContract({
  method: "GET",
  path: "/api/status/content",
  label: "Get content status",
  schemas: schemas<typeof getContentStatusSchemas>(),
  response: type<GetContentStatusResponse>(),
});

export const createOrUpdateContentStatus = defineContract({
  method: "POST",
  path: "/api/status/content",
  label: "Create/update content status",
  status: 201,
  schemas: schemas<typeof createOrUpdateContentStatusSchemas>(),
  response: type<{ status: ContentStatusItem }>(),
  errors: { notFound: { status: 404, message: "Content not found" } },
});

export const updateContentStatus = defineContract({
  method: "PUT",
  path: "/api/status/content",
  label: "Update content status",
  schemas: schemas<typeof updateContentStatusSchemas>(),
  response: type<{ status: ContentStatusItem }>(),
  errors: { notFound: STATUS_NOT_FOUND },
});

export const deleteContentStatus = defineContract({
  method: "DELETE",
  path: "/api/status/content",
  label: "Delete content status",
  schemas: schemas<typeof deleteContentStatusSchemas>(),
  response: type<DeleteContentStatusResult>(),
  errors: { notFound: STATUS_NOT_FOUND },
});
