import { z } from "zod";

export const exportUserDataSchemas = {
  query: z.object({
    format: z.enum(
      ["json", "csv"],
      "Format parameter is required and must be 'csv' or 'json'",
    ),
  }),
};
