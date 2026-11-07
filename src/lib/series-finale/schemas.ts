import { z } from "zod";

import { parsePeriodLabel } from "./periods";

/** The `[period]` segment, parsed into the period it names. */
const periodParams = z.object({
  period: z.string().transform((label, context) => {
    const period = parsePeriodLabel(label);
    if (!period) {
      context.addIssue({ code: "custom", message: "Invalid period" });
      return z.NEVER;
    }
    return period;
  }),
});

export const getOrGenerateSnapshotSchemas = { params: periodParams };
export const dismissSeriesFinaleSchemas = { params: periodParams };
export const completeStorySchemas = { params: periodParams };
