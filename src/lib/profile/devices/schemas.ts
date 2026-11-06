import { z } from "zod";

export const deletePasskeySchemas = {
  params: z.object({ id: z.uuid("Invalid passkey ID") }),
};

export const cancelClaimSchemas = {
  params: z.object({ id: z.uuid("Invalid claim ID") }),
};
