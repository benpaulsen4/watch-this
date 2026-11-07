import { z } from "zod";

import { q } from "../api/query";

export const listActivityTimelineSchemas = {
  query: z.object({
    // The service clamps the limit to 1-100, so a value it can't use falls
    // back to the default here rather than being rejected.
    limit: q.int().default(10).catch(10),
    cursor: z.string().optional(),
    type: z.string().optional(),
  }),
};
