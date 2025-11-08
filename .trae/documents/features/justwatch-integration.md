# JustWatch Streaming Providers Integration (TMDB Proxy)

## Overview

Add streaming availability to content browsing by integrating TMDB’s JustWatch proxy endpoints. Users select their country and subscribed streaming providers; the app then surfaces whether a movie or TV show is available on any of their services. If none match, show which providers in their country do have the title, styled as unavailable.

## Goals

- Let users set a country and subscribed streaming services for that country.

- Display streaming availability in the content Overview, prioritizing subscribed providers.

- Use TMDB endpoints to fetch regions, provider catalogs per region, and title-specific watch providers.

- Keep UI fast via caching and avoid rate limits; gracefully handle missing data.

## Non‑Goals

- Do not implement playback deep links (e.g., opening Netflix app).

- Do not implement unified account linking to providers.

- Do not build any code until this spec is approved.

## User Experience

### Profile: Streaming Preferences

- Location: Add a new tab/page within `ProfileClient` (e.g., “Streaming”).

- Country selector:
  - Dropdown populated from TMDB `GET /watch/providers/regions`.

  - Stores ISO 3166‑1 alpha‑2 code (e.g., `US`, `GB`, `DE`).

- Provider multi-select:
  - After selecting a country, fetch available providers for that region from:
    - `GET /watch/providers/movie?watch_region={COUNTRY}`

    - `GET /watch/providers/tv?watch_region={COUNTRY}`

  - Merge and de‑duplicate provider lists (providers are identified by `provider_id`).

  - Present providers with logo, display name, and a checkbox.

  - Primary intent is subscription/flat‑rate providers; rentals/purchases are out of scope for subscription selection.

- Save button:
  - Persists country and selected provider IDs to user preferences.

### Content Details: Streaming Section

- Location: New “Streaming” subheading within Overview in `ContentDetailsModal`.

- Data source for a given title:
  - Option A (recommended): Append `watch/providers` in details call using `append_to_response`.
    - Movies: `GET /movie/{id}?append_to_response=watch/providers`

    - TV: `GET /tv/{id}?append_to_response=watch/providers`

  - Option B: Separate call:
    - Movies: `GET /movie/{id}/watch/providers`

    - TV: `GET /tv/{id}/watch/providers`

- Rendering logic:
  - Use the user’s `country` to select the region block from the providers response.

  - Identify providers that have the title for access types we care about (primarily `flatrate`; optionally include `ads`/`free` as available).

  - Intersect with the user’s subscribed provider IDs:
    - If matches exist: show those providers prominently (logo, name).

    - If none match: show the providers available in country but style them as unavailable (gray/low opacity) with a hint that you don’t subscribe.

  - If the title has no providers in that country: show a clear “Not available in your region” message.

  - The user's streaming country and subscribed providers should be stored in user context in the app and not re-fetched any time a different `ContentDetailsModal` is opened

## Data Model (Drizzle)

### users (existing)

- Add `country` (or `watchCountry`) column:
  - Type: `varchar(2)` ISO 3166‑1 alpha‑2, nullable with default `NULL`.

  - Purpose: Stores the chosen country for streaming providers filtering.

### New table: user_streaming_providers

- Purpose: Track providers a user subscribes to for their country.

- Suggested schema:
  - `id`: `uuid` primary key.

  - `user_id`: `uuid` FK → `users.id` (cascade delete).

  - `provider_id`: `integer` (TMDB provider ID).

  - `provider_name`: `varchar(100)` (optional cache of display name; for convenience/UI fallbacks).

  - `logo_path`: `varchar(255)` (optional; TMDB image path, e.g., `/xYExxx.png`).

  - `region`: `varchar(2)` ISO 3166‑1 (to support users changing country; entries are region‑specific).

  - `created_at`: `timestamp with time zone` default now.

  - Unique constraint: (`user_id`, `provider_id`, `region`).

