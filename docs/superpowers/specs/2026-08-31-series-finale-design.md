# Series Finale — Design

Date: 2026-08-31
Status: Approved for planning
Mock: Claude Design project `fa6eca7a-c60c-4a78-a3ab-c9f684b49d4c`, file `WatchThis Wrapped.dc.html`

## Summary

Series Finale is WatchThis's annual recap: a per-user, per-period snapshot of what
someone watched, rendered as a 14-card mobile story, a denser desktop page, and a
shareable 1080×1350 image. It is generated once per user per period, frozen, and
kept forever.

The name covers both the annual recap and the seasonal cut on the roadmap, so
nothing in this design hard-codes a calendar year. Periods are explicit
`[start, end)` ranges throughout.

## Decisions

These were settled during brainstorming. Record of what was chosen and why, so
implementation does not relitigate them.

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | Everything in the mock, one release | Crew and comparison ship with the rest, so the cross-user consent model is designed up front rather than retrofitted. |
| Persistence | Snapshot, frozen | `tmdb_cache.popularity` drifts and users keep editing status, so a live recompute would make archived years and share images disagree with themselves over time. Also makes the expensive crew queries a once-per-period cost. |
| Time-of-day cards | Kept, restricted to individually-ticked episodes | Batch writes stamp one timestamp across many episodes, which would otherwise collapse the hour timeline and misfire the Nightly Ritualist rule. |
| Runtime precision | Per-episode runtimes in a new global cache | `episode_run_time` is a series-level average and is frequently absent on TMDB. Per-episode data is bounded by shows×seasons and is shared across all users. |
| Crew consent | Default on for list-sharers, opt-out, never public | Matches the app's existing posture (collaborators already see each other's activity) while drawing a hard line at anything a non-user could reach. |
| Sharing | Image only, QR to the marketing page | Exactly what the mock draws, and avoids an entire tokenised public-route surface for a feature that is prominent six weeks a year. |
| Periods generated | All completed past years backfilled at launch | The feature is real and end-to-end testable on day one rather than in five months, and the archived-years UI has something to show. |

## Constraints discovered in the codebase

These are facts about the current code that the design has to accommodate. Each was
verified against the source, not assumed.

1. **Batch episode writes share one timestamp.** `src/lib/episodes/episodeUtils.ts`
   computes a single `const now = new Date()` and applies it to every episode in the
   batch. Marking a season watched produces N rows with identical `watched_at`.
2. **`watched_at` records logging time, not viewing time.** Even a single tick is
   stamped at the moment the user pressed the button. Day-level buckets tolerate
   this; hour-level buckets are interpretation, and the UI must not overstate them.
3. **`TMDBTVShowDetails` does not model `episode_run_time`.** Using it would require
   extending the client type. `getTVSeasonDetails()` already exists and returns
   episodes carrying a real per-episode `runtime`.
4. **`postgres-js` cannot run on the edge runtime.** `src/lib/db/index.ts` opens raw
   TCP sockets, so the share-image route cannot copy the `runtime = "edge"` pattern
   in `src/app/opengraph-image.tsx`. It renders on the Node runtime.
5. **`user_content_status.updated_at` is only written when a writer sets it
   explicitly.** The column has no `$onUpdate`, and the `nextEpisodeDate`-only update
   path in `episodeUtils.ts` does not touch it. Dating completed films by
   `updated_at` is therefore sound, with the caveat in "Known imprecision" below.
6. **Movies cannot be dropped.** `MovieWatchStatus` is `planning | completed` only,
   so the abandonment card separates dropped shows from still-planning films.
7. **`watched_at` has existed since migration `0000`.** No historical gap to backfill.

## Data model

All changes are additive. No existing column changes type or nullability.

### `tmdb_episode_runtime` (new)

Global, user-independent. One fetch of a season serves every user forever.

```
id              uuid pk
tmdb_id         integer   not null
season_number   integer   not null
episode_number  integer   not null
runtime         integer                -- minutes; NULL when TMDB has none
created_at      timestamptz not null default now()
updated_at      timestamptz not null default now()
unique (tmdb_id, season_number, episode_number)
```

### `tmdb_season_fetch` (new)

Exists solely to distinguish "TMDB has no runtime for this episode" from "we never
asked". Without it, a season whose episodes genuinely lack runtimes is refetched on
every generation, forever.

