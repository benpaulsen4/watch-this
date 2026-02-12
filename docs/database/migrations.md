# Migrations

WatchThis uses Drizzle ORM for type-safe database access and Drizzle Kit for schema management and migrations. The schema is defined in TypeScript and migrations are generated as SQL.

Primary references:

- Drizzle Kit config: [drizzle.config.ts](../../drizzle.config.ts)
- Runtime DB client: [index.ts](../../src/lib/db/index.ts)
- Schema definition: [schema.ts](../../src/lib/db/schema.ts)
- Migrations output: [drizzle/](../../drizzle/)
- Scripts: [package.json](../../package.json)
- Schema tour: [schema.md](./schema.md)

## Prerequisites

- PostgreSQL is required.
- `DATABASE_URL` must be set (see [.env.example](../../.env.example)). Both Drizzle Kit and the runtime DB client require it.

## How It Works

### Schema Source of Truth

All tables, columns, relations, indexes, and constraints live in the TypeScript schema at [schema.ts](../../src/lib/db/schema.ts).

### Migration Output

Drizzle Kit generates:

- SQL migration files in [drizzle/](../../drizzle/) (checked into the repo).
- Snapshots and a migration journal in [drizzle/meta/](../../drizzle/meta/) (also checked in).

The app itself does not run migrations automatically at runtime. Applying migrations is an explicit workflow step.

## Workflows

### Development “Push” (Fast Iteration)

Use this when you want quick local iteration and don’t need a migration history. This directly reconciles the database schema to match `schema.ts`.

- `npm run db:push`

Use cases:

- Fast local prototyping
- Throwaway databases

Avoid:

- Production environments
- Shared/staging databases where you want an auditable history

### Migration-Based (Tracked Schema Changes)

Use this when you want migration files checked into the repo and repeatable schema updates across environments.

- Generate: `npm run db:generate`
- Apply: `npm run db:migrate`

Recommended workflow:

1. Update the schema in [schema.ts](../../src/lib/db/schema.ts).
2. Generate a migration with `npm run db:generate`.
3. Review the generated SQL in [drizzle/](../../drizzle/) before applying.
4. Apply with `npm run db:migrate`.
5. Optional: inspect with `npm run db:studio`.

## Migration Files

Drizzle Kit creates numbered SQL migration files in [drizzle/](../../drizzle/) and stores snapshots/journal in [drizzle/meta/](../../drizzle/meta/).

In general:

- Each generated migration represents the diff from the previous schema snapshot to the current `schema.ts`.
- Migration order is tracked via the journal in `drizzle/meta/`.

## Common Tasks

### Applying migrations

Use `npm run db:migrate` any time you pull schema/migration changes locally, and in any deployment pipeline that updates the database schema.

### Inspecting the current schema/data

Use `npm run db:studio` to open Drizzle Studio against the database pointed at by `DATABASE_URL`.

### Making a safe change

Some schema diffs (dropping columns, changing types, tightening constraints) can be destructive or require data backfills. Always review the generated SQL and consider:

- Backfilling data before adding `NOT NULL` constraints
- Using multi-step migrations (add nullable column → backfill → make not-null)
- Adding indexes concurrently if your deployment environment requires it (Postgres-specific)

## Guidelines

- Prefer small, reviewable migrations over large schema overhauls.
- Keep schema changes and corresponding app changes in the same PR to avoid drift.
- If you add constraints or uniqueness requirements, make sure API validation matches them to avoid confusing runtime errors.
