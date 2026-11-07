import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { cancelClaimSchemas } from "@/lib/profile/devices/schemas";
import { cancelClaim } from "@/lib/profile/devices/service";

// DELETE /api/profile/devices/claims/[id] - Cancel a pending passkey claim
export const DELETE = authedRoute(
  devicesApi.cancelClaim,
  cancelClaimSchemas,
  async ({ user, params }) => {
    const result = await cancelClaim(user.id, params.id);
    return result === "success" ? { success: true as const } : result;
  },
);
