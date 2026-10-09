# Series Finale Launch

This runbook covers enabling Series Finale in a real environment, and running it from year to year. For how the feature works, see [series-finale.md](../domain/series-finale.md).

Primary references:

- Migrations: [drizzle/0011_boring_xavin.sql](../../drizzle/0011_boring_xavin.sql), [0012_parallel_the_santerians.sql](../../drizzle/0012_parallel_the_santerians.sql), [0013_ancient_namor.sql](../../drizzle/0013_ancient_namor.sql)
- Runtime backfill: [tools/backfill-runtimes.ts](../../tools/backfill-runtimes.ts) ([docs](../../tools/README.md#series-finale-runtime-backfill))
- Migration workflow: [migrations.md](../database/migrations.md)

> There is no feature flag. Once the branch is deployed, every user with a completed year sees the dashboard banner on their next visit. Do steps 1–3 **before** that deploy.

## 1. Apply the migrations

Series Finale adds three migrations:

| Migration | Changes |
| --- | --- |
| `0011` | Creates `tmdb_episode_runtime` and `tmdb_season_fetch`; adds `tmdb_cache.runtime` |
| `0012` | Creates `series_finale`; adds `users.share_stats_with_collaborators` (default `true`) |
| `0013` | Adds `series_finale.story_completed_at` |

All three are additive: new tables, plus columns that are nullable or have a default. None rewrites existing data.

1. Check which have already been applied to the target database:

   ```sql
   select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;
   ```

2. Apply the pending ones:

   ```bash
   DATABASE_URL=<target> pnpm db:migrate
   ```

   `drizzle.config.ts` falls back to `.env.local` **only when `DATABASE_URL` is unset**. Set it explicitly so you know which database you are migrating.

## 2. Backfill runtimes

The "hours watched" headline reads per-episode runtimes from a cache that starts out empty. Without a warm cache, every user's first recap makes thousands of TMDB requests inside their page load.

```bash
DATABASE_URL=<target> TMDB_API_KEY=<key> pnpm backfill:runtimes
```

- The script does **not** read `.env.local`. Both variables must be in the environment.
- Its cost scales with distinct shows × seasons across all users, not with episodes. Before leaving it to run unattended, measure that against the real `episode_watch_status`:

  ```sql
  select count(distinct (tmdb_id, season_number)) from episode_watch_status where watched;
  ```

- It is safe to stop and re-run at any time. Failed lookups are retried on the next run, and successful ones are never fetched twice (except seasons older than 30 days, which are re-asked so that newly aired episodes get runtimes).
- Its end-of-run summary counts films with no `tmdb_cache` row at all, which are usually profile imports. They can't get a runtime until the app caches them. They only lower the hours figure (counted in `unknownRuntimeEpisodes`); they never fail a recap.

## 3. Deploy

Deploy the app as usual. No environment variables are new. The share card's QR code uses the existing site URL (`getSiteUrl`), and the poster fetch uses the existing TMDB image host.

## 4. Verify

Sign in with an account that has history in a completed year, then check:

1. **Dashboard:** the "Your {year} Series Finale is ready" banner appears. The first load may take a few seconds, because the listing generates every missing year newest-first within a 5-second budget.
2. **Desktop:** "See your Series Finale" opens the recap, and **Share** downloads a 1080×1350 PNG.
3. **Phone:** the same link opens the story first. After the last card, the recap opens on that account on every device.
4. **Profile → Data Management:** the Series Finale archive lists the generated years, and the "Include me in crew comparisons" toggle saves.
5. **Database:** rows exist with the current `schema_version`:

   ```sql
   select period_label, schema_version, generated_at, dismissed_at, story_completed_at
   from series_finale where user_id = '<id>' order by period_start desc;
   ```

6. **Logs:** look for `Series Finale: failed to load TMDB genre names` (genres fall back to "Unknown") and `Series Finale card: retrying without the poster`. Neither is fatal; both are worth knowing about.

## Running It Year to Year

- **Nothing is scheduled.** Each user's new year becomes available when 1 January arrives in *their* timezone, and is generated on their next dashboard, profile or recap visit.
- **The percentile appears late.** "Top N% of everyone" only appears once at least 10 non-thin snapshots of comparable length exist. The earliest recaps of a launch generally won't carry it, and each figure is frozen when its recap is generated.
- **Re-run the runtime backfill** a few weeks before the end of each year, to pick up seasons that were still airing.
- **Changing the payload shape:** bump `SERIES_FINALE_SCHEMA_VERSION` in [types.ts](../../src/lib/series-finale/types.ts). Every stored row then regenerates on its next read, and the bump also resets the percentile cohort, because only rows at the current version count.
- **The e2e suite has a date guard.** It refuses to run from 2027-01-01 (Brisbane time) until its cast is rolled forward a year. The steps are in [e2e/series-finale/README.md](../../e2e/series-finale/README.md#dated-for-2026).

## Support Tasks

### Regenerate one user's recap

Mark the row stale rather than deleting it:

```sql
update series_finale set schema_version = 0
where user_id = '<id>' and period_label = '2025';
```

The next read regenerates it and keeps `dismissed_at` and `story_completed_at`. Deleting the row also regenerates it, but brings the banner back and puts that user's phone back through the story.

### "My recap shows someone who opted out"

This shouldn't happen. A withdrawn collaborator is removed from every stored recap on read. Check the collaborator's `users.share_stats_with_collaborators`. If it is `false` and they still appear, it is a bug in `withholdWithdrawnCollaborators` ([service.ts](../../src/lib/series-finale/service.ts)).

### "My numbers are wrong"

Recaps are frozen at generation. Edits made afterwards (re-marking a film, un-ticking episodes) do not change a stored recap. Regenerate it as above if the user wants their corrections reflected. The [known imprecision](../domain/series-finale.md#known-imprecision) list covers the accepted approximations.

## Rolling Back

Revert the deploy. The new tables and columns are inert without the code that reads them, and leaving them in place loses nothing. If a payload bug is found after launch, fix it and bump `SERIES_FINALE_SCHEMA_VERSION`; there is no need to delete rows.
