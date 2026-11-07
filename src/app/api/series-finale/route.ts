import { authedRoute } from "@/lib/api/route";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { listAvailableSnapshots } from "@/lib/series-finale/service";

// GET /api/series-finale - available periods for the current user; feeds the
// dashboard banner and profile rows. Generates any snapshot that is missing
// or stale (see `listAvailableSnapshots`) -- this is the feature's only entry
// point, so it cannot return placeholders for periods nobody has opened.
//
// Every response carries one user's recap data (or its absence) at a URL that
// is the same for every user, so no shared cache may keep it -- 401s and
// errors included, which `headers` covers.
export const GET = authedRoute(
  seriesFinaleApi.listAvailableSnapshots,
  {},
  async ({ user }) => ({ periods: await listAvailableSnapshots(user.id) }),
  { headers: { "Cache-Control": "private, no-store" } },
);
