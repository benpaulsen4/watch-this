import { z } from "zod";

const REGION_INVALID = "Region is required and must be a 2-letter code.";
const countryCode = /^[A-Z]{2}$/i;

export const updateStreamingPreferencesSchemas = {
  body: z
    .object({
      country: z
        .string()
        .regex(countryCode, "Invalid country code format. Expected 2-letter code.")
        .optional(),
      region: z.string().optional(),
      providers: z
        .array(
          z.object({
            providerId: z.int(),
            providerName: z.string().optional(),
            logoPath: z.string().nullable().optional(),
          }),
        )
        .optional(),
    })
    // The region falls back to the country, and only matters with providers.
    .transform((body) => ({ ...body, region: body.region || body.country }))
    .superRefine((body, context) => {
      if (body.providers && !countryCode.test(body.region ?? "")) {
        context.addIssue({
          code: "custom",
          path: ["region"],
          message: REGION_INVALID,
        });
      }
    }),
};
