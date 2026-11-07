import { authedRoute } from "@/lib/api/route";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { getOrGenerateSnapshotSchemas } from "@/lib/series-finale/schemas";
import {
  getOrGenerateSnapshot,
  loadStoryCompletedAt,
} from "@/lib/series-finale/service";

// GET /api/series-finale/[period] - the frozen payload, generated if absent.
//
// Every response carries one user's recap data (or its absence) at a URL that
// is the same for every user, so no shared cache may keep it -- 401s and
// errors included, which `headers` covers.
export const GET = authedRoute(
  seriesFinaleApi.getOrGenerateSnapshot,
  getOrGenerateSnapshotSchemas,
  async ({ user, params }) => {
    // `getOrGenerateSnapshot` is the one authority on whether this period is
    // over -- it gates in the user's own timezone, not UTC. A route-level
    // completeness check here would judge the wrong clock.
    const payload = await getOrGenerateSnapshot(user.id, params.period);
    if (!payload) return "notFound";

    // Row metadata, read the same way `listSnapshots` reads `dismissedAt` --
    // never folded into the frozen payload itself (task-2-brief.md).
    const storyCompletedAt = await loadStoryCompletedAt(user.id, params.period);

    return { payload, storyCompletedAt };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
