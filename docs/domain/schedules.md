# Schedules Domain

Schedules let users assign TV shows to days of the week. The app uses those assignments to surface “upcoming” watch suggestions (e.g., “it’s Monday—watch the next episode of X”) and to keep shared-list collaborators in sync when list sync is enabled.

Primary references:

- Service: [schedules/service.ts](../../src/lib/schedules/service.ts)
- Types: [schedules/types.ts](../../src/lib/schedules/types.ts)
- API route: [schedules/route.ts](../../src/app/api/schedules/route.ts)
- DB table: [showSchedules](../../src/lib/db/schema.ts)

Secondary references:

- UI: [ScheduleManager.tsx](../../src/components/content/ScheduleManager.tsx)
- Activity “upcoming” producer: [activity/service.ts](../../src/lib/activity/service.ts)
- Status domain cleanup: [content-status/service.ts](../../src/lib/content-status/service.ts)
- Episode domain cleanup: [episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)
- Profile export/import (schedules): [profile/data/service.ts](../../src/lib/profile/data/service.ts)

## Data Model

### Core entity

Schedules are stored per `(userId, tmdbId, dayOfWeek)` where:

- `tmdbId` is the TV show id in TMDB
- `dayOfWeek` is `0..6` (`0 = Sunday`, `6 = Saturday`)

### Database storage

The backing table is `show_schedules` ([schema.ts](../../src/lib/db/schema.ts)). It enforces a uniqueness constraint on `(user_id, tmdb_id, day_of_week)` to prevent duplicate schedules for the same show on the same day.

Important columns:

- `user_id` (FK to `users`, cascade delete)
- `tmdb_id` (integer)
- `day_of_week` (integer)
- `created_at`, `updated_at` (timestamps with timezone)

### Read model / API shape

The primary read model is a day-indexed map: `Record<number, ScheduleItem[]>` ([types.ts](../../src/lib/schedules/types.ts)). The backend always returns keys `0..6` even if some days are empty.

Each `ScheduleItem` includes:

- `id` (schedule row id)
- `tmdbId`
- `createdAt` (ISO string)
- `title` (nullable, resolved via TMDB cache)

## Constraints & Invariants

- Only TV shows are schedulable. The service checks `user_content_status` for `contentType="tv"` before inserting schedules.
- A show must exist in the user’s library (`user_content_status` row must exist) to be scheduled.
- Shows with watch status `completed` or `dropped` cannot be scheduled (enforced by service and reflected in the UI).
- A show can be scheduled on multiple days (one row per day), but not more than once per day (unique constraint + duplicate checks).

## API

All routes are authenticated using `withAuth` ([route.ts](../../src/app/api/schedules/route.ts)).

### GET `/api/schedules`

Optional query parameters:

- `tmdbId` (number)
- `dayOfWeek` (number, `0..6`)

Response: `GetSchedulesResponse`

- `schedules`: `Record<number, ScheduleItem[]>` keyed by `0..6`
- `totalShows`: count of returned rows (after filtering, if filters were applied)

### POST `/api/schedules`

Body: `CreateScheduleInput` `{ tmdbId: number; dayOfWeek: number }`

Validation / domain errors:

- `400` for missing/invalid inputs (e.g. `dayOfWeek` outside `0..6`)
- `404` if the show is not in the user’s library
- `400` if the show is `completed` or `dropped`
- `409` if the schedule already exists for that day

Response: `201` with the created `ScheduleItem` (including `title` when available).

### DELETE `/api/schedules`

Query parameters:

- `tmdbId` (required)
- `dayOfWeek` (optional; if omitted, removes all scheduled days for that `tmdbId`)

Response: `DeleteSchedulesResponse`

- `message`
- `deletedSchedules`: the deleted rows (ids + day-of-week + timestamps)

## Service Behavior

The service lives in [service.ts](../../src/lib/schedules/service.ts) and owns the core rules and database operations.

### Listing schedules

`listSchedules(userId, tmdbId?, dayOfWeek?)`:

- Selects schedule rows for `userId` (optional filters)
- Orders by `dayOfWeek`, then `tmdbId`
- Enriches each schedule item with a `title` via the TMDB cache (`getAllCachedContent`)
- Returns a `schedules` map with keys `0..6` present

### Creating schedules

`createSchedule(userId, { tmdbId, dayOfWeek })`:

- Verifies the show is in the user’s library via `user_content_status`
- Rejects `completed` / `dropped`
- Checks for duplicates before inserting
- Inserts into `show_schedules` and returns a `ScheduleItem` enriched with TMDB cache details (`getCachedContent`)

### Deleting schedules

`deleteSchedules(userId, tmdbId, dayOfWeek?)`:

- Deletes either one day’s schedule or all schedules for the show (depending on `dayOfWeek`)
- Returns the deleted rows so the API/UI can reconcile local state

## Collaboration Sync

Schedules participate in the “sync watch status” collaboration feature used by lists. When a user schedules (or deletes a schedule for) a show that is present on a list with `lists.syncWatchStatus = true`, the schedule change is replicated to list collaborators and the list owner (excluding the initiating user).

Create sync behavior (best-effort):

- Discovers all sync-enabled lists containing the show
- For each collaborator/owner, ensures they have a `user_content_status` row for the show (inserts one if missing)
- Skips collaborators whose status is `completed` or `dropped`
- Avoids creating duplicates if a schedule already exists

Delete sync behavior (best-effort):

- Discovers the same sync-enabled lists containing the show
- Deletes the matching schedules for collaborators (for one day or all days)

Sync errors are caught and logged so they do not fail the initiating user’s request.

## Upcoming Suggestions (Schedules → Activity)

Schedules feed the “upcoming” section of the activity feed. The activity service:

- Computes “today” based on the user’s configured timezone (not the server timezone)
- Selects the user’s scheduled shows for the computed day-of-week
- Filters out any show where the user has already watched an episode “today” in that timezone
- Hydrates show details from the TMDB cache and returns `UpcomingActivity[]`

In the UI, upcoming suggestions render as cards at the top of the activity feed and typically offer a one-click action to mark the “next episode” watched.

## UI Integration

Schedules are managed from the content details experience:

- The “Schedule” tab uses [ScheduleManager.tsx](../../src/components/content/ScheduleManager.tsx).
- The component fetches schedules via `GET /api/schedules` and updates them via POST/DELETE.
- The component blocks scheduling controls entirely when the show is `completed` or `dropped` (matching the service rule).
- The UI highlights the user’s local “today” and shows other scheduled show titles per day when available.

## Automatic Cleanup

Schedules are deleted when a show becomes `completed` or `dropped`, to keep the schedule set focused on actively watched/planned shows. This cleanup happens in the content status and episode flows (see [content-status/service.ts](../../src/lib/content-status/service.ts) and [episodeUtils.ts](../../src/lib/episodes/episodeUtils.ts)).

## Flow

```mermaid
flowchart LR
  UI[Schedule Manager] --> API[/api/schedules]
  API --> Svc[src/lib/schedules/service.ts]
  Svc --> DB[(show_schedules)]

  Svc -->|best-effort sync| DB2[(show_schedules for collaborators)]

  DB --> Svc --> API --> UI

  DB --> ActSvc[src/lib/activity/service.ts]
  ActSvc --> UI2[Activity Feed (Upcoming)]
```
