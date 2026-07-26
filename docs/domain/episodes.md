# Episodes Domain

Episodes covers per-episode watch tracking for TV content (TMDB “TV” entries). It supports:

- Per-user tracking of watched/unwatched state at the episode level
- Bulk “mark season watched/reset” behaviors in the UI
- “Mark next episode” workflows
- Optional collaboration sync (shared lists with sync enabled)
- Side-effects: activity feed entries, show-level watch status updates, schedule cleanup

Primary references:

- Domain service: [service.ts](../../src/lib/episodes/service.ts)
- Domain types: [types.ts](../../src/lib/episodes/types.ts)
- Workflow utilities: [episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)
- API routes:
  - [status/episodes route.ts](../../src/app/api/status/episodes/route.ts)
  - [status/episodes/next route.ts](../../src/app/api/status/episodes/next/route.ts)
  - [tmdb/episodes/[id] route.ts](../../src/app/api/tmdb/episodes/%5Bid%5D/route.ts)
- Storage and related tables: [schema.ts](../../src/lib/db/schema.ts)
- UI:
  - [EpisodeTracker.tsx](../../src/components/content/EpisodeTracker.tsx)
  - [ContentDetailsModal.tsx](../../src/components/content/ContentDetailsModal.tsx)
- Tests:
  - [service.test.ts](../../src/lib/episodes/service.test.ts)
  - [episodeUtils.test.ts](../../src/lib/episodes/episodeUtils.test.ts)
  - [EpisodeTracker.test.tsx](../../src/components/content/EpisodeTracker.test.tsx)

## Data Model

Episode watch state is tracked per:

- `userId`
- `tmdbId` (TV show)
- `seasonNumber`, `episodeNumber`
- `watched`, `watchedAt`

### Database: episode_watch_status

Episode progress is persisted in `episode_watch_status` ([schema.ts](../../src/lib/db/schema.ts)).

- Uniqueness: one row per `(userId, tmdbId, seasonNumber, episodeNumber)`
- `watchedAt` semantics:
  - Set to “now” when `watched=true`
  - Cleared (`null`) when `watched=false`
- Timestamps: `createdAt`/`updatedAt` are stored on the row and returned in list responses (as ISO strings)

### Related data (side-effects)

The episode domain also touches other tables as part of workflows:

- `user_content_status` (show-level status transitions like `watching` / `completed`)
- `activity_feed` (episode progress activity entries)
- `show_schedules` (the user’s schedules for a show are deleted when episode progress marks it `completed`)

## Typical Use Cases

- Mark an episode watched/unwatched
- Compute “next episode to watch”
- Drive UI progress components (episode trackers)

## Domain API (server-side)

The episodes domain is exposed through `src/lib/episodes/service.ts`.

- `listEpisodeStatuses(userId, tmdbId, seasonNumber?, episodeNumber?)`
  - Reads `episode_watch_status` for the authenticated user and show
  - Optional filtering supports “get one episode” or “get one season” patterns
- `updateEpisodeStatus(userId, { tmdbId, seasonNumber, episodeNumber, watched })`
  - The canonical single-episode write path
  - Runs the full workflow (upsert + collaborator sync + activity + show status update)
- `batchUpdateEpisodeStatuses(userId, tmdbId, episodes[])`
  - Thin wrapper over `batchUpdateEpisodes(...)` ([episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)); it does **not** loop the single-episode workflow. See “Workflow: batchUpdateEpisodes”.
- `markNextEpisodeWatched(userId, tmdbId)`
  - Computes the next episode to watch and marks it watched (with the same side-effects)
- `deleteEpisodeStatuses(userId, tmdbId, seasonNumber?, episodeNumber?)`
  - Removes rows for a show, optionally scoped to a season or a single episode

## Workflow: completeEpisodeUpdate

The core invariants of “episode writes” live in [episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts) via `completeEpisodeUpdate(...)`.

Single episode update flow:

1. Upsert `episode_watch_status` for `(userId, tmdbId, seasonNumber, episodeNumber)`
2. If collaboration sync applies, mirror the same episode state to collaborators
3. Write an `activity_feed` entry describing episode progress
4. If `watched=true`, update the show-level status (`user_content_status`)

Operational notes:

