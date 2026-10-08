# WatchThis

Movie and TV watchlists for you and your friends, with passkey security, shared lists, and activity tracking.

## Features

- Shared lists with optional watch-status sync
- Activity feed to see what friends watched and added
- TV show scheduling and episode tracking
- Import/export for watch status
- Streaming-provider discovery via JustWatch (per-user configuration)
- TMDB-powered search, details, cast, and recommendations

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, React Aria Components, TanStack Query
- PostgreSQL + Drizzle ORM
- WebAuthn / passkeys via SimpleWebAuthn
- Vitest + React Testing Library

## Prerequisites

- Node.js 20.9+ (Next.js 16 requirement; CI runs 20.x)
- pnpm -- the exact version is pinned by `packageManager` in `package.json`, and
  any pnpm from 9.7 on switches to it automatically
- PostgreSQL
- TMDB API key

## Quick start

1. Install dependencies

```bash
pnpm install
```

2. Create your environment file

macOS / Linux:

```bash
cp .env.example .env.local
```

Windows (PowerShell):

```powershell
Copy-Item .env.example .env.local
```

3. Update `.env.local`

At minimum, set `DATABASE_URL` and `TMDB_API_KEY`.

4. Set up the database

For development, the simplest approach is to push the schema:

```bash
pnpm db:push
```

If you want migrations instead:

```bash
pnpm db:generate
pnpm db:migrate
```

5. Run the app

```bash
pnpm dev
```

Open http://localhost:3000

## Technical documentation

- Technical docs: [docs/README.md](docs/README.md)
- OpenAPI schema: [openapi.yaml](docs/api/openapi.yaml)

## Configuration

See [.env.example](.env.example) for the full list. Common variables:

| Variable             | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                                        |
| `TMDB_API_KEY`       | TMDB API key used for search/details/recommendations                |
| `SITE_URL`           | Public base URL, for canonical/OG/sitemap URLs                      |
| `WEBAUTHN_RP_ID`     | Relying Party ID (domain), e.g. `localhost`                         |
| `WEBAUTHN_ORIGIN`    | WebAuthn origin, e.g. `http://localhost:3000`                       |
| `WEBAUTHN_SECRET`    | Secret for session/signing (do not commit)                          |
| `ADMIN_API_SECRET`   | Gates `POST /api/admin/device-claim`; unset disables the endpoint    |

`WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` fall back to localhost only outside
production. A production deploy without them fails loudly rather than
validating passkey ceremonies against `localhost`.

## Scripts

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `pnpm dev`           | Start dev server (Turbopack) |
| `pnpm build`         | Build for production         |
| `pnpm start`         | Start production server      |
| `pnpm lint`          | Run ESLint                   |
| `pnpm test`          | Run tests once (CI-friendly) |
| `pnpm test:coverage` | Run tests with a v8 coverage report and thresholds |
| `pnpm test:watch`    | Run tests in watch mode      |
| `pnpm test:ui`       | Run tests with Vitest UI     |
| `pnpm db:generate`   | Generate Drizzle migrations  |
| `pnpm db:migrate`    | Apply Drizzle migrations     |
| `pnpm db:push`       | Push schema directly (dev)   |
| `pnpm db:studio`     | Open Drizzle Studio          |

## Data sources & attribution

- TMDB: This product uses the TMDB API but is not endorsed or certified by TMDB.
- JustWatch: Used for provider availability and discovery.

## Roadmap

Completed highlights:

- TV show scheduling, episode tracking, and watch status
- Shared lists, watch-status sync, and list archiving
- Activity feed and recommendations
- JustWatch integration + per-user streaming preferences
- Import/export of user data for easy transfer
- Public splash page

Planned:

- Trial accounts with no initial passkeys (7-day window)
- Recently-returned section & home page recommendations
- “Wrapped”-style stats for seasons/years
- Optional \*arr stack integration when content is unavailable
