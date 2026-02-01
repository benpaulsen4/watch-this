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
- `show_schedules` (removed when a show is marked completed automatically)

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
  - Bulk updates multiple episode rows by looping the same workflow per episode
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

- Collaboration sync and activity writes are best-effort. Failures are logged but do not fail the main episode write.
- Show-level status updates only run when `watched=true` (unwatch does not roll back show status).

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

When an episode is marked as watched, the episodes domain can update the show-level watch status via `updateTVShowStatus(...)` ([episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)).

Rules:

- If no `user_content_status` exists for the show, it creates one and sets it to `watching`
- If a status exists but is not `watching`, it is set to `watching`
- If the status is already `watching`, it checks completion:
  - If the watched episode matches TMDB’s `last_episode_to_air` (same season+episode), it sets show status to `completed`
  - On completion it sets `nextEpisodeDate` based on TMDB’s `next_episode_to_air` when present, otherwise:
    - `null` if the show is ended
    - “now + 1 month” as a fallback
- If the show status changes, it is synced to collaborators via `syncStatusToCollaborators(...)` ([activityUtils.ts](../../src/lib/activity/activityUtils.ts))

Important limitation:

- Unwatching an episode does not revert show status. The current implementation returns `null` for `watched=false` and performs no show-level changes.

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
- Otherwise it selects the numerically highest watched episode (highest season, then highest episode) and:
  - If that episode is not the last episode in its season, next is `(same season, episode + 1)`
  - Otherwise next is `(season + 1, episode 1)`

Airing rule:

- The episode must have an `air_date` that is not in the future, otherwise the request fails with `notAired`.

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
- UI tests: [EpisodeTracker.test.tsx](../../src/components/content/EpisodeTracker.test.tsx)

## Gotchas and Constraints

- Batch updates are not transactional. Partial failure can leave mixed per-episode states.
- “Next episode” is based on the highest watched episode, not the first missing unwatched gap.
- Air-date parsing assumes TMDB provides valid `air_date` strings; invalid dates can lead to surprising comparisons in both UI and server logic.
