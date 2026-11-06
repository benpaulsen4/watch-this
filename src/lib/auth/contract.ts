import { defineContract, schemas, type } from "../api/contract";
import type { ClaimInitiateResponse } from "../profile/devices/types";
import type {
  adminDeviceClaimSchemas,
  authenticateVerifySchemas,
  claimBeginSchemas,
  claimVerifySchemas,
  registerBeginSchemas,
  registerVerifySchemas,
  updateSessionSchemas,
} from "./schemas";
import type {
  AuthenticateBeginResponse,
  AuthenticateVerifyResponse,
  ClaimBeginResponse,
  RegisterBeginResponse,
  RegisterVerifyResponse,
  SessionUser,
} from "./types";

const USERNAME_EXISTS = { status: 409, message: "Username already exists" };
const INVALID_CHALLENGE = {
  status: 400,
  message: "Invalid or expired challenge",
};

export const getSession = defineContract({
  method: "GET",
  path: "/api/auth/session",
  label: "Check session",
  response: type<{ user: SessionUser }>(),
});

export const updateSession = defineContract({
  method: "PUT",
  path: "/api/auth/session",
  label: "Update profile",
  schemas: schemas<typeof updateSessionSchemas>(),
  response: type<{ success: true; user: SessionUser }>(),
  errors: {
    usernameTaken: { status: 409, message: "Username is already taken" },
  },
});

export const registerBegin = defineContract({
  method: "POST",
  path: "/api/auth/register/begin",
  label: "Registration setup",
  schemas: schemas<typeof registerBeginSchemas>(),
  response: type<RegisterBeginResponse>(),
  errors: { usernameTaken: USERNAME_EXISTS },
});

export const registerVerify = defineContract({
  method: "POST",
  path: "/api/auth/register/verify",
  label: "Registration",
  schemas: schemas<typeof registerVerifySchemas>(),
  response: type<RegisterVerifyResponse>(),
  errors: {
    invalidChallenge: INVALID_CHALLENGE,
    usernameTaken: USERNAME_EXISTS,
    verificationFailed: {
      status: 400,
      message: "Registration verification failed",
    },
  },
});

export const authenticateBegin = defineContract({
  method: "GET",
  path: "/api/auth/authenticate/begin",
  label: "Sign-in setup",
  response: type<AuthenticateBeginResponse>(),
});

export const authenticateVerify = defineContract({
  method: "POST",
  path: "/api/auth/authenticate/verify",
  label: "Authentication",
  schemas: schemas<typeof authenticateVerifySchemas>(),
  response: type<AuthenticateVerifyResponse>(),
  errors: {
    invalidChallenge: INVALID_CHALLENGE,
    credentialNotFound: { status: 404, message: "Credential not found" },
    verificationFailed: {
      status: 400,
      message: "Authentication verification failed",
    },
  },
});

const INVALID_TOKEN = { status: 401, message: "Invalid token" };
const CLAIM_NOT_ACTIVE = { status: 400, message: "Claim not active" };
const MAX_DEVICES = { status: 400, message: "Maximum devices reached" };

export const claimBegin = defineContract({
  method: "GET",
  path: "/api/auth/claim/begin",
  label: "Claim lookup",
  schemas: schemas<typeof claimBeginSchemas>(),
  response: type<ClaimBeginResponse>(),
  errors: {
    invalidToken: INVALID_TOKEN,
    notFound: { status: 404, message: "Claim not found" },
    notActive: CLAIM_NOT_ACTIVE,
    expired: { status: 400, message: "Claim expired" },
  },
});

export const claimVerify = defineContract({
  method: "POST",
  path: "/api/auth/claim/verify",
  label: "Passkey claim",
  schemas: schemas<typeof claimVerifySchemas>(),
  response: type<{ success: true }>(),
  errors: {
    invalidToken: INVALID_TOKEN,
    invalidChallenge: { status: 400, message: "Invalid challenge" },
    notActive: CLAIM_NOT_ACTIVE,
    maxDevices: MAX_DEVICES,
  },
});

export const signOut = defineContract({
  method: "POST",
  path: "/api/auth/signout",
  label: "Sign out",
  response: type<{ success: true; message: string }>(),
});

export const adminDeviceClaim = defineContract({
  method: "POST",
  path: "/api/admin/device-claim",
  label: "Create device claim",
  schemas: schemas<typeof adminDeviceClaimSchemas>(),
  response: type<ClaimInitiateResponse>(),
  errors: {
    unauthorized: { status: 401, message: "Unauthorized" },
    notFound: { status: 404, message: "User not found" },
    maxDevices: MAX_DEVICES,
    rateLimit: {
      status: 429,
      message: "Too many claims for this user, try again later",
    },
  },
});