- Collaboration sync and activity writes are best-effort. Failures are logged but do not fail the main episode write. Both helpers deliberately take no executor: they swallow their own errors, and a swallowed error inside a caller’s transaction would abort that transaction and turn its `COMMIT` into a silent `ROLLBACK`.
- Show-level status updates run for `watched=false` as well — see “Show-Level Status Coupling”. `completeEpisodeUpdate` accepts a `skipShowStatus` option that suppresses them, but no caller currently sets it.

## Workflow: batchUpdateEpisodes

`batchUpdateEpisodes(...)` ([episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)) is a separate implementation, not a loop over `completeEpisodeUpdate`. Its shape (DATA-04):

1. Deduplicate the selections by `(seasonNumber, episodeNumber)`, last instruction wins. A single upsert statement cannot touch the same conflict target twice, and the last entry is what the user meant. An empty batch returns `{ episodes: [], newStatus: null, syncedCollaboratorIds: [] }` without touching the database.
2. Resolve the user’s timezone once.
3. Fetch show details from TMDB **once** for the whole batch, up front, so the upstream latency is paid before any write starts. A failure here is logged and the batch continues without preloaded details.
4. Write every episode row in a **single** `insert ... onConflictDoUpdate` (`episodeUtils.ts:817-834`) and return the affected rows.
5. Sync all episodes to collaborators in one call, after the upsert has committed (best-effort).
6. Write **one activity row per perceived action**, not one per episode: the watched selections and the un-watched selections each produce at most one summary row carrying `episodeCount`. A mixed batch is two actions; collapsing it into a single `watched: true` row made the feed claim the un-marked episodes had been watched.
7. Recompute the show status **once**, at the end, via `updateTVShowStatus(...)` with `watched = anyWatched`. This runs unconditionally: an all-unwatch batch (“reset season”) contains no watched episode, and skipping the recompute left the show stuck on `completed` (LOGIC-02).

There is deliberately no transaction around any of this, and the code says why. The episode upsert is a single statement, so it is already atomic on its own — a `BEGIN`/`COMMIT` bought nothing. It also actively hurt: in Postgres a failed statement aborts the transaction, every later statement fails with `25P02`, and `COMMIT` is silently downgraded to `ROLLBACK` with no error raised to the client. Because the collaborator sync and the activity insert both swallow their own errors — correct for independent best-effort writes — a swallowed sync failure discarded the user’s episode writes while the function returned the rows it thought it had persisted and the route replied `200`. Those secondary writes now run after the episode upsert has committed, where failing costs only the row they were responsible for.

## Collaboration Sync

Episode-level collaboration sync is implemented by `syncEpisodeStatusToCollaborators(...)` ([episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)).

When it applies:

- The TV show must be present in a list with `lists.syncWatchStatus=true`
- The initiating user must be the list owner or a collaborator on that list

What it does:

- For each sync-enabled list containing the show, it mirrors the episode state to the list’s other participants (owner + collaborators), excluding the initiating user
- It uses “upsert-like” behavior (insert if missing, otherwise update)
- Returns the list of collaborator user IDs that were updated (deduped)

## Show-Level Status Coupling (TV Content)

Episode writes recompute the show-level watch status via `updateTVShowStatus(...)` ([episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)).

`updateTVShowStatus` still accepts `seasonNumber`/`episodeNumber`, but ignores them (they are `_`-prefixed in the signature). The status is derived from the user’s *whole* set of watched episodes, not from the episode that triggered the call. The `watched` flag is still meaningful — see “Unwatching” below — but it is a policy input, not the thing being measured.

### Completion test: aired/unwatched counters

Completion is decided first, by `getTVShowProgressState(...)`, before any status transition is chosen. That means a show can go straight from “no status row” or “not watching” to `completed` in one write; there is no requirement to pass through `watching`.

The test is a pair of counters, not an identity check against a single episode:

1. Fetch show details from TMDB (or reuse a preloaded `showDetails`).
2. `nextEpisodeDate` is TMDB’s `next_episode_to_air.air_date`, parsed, or `null`.
3. If TMDB reports no `last_episode_to_air`, the show is treated as complete exactly when `nextEpisodeDate` is `null`.
4. Otherwise, load the user’s watched episodes, enumerate seasons `1..last_episode_to_air.season_number`, and walk their TMDB episode lists counting:
   - `airedEpisodeCount` — episodes that have aired in the user’s timezone (see `hasAired`), up to and including `last_episode_to_air`. Episodes TMDB lists *past* the reported last-aired episode are skipped, as are episodes with unknown or future air dates.
   - `unwatchedAiredEpisodeCount` — how many of those are absent from `episode_watch_status`.