```
id              uuid pk
tmdb_id         integer   not null
season_number   integer   not null
fetched_at      timestamptz not null default now()
unique (tmdb_id, season_number)
```

### `tmdb_cache.runtime` (new column)

`integer`, nullable. Movies only; TV rows leave it null.

### `series_finale` (new)

```
id              uuid pk
user_id         uuid not null references users(id) on delete cascade
period_start    timestamptz not null
period_end      timestamptz not null   -- exclusive
period_label    varchar(32) not null   -- "2026"
payload         jsonb not null
schema_version  integer not null
generated_at    timestamptz not null default now()
dismissed_at    timestamptz            -- banner "Not now"
unique (user_id, period_start, period_end)
index on (user_id, period_start desc)
```

`period_start`/`period_end` rather than a year integer, so the seasonal cut needs no
migration. `schema_version` so a payload shape change is detected and the snapshot
regenerated rather than crashing the reader. `dismissed_at` lives here because
dismissal is per-recap and needs no table of its own.

### `users.share_stats_with_collaborators` (new column)

`boolean not null default true`. The crew opt-out. Lives on `users` following the
existing precedent of `timezone` and `country` rather than introducing a preferences
table.

## Module structure

New `src/lib/series-finale/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | Payload shape; the contract between engine and UI |
| `aggregate.ts` | **Pure.** Plain arrays in, payload out. No DB, no I/O, no clock. |
| `archetype.ts` | **Pure.** The ordered classifier. |
| `runtime.ts` | Runtime resolution and season backfill |
| `service.ts` | Orchestration: load rows, aggregate, persist snapshot |

`aggregate.ts` and `archetype.ts` must stay pure. The archetype rules are precise
numeric thresholds and each needs a triggering case and a near-miss case; that is
only affordable if the functions take arrays and return objects. This mirrors the
existing separation of pure helpers from DB access in `episodeUtils.ts`.

`service.ts` is the only file that touches the database. The story and the desktop
page are two renderings of one payload, not two query paths.

## Payload contract

```ts
export const SERIES_FINALE_SCHEMA_VERSION = 1;

export interface SeriesFinalePayload {
  schemaVersion: number;
  period: { start: string; end: string; label: string };

  headline: {
    hours: number;                    // rounded, whole hours
    minutes: number;                  // exact total, for the desktop detail line
    episodes: number;
    titlesCompleted: number;
    titlesDropped: number;
    unknownRuntimeEpisodes: number;   // episodes excluded from the hours total
    percentile: number | null;        // "top N%"; null until the cohort is large enough
  };

  episodes: { total: number; perDay: number };
  finished: { films: number; shows: number; total: number };

  topShow: {
    tmdbId: number; title: string; posterPath: string | null;
    episodes: number; minutes: number; finishedAt: string | null;
    alsoTopFor: string[];             // usernames; [] when crew is unavailable
  } | null;

  niche: {
    tmdbId: number; title: string; posterPath: string | null;
    popularity: number; medianPopularity: number;
    mostPopular: { tmdbId: number; title: string; popularity: number } | null;
    filmPopularities: number[];       // for the strip plot
  } | null;

  genres: { name: string; percent: number }[];   // top 5 + "Everything else"
  months: { month: number; episodes: number }[]; // exactly 12, zero-filled

  bigDay: {
    date: string; episodes: number; minutes: number;
    timeline: { at: string }[] | null;   // null when below the solo-tick floor
    soloTickCount: number;
    streak: { days: number; start: string; end: string } | null;
  } | null;

  rhythm: {
    archetype: ArchetypeId | null;
    weekdayCounts: number[];             // 7 entries, Monday-first
    topWeekday: number | null;
    lateShare: number | null;            // share after 21:00; null below the floor
  };

  shame: {
    dropped: { tmdbId: number; title: string; lastEpisode: string | null }[];
    stillPlanning: { tmdbId: number; title: string; days: number; runtime: number | null }[];
  };

  crew: { userId: string; username: string; episodes: number; hours: number }[];

