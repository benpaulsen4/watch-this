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

- Node.js 18+
- PostgreSQL
- TMDB API key

## Quick start

1. Install dependencies

```bash
npm install
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
npm run db:push
```

If you want migrations instead:

```bash
npm run db:generate
npm run db:migrate
```

5. Run the app

```bash
npm run dev
```

Open http://localhost:3000

## Configuration

See [.env.example](file:///d:/watch-this/.env.example) for the full list. Common variables:

| Variable          | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string                                |
| `TMDB_API_KEY`    | TMDB API key used for search/details/recommendations        |
| `APP_URL`         | Public base URL of the app (local: `http://localhost:3000`) |
| `WEBAUTHN_RP_ID`  | Relying Party ID (domain), e.g. `localhost`                 |
| `WEBAUTHN_ORIGIN` | WebAuthn origin, e.g. `http://localhost:3000`               |
| `WEBAUTHN_SECRET` | Secret for session/signing (do not commit)                  |

## Scripts

| Command               | Description                  |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start dev server (Turbopack) |
| `npm run build`       | Build for production         |
| `npm run start`       | Start production server      |
| `npm run lint`        | Run ESLint                   |
| `npm run test`        | Run tests once (CI-friendly) |
| `npm run test:watch`  | Run tests in watch mode      |
| `npm run test:ui`     | Run tests with Vitest UI     |
| `npm run db:generate` | Generate Drizzle migrations  |
| `npm run db:migrate`  | Apply Drizzle migrations     |
| `npm run db:push`     | Push schema directly (dev)   |
| `npm run db:studio`   | Open Drizzle Studio          |

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

Planned:

- Trial accounts with no initial passkeys (7-day window)
- Public splash page
- Recently-returned section & home page recommendations
- “Wrapped”-style stats for seasons/years
- Optional \*arr stack integration when content is unavailable
