# Architecture Overview

WatchThis is a Next.js App Router application that combines server-rendered pages with small client-side “islands” for interactive experiences. Most domain logic lives in `src/lib/*` services, which are called by `src/app/api/**/route.ts` handlers and (in some cases) by server components.

## High-Level Components

- **App Router UI**: `src/app/**` pages and layouts define routes and compose UI.
- **Client Providers**: global client-side state and caching is provided via React Query and an auth context.
- **API Routes**: `src/app/api/**/route.ts` implements JSON endpoints, generally thin wrappers around service modules.
- **Domain Services**: `src/lib/*/service.ts` implements business logic and persistence.
- **Database Layer**: Drizzle schema + client in `src/lib/db`.
- **External Integrations**: TMDB + JustWatch wrappers live in `src/lib/tmdb` and API routes under `src/app/api/tmdb` and `src/app/api/watch`.

## Request Flows

### Server-Rendered Page

```mermaid
sequenceDiagram
  participant Browser
  participant Next as Next.js (RSC)
  participant DB as Postgres (Drizzle)
  Browser->>Next: GET /dashboard
  Next->>Next: Read session cookie
  Next->>DB: Fetch data (services/queries)
  DB-->>Next: Rows
  Next-->>Browser: HTML + RSC payload
```

### Client Interaction (Island → API)

```mermaid
sequenceDiagram
  participant UI as Client Component
  participant API as /api/* route.ts
  participant Svc as src/lib/* service
  participant DB as Postgres (Drizzle)
  UI->>API: Fetch/Mutate JSON (cookie session)
  API->>Svc: Call domain service
  Svc->>DB: Query/Update
  DB-->>Svc: Result
  Svc-->>API: Domain result
  API-->>UI: JSON response
```

## Code Organization (What Goes Where)

- **Routing + composition**: `src/app/*`
- **Reusable UI**: `src/components/*`
- **Domain logic**: `src/lib/*`
- **Cross-cutting utilities**: `src/lib/utils.ts`
- **Schema + DB client**: `src/lib/db/schema.ts`, `src/lib/db/index.ts`