  compare: {
    userId: string; username: string;
    onlyYou: number; both: number; onlyThem: number;
    theyFinishedYouDropped: string | null;
    bothPlanningNeitherStarted: string | null;
  }[];
}
```

`crew` and `compare` are empty arrays when the viewer has no collaborators, and are
stripped entirely before the share image renders (see "Privacy rules").

## Aggregation rules, per card

Unless stated otherwise, every date bucket is computed in the user's
`users.timezone`, matching how `src/lib/activity/service.ts` already buckets.

| Card | Source | Rule |
| --- | --- | --- |
| Hours | `episode_watch_status` + `tmdb_episode_runtime`; `user_content_status` + `tmdb_cache.runtime` | Sum runtimes of episodes watched in period and films completed in period. Episodes with no known runtime are excluded and counted in `unknownRuntimeEpisodes`. |
| Episodes | `episode_watch_status` | `watched = true` and `watched_at` within period. |
| Finished | `user_content_status` | `status = 'completed'`, dated by `updated_at` within period. Split by `content_type`. |
| Top show | `episode_watch_status` | Most episodes watched in period. `finishedAt` from `max(watched_at)`, which is a real event, not `updated_at`. |
| Niche | `tmdb_cache.popularity` over completed films | Lowest popularity; `medianPopularity` over the user's other completed films in period. |
| Genres | `tmdb_cache.genre_ids` over completed titles | Share of titles per genre, top 5, remainder folded into "Everything else". |
| Months | Episodes by `watched_at`; films by `updated_at` | 12 buckets, zero-filled. |
| Big day | `episode_watch_status` | Calendar day with most episodes. `timeline` from solo ticks only. |
| Rhythm | `episode_watch_status` | Weekday distribution from all rows; `lateShare` from solo ticks only. |
| Shame | `user_content_status` | `status = 'dropped'` shows with their highest watched episode; `status = 'planning'` films with `now - created_at` in days. |
| Crew | Collaborators across shared lists | Episodes and hours for the same period, per collaborator who has not opted out. |
| Compare | Both users' completed sets | Set arithmetic over `(tmdb_id, content_type)` pairs. |

### The percentile

`headline.percentile` requires a cohort. Because generation is lazy, the first user
to generate has none. It is computed from the totals of **existing snapshots for the
same period**, and is `null` until at least 20 such snapshots exist. The Hours card
drops the "Top 4% of everyone on WatchThis" line entirely when it is null rather than
showing a placeholder. Snapshots are not retroactively updated as the cohort grows;
the value reflects the cohort at generation time.

## The solo-tick filter

An episode row is a **solo tick** when no other row for the same `user_id` shares its
exact `watched_at`. A batch write is one `INSERT` carrying one `new Date()`, so every
member of a batch collides. A one-episode batch is indistinguishable from a solo
tick, which is correct — it is one.

```sql
-- solo ticks for a user within a period
SELECT e.* FROM episode_watch_status e
WHERE e.user_id = $1 AND e.watched AND e.watched_at >= $2 AND e.watched_at < $3
  AND NOT EXISTS (
    SELECT 1 FROM episode_watch_status o
    WHERE o.user_id = e.user_id AND o.watched_at = e.watched_at AND o.id <> e.id
  )
