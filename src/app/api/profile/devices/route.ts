import { authedRoute } from "@/lib/api/route";
import * as devicesApi from "@/lib/profile/devices/contract";
import { initiateClaim, listDevices } from "@/lib/profile/devices/service";

// GET /api/profile/devices - Get all passkey devices for the authenticated user
export const GET = authedRoute(devicesApi.listDevices, {}, async ({ user }) => ({
  devices: await listDevices(user.id),
}));

// POST /api/profile/devices - Initiate a new passkey claim for the authenticated user
export const POST = authedRoute(devicesApi.initiateClaim, {}, ({ user }) =>
  initiateClaim(user.id, "user"),
);
