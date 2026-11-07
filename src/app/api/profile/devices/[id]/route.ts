import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { deletePasskeySchemas } from "@/lib/profile/devices/schemas";
import { deletePasskey } from "@/lib/profile/devices/service";

// DELETE /api/profile/devices/[id] - Remove one of the user's passkeys
export const DELETE = authedRoute(
  devicesApi.deletePasskey,
  deletePasskeySchemas,
  async ({ user, params }) => {
    const result = await deletePasskey(user.id, params.id);
    return result === "success" ? { success: true as const } : result;
  },
);