```

**Applies to:** `bigDay.timeline`, `rhythm.lateShare`, archetype rule 5.
**Does not apply to:** episode totals, monthly buckets, weekday distribution,
streaks, and `bigDay`'s own date and count.

**Floor:** `SOLO_TICK_FLOOR = 50` per period. Below it, `bigDay.timeline` and
`rhythm.lateShare` are `null` and archetype rule 5 is skipped in the ordered
evaluation, shifting later rules up. The card renders without its hour axis rather
than disappearing.

**Disclosure:** when `timeline` is non-null the card carries fine print naming the
count it is based on — "From the 340 episodes you ticked one at a time." Plain, no
exclamation mark, per the voice guide.

## Archetype classifier

Each user gets exactly one. Evaluate in order, stop at the first match, so ties
resolve deterministically. Rule 5 is skipped when solo ticks are below the floor.

| # | Id | Rule |
| --- | --- | --- |
| 1 | `serial-abandoner` | `dropped / (dropped + completed) >= 0.35`, minimum 5 dropped shows |
| 2 | `completionist` | `completed / (completed + dropped + paused) >= 0.9`, minimum 15 titles |
| 3 | `weekday-marathoner` | One weekday holds `>= 22%` of episodes **and** median episodes-per-active-day on that weekday `>= 4` |
| 4 | `feast-or-famine` | Coefficient of variation of monthly episode counts `>= 0.75` |
| 5 | `nightly-ritualist` | `>= 60%` of solo-tick episodes inside one 3-hour window, across `>= 5` distinct weekdays |
| 6 | `one-genre-only` | Top genre `>= 40%` of watched titles |
| 7 | `deep-cut-hunter` | Median `tmdb_cache.popularity` of completed titles `<= 25` |
| 8 | `group-watcher` | `>= 50%` of completed titles also sit on a list with at least one collaborator |

Fallback: fewer than 10 episodes **and** fewer than 5 titles in the period yields
`archetype: null` and no archetype card. The display label for `weekday-marathoner` is generated from the
user's actual top weekday, not hard-coded to Sunday.

## Runtime resolution and backfill

Resolution order per title:

1. **Film** — `tmdb_cache.runtime`; if null, fetch via `getMovieDetails` and persist.
2. **Episode** — exact row in `tmdb_episode_runtime`.
3. **Miss** — if `tmdb_season_fetch` has no row for `(tmdb_id, season_number)`, fetch
   the season via `getTVSeasonDetails`, persist every episode's runtime (including
   nulls), record the season fetch, and retry.
4. **Still null** — exclude the episode from the hours total and increment
   `unknownRuntimeEpisodes`.

Step 4 is deliberate. Silently dropping unknown-runtime episodes makes the headline
number wrong in a way nobody can detect; counting them makes coverage visible both to
the reader and to us at generation time.

**Backfill script.** Walks distinct `(tmdb_id, season_number)` pairs across all of
`episode_watch_status`, plus distinct movie `tmdb_id`s from `user_content_status`,
and populates the caches. Rate-limited and resumable — it is re-run safe because
`tmdb_season_fetch` records what has already been asked.

Note this is a new pattern for the repo: `tools/` currently holds standalone
converters with no database access, so the script needs a runner convention and an
npm script alongside the existing `db:*` entries.

## Generation lifecycle

Generation is **lazy, not scheduled.** There is no cron infrastructure in the repo,
and adding a scheduler for something that fires once a year is poor value.

When a completed period has no snapshot for the user, it is generated on demand
behind a loading state. The launch backfill and the annual path are therefore the
same code, which is the only way the backfill gets meaningfully exercised.

- Idempotent on `(user_id, period_start, period_end)`; regenerating replaces.
- A snapshot whose `schema_version` is below the current constant is regenerated on
  read rather than rendered.
- Runtime backfill runs before generation; generation does not block on live TMDB
  fetches for seasons already recorded in `tmdb_season_fetch`.

## API surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/series-finale` | GET | Available periods for the user; feeds the banner and profile rows |
| `/api/series-finale/[period]` | GET | The payload, generating it if absent |
| `/api/series-finale/[period]/dismiss` | POST | Sets `dismissed_at` |
| `/api/series-finale/[period]/card` | GET | The 1080×1350 PNG |

All are `withAuth`, consistent with the rest of the app. The card route runs on the
**Node runtime** — `postgres-js` cannot run on edge, so it cannot copy
`opengraph-image.tsx`.

The crew opt-out folds into the existing profile PATCH rather than getting its own
endpoint.

## UI surface

| Component | Location | Notes |
| --- | --- | --- |
| Desktop recap | `src/app/(authenticated)/series-finale/[period]/page.tsx` | Mock artboard 1e |
| Story mode | sibling route, same payload | 14 cards, order per the mock's `REEL_ORDER` |
| Dashboard banner | `src/components/series-finale/SeriesFinaleBanner.tsx` | Mock artboards 1a and 1h; hidden once `dismissed_at` is set |
| Profile row | existing profile page | Mock artboard 1b; every generated period, newest first |

Every control in the mock maps to an existing primitive — `Button` variants
`entertainment`, `gradient`, `outline`, `ghost`, `secondary` and `Badge` variants
`genre`, `rating`, `year`, `dropped`, `planning` all already exist in
`src/components/ui/`. No new primitives.

Per the design system, only one gradient treatment per view. TMDB attribution
(`BrandLogo mark="tmdb"`) appears on any surface showing their metadata.

Story navigation follows the mock: tap right advances, tap left goes back, progress
bars across the top, close returns to the recap page.

## Privacy rules

1. A collaborator appears in `crew` and `compare` only when
   `users.share_stats_with_collaborators` is true. The default is true; the setting
   is a withdrawal, exposed in profile settings.
2. `crew`, `compare`, `topShow.alsoTopFor`, and any other cross-user field are
   **stripped from the payload before the share image renders** — removed from the
   renderer's input, not hidden with CSS.