5. `allAvailableEpisodesWatched = airedEpisodeCount > 0 && unwatchedAiredEpisodeCount === 0`. The `> 0` guard matters: an empty episode set is “fully watched” vacuously, and that vacuous truth used to flip shows to `completed` with nothing watched and delete their schedules (LOGIC-01).

`last_episode_to_air` is therefore used for **season targeting and as the upper bound on which episodes count** — not as an exact-match completion rule. There is no longer any “did the user watch exactly `last_episode_to_air`?” check. Season targeting is also clamped: TMDB files previews and pilot specials under season 0, so `last_episode_to_air.season_number` can legitimately be `0` (or, defensively, negative). `1..0` is an empty season list, so the code falls back to fetching the single season that actually contains the last aired episode, using the clamped number.

### The one-month figure is a threshold, never a stored value

`nextEpisodeDate` is only ever written as TMDB’s real `next_episode_to_air.air_date` or as `null`. **No placeholder date is ever stored.** The one-month figure appears exactly once, as a comparison (`episodeUtils.ts:238-245`):

```
shouldMarkCompleted: nextEpisodeDate > inOneMonth
```

Read: once every aired episode is watched and TMDB *does* know when the next one airs, the show is marked `completed` only if that episode is more than a month out. A gap that large is a between-seasons hiatus, so the user is finished for now and their schedules should be cleaned up; a nearer episode means they are mid-run and the show stays `watching`. Either way the value persisted in `nextEpisodeDate` is the real air date, which is what the content-status enrichment guard later re-checks (see [content-status.md](./content-status.md)).

While the show is *not* fully watched, `getTVShowProgressState` returns `nextEpisodeDate: null` — the hint is only meaningful for a caught-up show, and a stale value would suppress the show from “upcoming” (see [activity.md](./activity.md)).

### Applying the result

- **No `user_content_status` row**: insert one, with `completed` if the completion test passed and `watching` otherwise, plus the computed `nextEpisodeDate`.
- **Row exists and the show is complete**: set `completed` (skipped if it already is), then delete the user’s `show_schedules` rows for the show (best-effort; failures are logged only). If the show was already `completed`, only a changed `nextEpisodeDate` is written.
- **Row exists and the show is not complete**: see below.
- Whenever the status actually changed, it is synced to collaborators via `syncStatusToCollaborators(...)` ([activityUtils.ts](../../src/lib/activity/activityUtils.ts)). `nextEpisodeDate`-only refreshes are not synced.

### Unwatching: `completed` is reverted, `dropped`/`paused` are not

Un-marking an episode *does* revert show status, for `completed` shows specifically (LOGIC-02). A mis-clicked finale otherwise left the show stuck on `completed` with its schedules already deleted and no UI path back, because `createSchedule` refuses completed shows.

The promotion back to `watching` is deliberately narrow:

```
needsWatchingStatus =
  existingStatus.status !== WATCHING &&
  (watched || existingStatus.status === COMPLETED)
```

- `watched=false` on a `completed` show → downgraded to `watching`.
- `watched=false` on a `planning`, `paused` or `dropped` show → status untouched, `null` returned, no collaborator sync. `status !== WATCHING` is true for those statuses too, so without the second clause un-ticking an episode of a show the user had deliberately dropped silently re-opened it — and pushed that resurrection out to everyone on a sync-enabled shared list.
- `watched=true` on a `dropped` (or `paused`/`planning`) show → resumed as `watching`. Actually watching something is an explicit signal; un-ticking is not.
- A `nextEpisodeDate` that no longer matches is refreshed **regardless**, including for a dropped show. Only the *status* is pinned; the schedule hint is allowed to go stale-free.
- The single case an unwatch does not act on at all is a show with no `user_content_status` row: there is nothing to downgrade and no reason to start tracking it. This is checked before the timezone lookup, so the common no-op path costs exactly one query.

These distinctions are covered by `episodeUtils.test.ts` (“downgrades a completed show back to watching when an episode is un-marked”, “leaves a %s show alone when an episode is un-marked”, “still refreshes nextEpisodeDate for a dropped show without re-opening it”, “resumes a dropped show when an episode is marked watched”).

## HTTP API

The episodes domain is exposed via authenticated API routes (all handlers use `withAuth`).

### GET /api/status/episodes

