# Profile Domain

Profile is the authenticated user’s “account + preferences” area. It owns:

- Profile identity: username and profile picture URL
- Locale preferences: timezone, plus country/region for watch-provider filters
- Passkey device management: list devices, generate claim codes, delete devices
- Data portability: export/import user state
- Streaming provider selection per region

This domain is mostly “settings” UI plus a small set of authenticated APIs and services. It also integrates with the Auth domain for session state and WebAuthn/passkey registration.

## Primary References

- UI page entry: [profile/page.tsx](../../src/app/%28authenticated%29/profile/page.tsx)
- UI composition: [ProfileClient.tsx](../../src/components/profile/ProfileClient.tsx)
- UI feature components: [src/components/profile](../../src/components/profile)
- APIs: [src/app/api/profile](../../src/app/api/profile)
- Services: [src/lib/profile](../../src/lib/profile)
- Session read/update API (used by profile settings): [session/route.ts](../../src/app/api/auth/session/route.ts)
- Auth context that caches session and streaming prefs: [AuthProvider.tsx](../../src/components/providers/AuthProvider.tsx)

## Data Model

Profile data is stored primarily on the `users` row, with additional tables for passkeys and streaming providers.

- `users`
  - `username` (unique; 3–50 chars validated in API)
  - `profilePictureUrl` (nullable; max 500 chars; must be a valid URL when set)
  - `timezone` (non-empty string; default `"UTC"`; validated via `Intl.DateTimeFormat`)
  - `country` (nullable; 2-letter ISO country code; used for streaming prefs)
  - Source: [schema.ts (users)](../../src/lib/db/schema.ts)
- `passkey_credentials`
  - One row per registered passkey/device; “deletion” is soft via `deletedAt`
  - `deviceName` is optional; `lastUsed` is tracked
  - Source: [schema.ts (passkeyCredentials)](../../src/lib/db/schema.ts)
- `passkey_claims`
  - Temporary claim objects used to add a passkey from another device
  - Fields: `claimCode` (unique), `status`, `initiator`, `expiresAt`, `consumedAt`
  - Source: [schema.ts (passkeyClaims)](../../src/lib/db/schema.ts)
- `user_streaming_providers`
  - Saved provider selections per `region` (2-letter code)
  - Providers are stored as `{ providerId, providerName, logoPath }` for the region
  - Source: [schema.ts (userStreamingProviders)](../../src/lib/db/schema.ts)
- `activity_feed`
  - Profile-related flows emit activity events (e.g., claim generated, passkey deleted, profile import)
  - Source: [schema.ts (activityFeed)](../../src/lib/db/schema.ts)

## UI Structure

The Profile page is a server component that renders a single client “island” which handles tab navigation and interactive updates.

- Entry point: [profile/page.tsx](../../src/app/%28authenticated%29/profile/page.tsx)
- Client shell + tabs: [ProfileClient](../../src/components/profile/ProfileClient.tsx)
  - “Profile” tab
    - Username: [UsernameChanger](../../src/components/profile/UsernameChanger.tsx)
    - Profile picture URL: [ProfilePictureManager](../../src/components/profile/ProfilePictureManager.tsx)
    - Timezone: [TimezoneSelector](../../src/components/profile/TimezoneSelector.tsx)
  - “Security” tab
    - Passkey devices: [PasskeyDevicesViewer](../../src/components/profile/PasskeyDevicesViewer.tsx)
  - “Data Management” tab
    - Import/export: [DataExportImport](../../src/components/profile/DataExportImport.tsx)
  - “Streaming” tab
    - Country/region + providers: [StreamingPreferences](../../src/components/profile/StreamingPreferences.tsx)

## APIs

All profile APIs are authenticated. Profile uses `withAuth` middleware to guarantee `request.user` exists on protected routes.

### Session (profile fields)

Profile settings update the current user via the session endpoint:

- `GET /api/auth/session`
  - Response: `{ user: { id, username, profilePictureUrl, timezone, createdAt } }`
  - Implementation: [session/route.ts](../../src/app/api/auth/session/route.ts)
- `PUT /api/auth/session`
  - Request JSON (any subset): `{ username?, profilePictureUrl?, timezone? }`
  - Validation:
    - `username`: `/^[a-zA-Z0-9_-]{3,50}$/`, must be unique (409 if taken)
    - `profilePictureUrl`: `null` or URL string; max 500 chars; parsed with `new URL(...)`
    - `timezone`: validated via `Intl.DateTimeFormat(..., { timeZone })`
  - Response: `{ success: true, user: { ...same fields... } }`
  - Implementation: [session/route.ts](../../src/app/api/auth/session/route.ts)

### Passkey devices

These routes manage the authenticated user’s registered passkeys and the “claim” mechanism for adding additional devices.

