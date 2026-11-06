import { authedRoute } from "@/lib/api/route";
import * as dataApi from "@/lib/profile/data/contract";
import { exportUserDataSchemas } from "@/lib/profile/data/schemas";
import { exportUserData } from "@/lib/profile/data/service";

// GET /api/profile/export?format=csv|json - Export user's lists data
export const GET = authedRoute(
  dataApi.exportUserData,
  exportUserDataSchemas,
  ({ user, query }) => exportUserData(user.id, query.format),
);
