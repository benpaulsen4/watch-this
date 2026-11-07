import { z } from "zod";

const USERNAME_FORMAT =
  "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens";

const username = z.string().trim().regex(/^[a-zA-Z0-9_-]{3,50}$/, USERNAME_FORMAT);

/** An IANA zone the runtime recognises, checked the way the routes always did. */
function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const timezone = z
  .string("Timezone must be a non-empty string")
  .trim()
  .min(1, "Timezone must be a non-empty string")
  .refine(isTimeZone, "Invalid timezone");

/**
 * A WebAuthn response from the browser, checked only for its id and passed on
 * whole: the WebAuthn library validates the rest.
 */
const credentialResponse = (message: string) =>
  z.custom<{ id: string }>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { id?: unknown }).id === "string" &&
      (value as { id: string }).id.length > 0,
    message,
  );

/** Fits the passkey_credentials.device_name column. */
const deviceName = z.string().max(100, "Device name must be 100 characters or less");

export const updateSessionSchemas = {
  body: z.object({
    username: username.optional(),
    profilePictureUrl: z
      .string("Profile picture URL must be a string or null")
      .max(500, "Profile picture URL must be 500 characters or less")
      .refine(
        (url) => !url.trim() || URL.canParse(url),
        "Profile picture URL must be a valid URL",
      )
      .nullable()
      .optional(),
    timezone: timezone
      .refine((zone) => zone.length <= 100, "Timezone must be 100 characters or less")
      .optional(),
    shareStatsWithCollaborators: z
      .boolean("shareStatsWithCollaborators must be a boolean")
      .optional(),
  }),
};

export const registerBeginSchemas = {
  body: z.object({
    username: z
      .string("Username is required")
      .trim()
      .min(1, "Username is required")
      .pipe(username),
  }),
};

export const registerVerifySchemas = {
  body: z.object({
    username: z.string("Missing required fields").trim().min(1, "Missing required fields"),
    registrationResponse: credentialResponse("Missing required fields"),
    deviceName: deviceName.optional(),
    timezone: timezone.optional(),
  }),
};

export const authenticateVerifySchemas = {
  body: z.object({
    authenticationResponse: credentialResponse("Missing required fields"),
  }),
};

export const claimBeginSchemas = {
  query: z.object({ token: z.string("Missing token").min(1, "Missing token") }),
};

export const claimVerifySchemas = {
  body: z.object({
    token: z.string("Missing parameters").min(1, "Missing parameters"),
    challengeToken: z.string("Missing parameters").min(1, "Missing parameters"),
    registrationResponse: credentialResponse("Missing parameters"),
    deviceName: deviceName.optional(),
  }),
};

/** Parsed by the admin route itself, after the secret check. */
export const adminDeviceClaimBody = z
  .object({
    username: z.string().min(1).optional(),
    userId: z.uuid().optional(),
  })
  .refine(
    (body) => body.username !== undefined || body.userId !== undefined,
    "username or userId required",
  );

/** The admin route reads its body itself, after the secret check. */
export const adminDeviceClaimSchemas = {};