- `GET /api/profile/devices`
  - Response: `{ devices: PasskeyDevice[] }`
  - Device shape: `{ id, credentialId, deviceName, createdAt, lastUsed }` (timestamps are ISO strings)
  - Route: [devices/route.ts](../../src/app/api/profile/devices/route.ts)
  - Service: [listDevices](../../src/lib/profile/devices/service.ts)
- `POST /api/profile/devices`
  - Creates a new passkey claim to be consumed on another device
  - Response: `{ claimId, claimCode, token, magicLink, qrPayload, expiresAt }`
  - Guardrails:
    - Max active devices: 10
    - Rate limit for user-initiated claims: 5 per hour (returns 429)
    - Claim expiry: 10 minutes
  - Route: [devices/route.ts](../../src/app/api/profile/devices/route.ts)
  - Service: [initiateClaim](../../src/lib/profile/devices/service.ts)
- `DELETE /api/profile/devices/claims/[id]`
  - Cancels an active claim (404 if missing)
  - Route: [claims/[id]/route.ts](../../src/app/api/profile/devices/claims/%5Bid%5D/route.ts)
  - Service: [cancelClaim](../../src/lib/profile/devices/service.ts)
- `DELETE /api/profile/devices/[id]`
  - Soft-deletes a passkey credential for the user
  - Guardrails:
    - Cannot delete the last remaining passkey (400)
  - Route: [devices/[id]/route.ts](../../src/app/api/profile/devices/%5Bid%5D/route.ts)
  - Service: [deletePasskey](../../src/lib/profile/devices/service.ts)

Cross-domain integration (Auth/WebAuthn):

- Claim consumption happens on `/auth/claim` UI, using:
  - Begin: [api/auth/claim/begin](../../src/app/api/auth/claim/begin/route.ts)
  - Verify: [api/auth/claim/verify](../../src/app/api/auth/claim/verify/route.ts)

### Import / Export

- `GET /api/profile/export?format=json|csv`
  - Response: `{ data, filename, mimetype }`
    - `json`: `data` is a JSON string of the export model
    - `csv`: `data` is a base64-encoded ZIP containing CSV files
  - Route: [export/route.ts](../../src/app/api/profile/export/route.ts)
  - Service: [exportUserData](../../src/lib/profile/data/service.ts)
  - Types: [data/types.ts](../../src/lib/profile/data/types.ts)
- `POST /api/profile/import`
  - Accepts `multipart/form-data` with:
    - `file`: the uploaded file
    - `format`: must be `"json"` (imports only support JSON today)
  - Response: `ImportResult` with per-table counts and errors (400 on parse errors)
  - Route: [import/route.ts](../../src/app/api/profile/import/route.ts)
  - Service: [importUserData](../../src/lib/profile/data/service.ts)
  - Types: [data/types.ts](../../src/lib/profile/data/types.ts)

### Streaming preferences

Profile stores a user’s country and selected streaming providers (per region), which downstream recommendation/watch pages can use as filters.

- `GET /api/profile/streaming`
  - Response: `{ country, providers[] }`
  - Route: [streaming/route.ts](../../src/app/api/profile/streaming/route.ts)
  - Service: [getStreamingPreferences](../../src/lib/profile/streaming/service.ts)
- `POST /api/profile/streaming`
  - Request JSON: `{ country?, region?, providers? }`
    - `country` and `region` are validated as 2-letter codes
    - When `providers` is provided, `region` is required (defaults to `country` when omitted)
    - Providers are limited to 50 per region
  - Response: updated `{ country, providers[] }`
  - Route: [streaming/route.ts](../../src/app/api/profile/streaming/route.ts)
  - Service: [updateStreamingPreferences](../../src/lib/profile/streaming/service.ts)
  - Types: [streaming/types.ts](../../src/lib/profile/streaming/types.ts)

## Submodules

- `src/lib/profile/devices`
  - Responsibilities: list devices, generate claims, cancel claims, soft-delete credentials
  - Entry points: [devices/service.ts](../../src/lib/profile/devices/service.ts), [devices/types.ts](../../src/lib/profile/devices/types.ts)
- `src/lib/profile/data`
  - Responsibilities: export user lists/status/schedules (JSON or CSV ZIP), import from JSON
  - Entry points: [data/service.ts](../../src/lib/profile/data/service.ts), [data/types.ts](../../src/lib/profile/data/types.ts)
- `src/lib/profile/streaming`
  - Responsibilities: persist country + providers per region
  - Entry points: [streaming/service.ts](../../src/lib/profile/streaming/service.ts), [streaming/types.ts](../../src/lib/profile/streaming/types.ts)

## Domain Flows