- Route: [route.ts](../../src/app/api/status/episodes/route.ts)
- Query params:
  - `tmdbId` (required)
  - `seasonNumber` (optional)
  - `episodeNumber` (optional)
- Response: `{ episodes: EpisodeStatusItem[] }`

### POST /api/status/episodes

- Body: `{ tmdbId, seasonNumber, episodeNumber, watched }`
- Response: `{ episode, newStatus }`
  - `newStatus` is the updated show-level status when it changes, otherwise `null`
- Validation details:
  - `seasonNumber` can be `0` (TMDB “Specials” season)
  - `episodeNumber` must be `>= 1`

### PUT /api/status/episodes

- Body: `{ tmdbId, episodes: [{ seasonNumber, episodeNumber, watched }, ...] }`
- Intended for bulk season operations from the UI
- Guards:
  - Non-empty list, max 100 items
  - Each item must provide numbers for season/episode and boolean `watched`

### DELETE /api/status/episodes

- Query params:
  - `tmdbId` (required)
  - `seasonNumber` (optional)
  - `episodeNumber` (optional)
- Deletes rows at the requested scope and returns `{ deletedCount }`

### POST /api/status/episodes/next

- Route: [next route.ts](../../src/app/api/status/episodes/next/route.ts)
- Body: `{ tmdbId }`
- Response:
  - `201` with `{ episode, newStatus, episodeDetails }` on success
  - `404` when the TV show does not exist in TMDB
  - `400` when there is no next episode or the next episode has not aired yet

## “Next Episode” Semantics

The “next episode” workflow is in `markNextEpisodeWatched(...)` ([service.ts](../../src/lib/episodes/service.ts)).

Selection logic:

- If the user has never watched an episode for the show: next is `S01E01`
- Otherwise the database returns the numerically highest watched episode (ordered by season then episode, `LIMIT 1` — DATA-08b), and from that season’s TMDB episode list:
  - Next is `(same season, smallest episode_number strictly greater than the last watched one)`
  - If that season has no such episode, next is `(season + 1, episode 1)`

The “smallest greater episode number” rule is not the same as `episode + 1`, and not the same as comparing against the season’s episode *count* (LOGIC-10): TMDB seasons are not numbered `1..length`, recaps and specials are commonly filed as episode 0, and numbering gaps exist, so the number of entries says nothing about the highest episode number.

Airing rule:

- The episode must have an air date that has already arrived **in the user’s timezone**, evaluated by `hasAired(...)`; otherwise the request fails with `notAired`.

## UI Integration

The main UI surface is [EpisodeTracker.tsx](../../src/components/content/EpisodeTracker.tsx), rendered inside the TV details UI ([ContentDetailsModal.tsx](../../src/components/content/ContentDetailsModal.tsx)).

Data sourcing:

- Loads user statuses from `GET /api/status/episodes?tmdbId=...`
- Loads episode lists from `GET /api/tmdb/episodes/:tvId?season=N` for seasons `1..number_of_seasons`

Key behaviors:

- Episodes with an `air_date` in the future are disabled (cannot be marked watched)
- “Mark All” for a season only includes episodes whose `air_date` is in the past
- Season toggles use the bulk endpoint (`PUT /api/status/episodes`)

## Testing

There are lightweight tests covering both server and UI behavior:

- Server/service tests: [service.test.ts](../../src/lib/episodes/service.test.ts)
- Workflow-utility tests: [episodeUtils.test.ts](../../src/lib/episodes/episodeUtils.test.ts) — air-date handling, the completion counters, the unwatch downgrade rules and the batch shape
- UI tests: [EpisodeTracker.test.tsx](../../src/components/content/EpisodeTracker.test.tsx)

## Gotchas and Constraints

- Batch updates are not transactional, by design (see “Workflow: batchUpdateEpisodes”). The episode rows themselves land in one atomic statement; the collaborator sync and activity writes can fail independently without affecting them.
- “Next episode” is based on the highest watched episode, not the first missing unwatched gap.
- Air dates are handled by `getAirDateKey`/`hasAired`, which treat missing or unparseable values as *not aired* (LOGIC-11) and compare bare `YYYY-MM-DD` dates as calendar days in the viewer’s timezone rather than as UTC instants (LOGIC-15). A bare date parsed with `new Date()` is pinned to UTC midnight, which can be a full day away from the calendar day the viewer experienced.
- `updateTVShowStatus` reads season/episode details from TMDB per call. A show with many seasons costs one request per season on every episode write.
