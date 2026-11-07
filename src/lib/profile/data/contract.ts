import { defineContract, schemas, type } from "../../api/contract";
import type { exportUserDataSchemas } from "./schemas";
import type { ExportResponse } from "./types";

// Import stays a plain `withAuth` route: it takes a multipart upload and checks
// its size before reading it, which a JSON contract doesn't describe.
export const exportUserData = defineContract({
  method: "GET",
  path: "/api/profile/export",
  label: "Export data",
  schemas: schemas<typeof exportUserDataSchemas>(),
  response: type<ExportResponse>(),
});