3. There is no public route. The QR on the share card points at the marketing splash
   page, never at user data.
4. The percentile is an anonymous aggregate and names no one.

## Error handling and degradation

Every card degrades independently. A failure computing one card yields `null` for
that key and a rendered fallback, never a failed recap.

- No collaborators, or all opted out: `crew` and `compare` are `[]`; those cards are
  omitted from the story order rather than shown empty.
- No completed films: `niche` is `null`; card omitted.
- Solo ticks below the floor: timeline and late-share are `null`; the Big Day card
  renders its date and count without the hour axis.
- TMDB unreachable during generation: runtimes resolve from cache only, and
  `unknownRuntimeEpisodes` rises. Generation still completes.
- Thin year — fewer than 10 episodes **and** fewer than 5 titles: no story mode at
  all. A single card states the year is too thin to reconstruct and shows the few
  real numbers there are. Offering a 14-card journey through nine episodes reads as
  mockery.

## Testing

Unit tests on the pure functions carry the weight.

- **Archetype classifier**: each of the 8 rules gets a case that triggers it and a
  case that just misses the threshold. Plus ordering tests proving an input matching
  two rules resolves to the earlier one, and that skipping rule 5 shifts later rules
  up correctly.
- **Solo-tick filter**: a batch of N shares one timestamp and is excluded; a single
  tick is retained; a one-episode batch is treated as a solo tick.
- **Runtime resolution**: the full fallback chain, including that an unknown runtime
  increments `unknownRuntimeEpisodes` rather than silently vanishing, and that a
  season recorded in `tmdb_season_fetch` is not refetched.
- **Timezone bucketing**: an episode near midnight lands in the correct day for a
  non-UTC user.
- **Degradation**: each `null`-able payload key renders its fallback.

One integration test generates a snapshot, mutates the underlying rows, re-reads, and
asserts the payload is unchanged. That is the entire premise of freezing, and it
should fail loudly if the read path is ever "optimised" into a live query.

Component tests follow the existing React Testing Library patterns in
`src/components/`.

## Known imprecision, stated deliberately

The recap presents these as facts and they are approximations. Each was accepted with
its reason.

1. **Films are dated by `user_content_status.updated_at`.** There is no per-watch
   timestamp for films. Nothing meaningful writes that row after completion, so it is
   close enough to a completion date to chart — but a user who re-marks a film moves
   it to the later year.
2. **`watched_at` is a logging time.** Someone who watches at 21:00 and ticks it the
   next morning appears as a morning watcher. The solo-tick filter removes batch
   distortion; it cannot remove this.
3. **Popularity is the currently-cached value**, not the value at watch time. TMDB
   popularity drifts, so "most obscure film" reflects today's obscurity.
4. **First watches only.** There is no rewatch UI, so every count is first watches.
5. **The percentile reflects the cohort at generation time** and is not recomputed as
   more users generate snapshots.

## Out of scope

Two pre-existing data-integrity bugs surfaced during this design. Both degrade
Series Finale accuracy, and both are bugs in their own right that deserve their own
change rather than riding along with a feature.

1. `syncEpisodeStatusesToCollaborators` in `src/lib/episodes/episodeUtils.ts`
   overwrites collaborators' `watched_at` with the acting user's `now`, rewriting
   other people's history on sync-enabled lists. The same function already carries a
   `TODO(FOLLOW-UP)` noting collaborators are written to without an opt-in step.
2. The upsert in the same file sets `watchedAt = excluded.watched_at` on conflict, so
   un-ticking and re-ticking an episode moves it to today.

Also out of scope: a public share route, mid-year live previews, rewatch tracking,
and the seasonal cut (the period model accommodates it; no UI is specified).

## Open risks

- **Backfill volume at launch.** Bounded by distinct shows×seasons across all users,
  not by episodes, and permanently cached — but it is the largest single cost in the
  release and should be measured against the real `episode_watch_status` before the
  script runs unattended.
- **Crew query cost.** Bounded by running only at generation, but a user on many
  shared lists with many collaborators produces a wide fan-out. Worth an explicit cap
  on crew size if it proves slow; the mock shows five.
- **Lazy generation latency.** First view of a period pays for aggregation. Acceptable
  once per period per user behind a loading state, but if backfill has not run, it
  also pays for TMDB fetches. The launch backfill must complete before the feature is
  announced.
