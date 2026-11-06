import { defineContract, schemas, type } from "../../api/contract";
import type { cancelClaimSchemas, deletePasskeySchemas } from "./schemas";
import type { ClaimInitiateResponse, PasskeyDevice } from "./types";

export const listDevices = defineContract({
  method: "GET",
  path: "/api/profile/devices",
  label: "Get devices",
  response: type<{ devices: PasskeyDevice[] }>(),
});

export const initiateClaim = defineContract({
  method: "POST",
  path: "/api/profile/devices",
  label: "Initiate claim",
  response: type<ClaimInitiateResponse>(),
  errors: {
    rateLimit: { status: 429, message: "Rate limit exceeded. Try later." },
    maxDevices: { status: 400, message: "Maximum devices reached" },
  },
});

export const deletePasskey = defineContract({
  method: "DELETE",
  path: "/api/profile/devices/[id]",
  label: "Delete passkey",
  schemas: schemas<typeof deletePasskeySchemas>(),
  response: type<{ success: true }>(),
  errors: {
    minimum: { status: 400, message: "At least one passkey is required" },
    notFound: { status: 404, message: "Passkey not found" },
  },
});

export const cancelClaim = defineContract({
  method: "DELETE",
  path: "/api/profile/devices/claims/[id]",
  label: "Cancel claim",
  schemas: schemas<typeof cancelClaimSchemas>(),
  response: type<{ success: true }>(),
  errors: { notFound: { status: 404, message: "Claim not found" } },
});