```mermaid
flowchart TD
  A[Profile UI] --> B[/api/auth/session\nusername / profilePictureUrl / timezone]
  A --> C[/api/profile/devices\nlist / add claim / delete device]
  A --> D[/api/profile/streaming\ncountry + providers]
  A --> E[/api/profile/export\njson|csv]
  A --> F[/api/profile/import\njson]
  C --> G[/api/auth/claim/*\nconsume claim on other device]
```

### Export / Import behavior

- Export contents (both JSON + CSV):
  - Lists (`lists`) and list items (`list_items`)
  - Watch status (`user_content_status`)
  - Episode watch status (`episode_watch_status`)
  - TV show schedules (`show_schedules`)
  - Export model: [data/types.ts](../../src/lib/profile/data/types.ts)
- Export exclusions (not part of the data portability feature today):
  - Passkeys/devices, streaming providers, username/profile picture/timezone
- Export JSON format:
  - `data` is a stringified `JSONExportModel` (pretty-printed JSON)
  - Lists include nested `items` array
  - List items also include `title` and `releaseDate` from `tmdb_cache` when available; otherwise `title` falls back to `"Unknown Title"` and `releaseDate` may be empty
  - Filename pattern: `watch-this-export-YYYY-MM-DD.json`
- Export CSV ZIP format:
  - `data` is a base64-encoded ZIP containing these files: `lists.csv`, `list_items.csv`, `content_status.csv`, `episode_status.csv`, `tv_show_schedules.csv`
  - CSV values are JSON-escaped (each cell uses `JSON.stringify`), so commas/quotes/newlines are preserved
  - Filename pattern: `watch-this-export-YYYY-MM-DD.zip`
- Import format:
  - Only JSON imports are accepted by the API and UI: [DataExportImport](../../src/components/profile/DataExportImport.tsx)
  - Extra fields in the JSON are ignored (the importer only reads the fields it needs)
- Import semantics (conflicts + validation):
  - Lists are upserted by list `id` (existing lists are updated)
  - List items are inserted with conflict-ignore; duplicates for the same list are skipped
  - Before inserting each list item, the importer attempts to hydrate `tmdb_cache` via TMDB (`addToCache`). If cache hydration fails, that list item is skipped and an error entry is recorded
  - Content status is upserted by `(userId, tmdbId, contentType)`; incoming rows overwrite `status`/`updatedAt`
  - Episode status is upserted by `(userId, tmdbId, seasonNumber, episodeNumber)`; incoming rows overwrite `watched`/`watchedAt`/`updatedAt`
  - Schedules are upserted by `(userId, tmdbId, dayOfWeek)`; incoming rows overwrite `updatedAt`
  - The response includes per-table “imported” counters plus an `errors[]` list; individual failures do not abort the whole import
  - A `PROFILE_IMPORT` activity entry is written with import counts and error count

### Streaming providers behavior

- Catalog source and merging:
  - Regions are fetched from TMDB via [watch/regions/route.ts](../../src/app/api/watch/regions/route.ts)
  - Providers are fetched from TMDB separately for movies and TV, then merged and de-duplicated by `provider_id`: [watch/providers/route.ts](../../src/app/api/watch/providers/route.ts)
- UI behavior:
  - The Profile UI uses [StreamingPreferences](../../src/components/profile/StreamingPreferences.tsx)
  - Selecting a country sets `country` and also sets `region = country.toUpperCase()`
  - Changing country clears the current selection (it does not auto-apply previously saved providers for the new region)
  - Provider list supports search filtering and pagination (20 providers per page)
- Persistence behavior:
  - Saving preferences sends the selected providers for the current `region` plus the user’s `country`: [StreamingPreferences](../../src/components/profile/StreamingPreferences.tsx)
  - On save, the server:
    - Updates `users.country` when `country` is provided
    - Replaces providers for that `region` by deleting existing rows in `user_streaming_providers` for `(userId, region)` and inserting the new selection (up to 50)
  - `GET /api/profile/streaming` returns all saved provider rows across regions; each provider entry includes its `region`
- Client caching:
  - Streaming preferences are loaded and cached in [AuthProvider](../../src/components/providers/AuthProvider.tsx) (separate from the session/user object)
  - After saving, the UI refreshes the cached preferences via `refreshStreamingPreferences()`

### Passkey claim lifecycle (high level)

- User starts claim from Profile → claim code + magic link are generated (`expiresAt` ~10 minutes)
- Another device uses the magic link/token to begin/verify WebAuthn registration
- Claim is consumed (or can be cancelled) and the new credential is added for the same user

## Known Constraints & Guardrails

- Username: unique; validated in [session/route.ts](../../src/app/api/auth/session/route.ts)
- Timezone: validated via `Intl` (invalid zones are rejected)
- Passkeys:
  - Max 10 active devices
  - Cannot delete the last active device
  - Claim generation rate-limited for user initiator (5/hour)
- Import:
  - Only JSON imports are supported
  - Export supports JSON and CSV (CSV is returned as a base64 ZIP payload)