- Relations: many‑to‑one from `user_streaming_providers` → `users`.

Notes:

- We store `provider_id` once for both movie/TV since TMDB provider IDs are shared across types.

- We do not store access type here; we assume subscription indicates interest in `flatrate` access.

## API Integration (Server Routes)

### External: TMDB endpoints

- `GET /watch/providers/regions`
  - Returns available countries. Use `language=en-US` for consistent naming.

- `GET /watch/providers/movie?watch_region={COUNTRY}&language=en-US`

- `GET /watch/providers/tv?watch_region={COUNTRY}&language=en-US`

- Title‑specific:
  - `GET /movie/{id}?append_to_response=watch/providers&language=en-US`

  - `GET /tv/{id}?append_to_response=watch/providers&language=en-US`

  - OR `GET /movie/{id}/watch/providers` / `GET /tv/{id}/watch/providers`.

### Internal routes (proposed)

- `GET /api/watch/regions` → proxy TMDB regions; cache for 24h.

- `GET /api/watch/providers?region=US` → merge movie+tv providers for region; cache for 24h.

- `GET /api/profile/streaming` → return `{ country, providers: Provider[] }`.

- `POST /api/profile/streaming` → body `{ country, providerIds }`; upsert country and replace provider selections atomically.

Caching:

- Regions/providers change infrequently; use in‑memory cache (per process) plus optional persistent cache table, or edge cache if available.

- Title providers can be cached per content ID+region for a short TTL (e.g., 6–24h) to minimize repeated calls.

## UI Details

### ProfileClient: Streaming tab

- Components:
  - CountrySelector (new): dropdown fed by `/api/watch/regions`.

  - ProviderSelector (new): grid of provider cards with logo and checkbox from `/api/watch/providers?region=XX`.

  - Save/Reset buttons.

- Styling: match existing components. Use provider logos via `https://image.tmdb.org/t/p/w92{logo_path}` with sensible fallbacks.

- Behavior:
  - Changing country refreshes provider list and clears selections unless preserved with a user prompt.

  - Persist on save; refresh session data if country stored on user.

### ContentDetailsModal: Streaming section

- Placement: Under Overview → “Streaming”.

- Display format:
  - “Available on your services” → list of subscribed providers that have the title.

  - “Also available in {COUNTRY}” (dimmed) → other providers in region offering the title.

  - Each provider: logo + name; tooltip or sublabel for access type (`flatrate`, `ads`, `free`).

## Logic & Edge Cases

- No country set: prompt in Streaming section to set preferences (link to Profile → Streaming).

- Country set, no subscriptions: show available providers in country dimmed.

- Title unavailable in region: show “Not available in your region”.

- Provider data anomalies: fall back to names without logos; de‑duplicate by `provider_id`.

- User changes country: preserve previous selections in DB (region‑scoped), or optionally clear; this spec assumes region‑scoped records.

## Performance & Reliability

- Use aggregation and client‑side filtering to avoid multiple network calls per render.

- Prefer `append_to_response=watch/providers` to avoid extra requests when fetching details.

- Implement exponential backoff and error handling for TMDB rate limits.

- Memoize results per content ID+region within session.

## Security & Privacy

- Country and provider selections are user preferences; treat as standard profile data.

- Do not share preferences with other users.

- Validate and sanitize inputs; provider IDs must be integers from TMDB responses.

## Rollout

1. Add DB schema changes and migrations.
2. Implement internal routes with caching.
3. Build Profile → Streaming preferences UI.
4. Add Streaming section to ContentDetailsModal Overview.
5. QA, flag behind feature toggle if needed, then enable for all users.

## Open Questions

- Should we include `ads`/`free` providers as “available” even if not subscribed? Proposed: show as available but marked with an indicator (e.g., “with ads”).
  - Yes, include these providers with distinct styling

- Do we need per‑profile multi‑country support for users traveling? Proposed: single country preference for v1.
  - No, single country per-user
