# JustWatch / Streaming Provider Integration

WatchThis surfaces streaming availability and provider discovery. Provider and region data is fetched via TMDB “watch providers” endpoints, which are powered by JustWatch data.

Primary references:

- Watch API routes: [src/app/api/watch](../../src/app/api/watch)
- TMDB client: [tmdb/client.ts](../../src/lib/tmdb/client.ts)
- User provider preferences: [src/lib/profile/streaming](../../src/lib/profile/streaming)

## Capabilities

- List available regions
- List providers available in a region
- Fetch provider availability for a specific piece of content in a region
- Store user-selected providers per region (used for filtering and UX)

## API Overview (Conceptual)

```mermaid
flowchart TD
  A[/api/watch/regions] --> B[Supported regions]
  C[/api/watch/providers?region=US] --> D[Providers list]
  E[/api/watch/content?type=movie|tv&id=...&region=US] --> F[Availability for content]
  G[/api/profile/streaming] --> H[User provider preferences]
```

## Attribution

See the project-level attribution section in [README.md](../../README.md#L106-L110).
