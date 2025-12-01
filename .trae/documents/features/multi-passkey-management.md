# Multi-Passkey Management

## Summary

Enable users to register, view, and manage multiple passkeys per account, including a secure cross-device flow to add an additional passkey via claim codes, a magic link, and QR code. Provide an admin-only API backdoor to help users recover access when all passkeys are lost.

## Goals

* Support registering additional passkeys on other devices without existing session on that device

* Display all passkeys with OS and version metadata for clarity

* Allow deletion of a passkey when more than one exists

* Provide an admin backdoor to generate a claim code and magic link for a user in recovery

* Preserve and build upon existing WebAuthn and JWT utilities

## Non-Goals

* Password-based login or recovery

* E2E encrypted device metadata

* UI for admin backdoor

## User Stories

* As a user, I initiate adding a new passkey from profile and receive a magic link plus QR code

* As a user, I register the new passkey on another device using the link/QR flow

* As a user, I view all passkeys with OS/version and last-used info

* As a user, I delete a passkey when I have more than one

* As an admin, I generate a claim code + magic link for a user with no passkeys

## High-Level Architecture

* Claim generation (authenticated user or admin) creates a one-time, short-lived claim record and signed token

* Cross-device flow uses a magic link/QR that opens the app on the other device and begins registration for the target user

* Registration for an additional passkey reuses WebAuthn options but associates the credential to the existing user rather than creating a new user

* Device metadata (OS, version, browser) captured at registration and stored with the credential; viewer displays it

* Deletion enforced only when more than one credential remains

## Data Model Changes

Add a new table and extend `passkey_credentials`.

* New table: `passkey_claims`

  * `id` (uuid, pk)

  * `user_id` (uuid, fk → users.id)

  * `claim_code` (varchar, unique) – human-friendly code (e.g., 10–12 chars)

  * `status` (varchar enum: `active`, `consumed`, `cancelled`)

  * `expires_at` (timestamptz) – default 10 minutes

  * `created_at` (timestamptz, default now)

  * `consumed_at` (timestamptz, nullable)

  * `initiator` (varchar enum: `user`, `admin`)

* Extend `passkey_credentials` (src/lib/db/schema.ts:30–46)

  * Add `deleted_at` (timestamptz, nullable) – soft delete for audit

  * Use existing `device_name` property for device name with operating system and version (as currently done in auth page ln 64-70

Notes:

* Keep cascade behavior; soft delete is preferred for audit and recovery

* Consider unique `(user_id, credential_id)` already enforced by credentialId unique

## API Design

All authenticated routes use `withAuth` per project standards. Admin backdoor route requires a shared secret.

* `POST /api/profile/devices` (auth required)

  * Purpose: Create a claim and return `{ claimCode, token, magicLink, qrPayload, expiresAt }`

  * Validations: user has ≥1 passkey, rate-limit per user

  * Implementation: Create `passkey_claims` row; sign token with JWT (see `createChallengeToken` in src/lib/auth/webauthn.ts:212–223; introduce a dedicated claim token function to include `claimId` and `userId`)

* `GET /api/auth/claim/begin?token=...` (no session required)

  * Purpose: Validate claim token and generate registration options for existing user

  * Returns: `{ options }` compatible with `@simplewebauthn/browser` `startRegistration`

* `POST /api/auth/claim/verify` (no session required)

  * Body: `{ token, registrationResponse, deviceName? }`

  * Purpose: Verify registration response, associate credential to user from claim,  mark claim as `consumed`

  * Returns: `{ success: true }`

* `GET /api/profile/devices` (auth required)

  * Existing route returns `{ devices }`.&#x20;

* `DELETE /api/profile/devices/:id` (auth required)

  * Purpose: Soft-delete a credential; require that the user has ≥2 active credentials

  * Returns: `{ success: true }`

* `POST /api/admin/device-claim` (admin backdoor; API-only)

  * Headers: `X-Admin-Secret: <env ADMIN_API_SECRET>`

  * Body: `{ username | userId }`

  * Returns: same payload as user-initiated endpoint

  * No UI; log usage for audit

## Frontend UX (Profile)

File: `src/components/profile/PasskeyDevicesViewer.tsx`

* Add “Add Passkey” button (top-right)

  * On click: call `POST /api/profile/devices`

  * Show modal with:

    * Magic link (copyable)

    * QR code rendering the magic link

    * Expiration countdown

    * “Cancel” button to revoke claim (optional follow-up)

  * Background polling: every 3–5s refetch `/api/profile/devices` to detect completion and auto-close modal

* Devices list

  * Show device icon (mobile/desktop) and name as today

  * Keep “Added” timestamp and “Last used” relative time

  * Per-device actions:

    * If user has ≥2 devices: show “Delete” → calls `DELETE /api/profile/devices/:id`

    * If user has 1 device: disable delete with tooltip “At least one passkey is required”

## Client Integration

File: `src/lib/auth/client.ts`

* Reuse `@simplewebauthn/browser`

* New functions:

  * `initiatePasskeyClaim()` → fetch user-initiated claim

  * `beginClaimRegistration(token)` → fetch options from `/api/auth/claim/begin`

  * `verifyClaimRegistration({ token, registrationResponse, deviceName })` → call `/api/auth/claim/verify`

Existing references:

* Registration flow exists at src/lib/auth/client.ts:16–66

* Authentication flow exists at src/lib/auth/client.ts:69–107

## Server Integration

File: `src/lib/auth/webauthn.ts`

* New server helpers:

  * `generateAdditionalPasskeyRegistrationOptions(userId)` – similar to `generatePasskeyRegistrationOptions` (src/lib/auth/webauthn.ts:36–63) but does not check username uniqueness and sets `userName` to existing `users.username`

  * `verifyAdditionalPasskeyRegistration({ userId, registrationResponse, expectedChallenge, deviceName})` – similar to `verifyPasskeyRegistration` (src/lib/auth/webauthn.ts:66–118) but only inserts into `passkey_credentials`

  * `createClaimToken({ claimId, userId })` and `verifyClaimToken(token)` – modeled on `createChallengeToken` (src/lib/auth/webauthn.ts:212–223) and `verifyChallengeToken` (src/lib/auth/webauthn.ts:226–237) with 10-minute TTL

* Authentication unchanged:

  * `generatePasskeyAuthenticationOptions` (src/lib/auth/webauthn.ts:121–129)

  * `verifyPasskeyAuthentication` (src/lib/auth/webauthn.ts:132–181)

## Security Considerations

* Claim token is a signed JWT containing `claimId` and `userId`; TTL 10 minutes

* One-time use: mark claim as `consumed` after successful verification

* Expiration enforcement: refuse `begin` and `verify` after `expires_at`

* Rate-limit claim initiation (e.g., 5 per hour per user)

* Magic link format: `${ORIGIN}/auth/claim?token=<JWT>` (ORIGIN from env; see src/lib/auth/webauthn.ts:23–26)

* Avoid exposing raw `userId` or credential data in the link; token-based only

* Admin backdoor protected with `X-Admin-Secret` env value; audit all uses

* Deletion guard: require ≥2 active credentials; soft delete with `deleted_at`

* Verify ownership on delete (compare `userId`) and block cross-user operations

## Error Handling

* Consistent error responses with messages suitable for UI

* Use `withAuth` for all authenticated APIs

* On UI: show inline alerts (existing pattern in `PasskeyDevicesViewer.tsx`) and allow retry

* Backend logs for claim creation, consumption, and deletion errors

## Telemetry & Audit

* Activity feed entries (optional but recommended):

  * `claim_generated` (by user/admin)

  * `claim_consumed` (new passkey added)

  * `device_deleted`

* Include `metadata` with initiating method, device info, and timestamps

## Edge Cases

* Attempt to delete the only remaining passkey → block with clear message

* Claim used multiple times → only first succeeds; subsequent attempts fail

* Claim expired before use → show expiration message and allow generating a new one

* Max devices per user (optional): enforce a sane limit (e.g., 10)

## Testing Plan

* Unit tests

  * Claim initiation: creation, TTL, token signing/verification

  * Begin/verify additional registration: success path and failure modes

  * Device metadata parsing with varied UA samples

  * Deletion: guard when only 1 credential, ownership checks

* UI tests

  * Modal rendering, QR generation, polling completion, error states

## Migration Plan

* Drizzle migrations for `passkey_claims` and `passkey_credentials` extensions

## Implementation Outline

* Backend

  * Add `passkey_claims` schema and queries

  * Add endpoints: initiate claim (user/admin), claim begin, claim verify, delete passkey

  * Add helpers in `webauthn.ts` for additional registration and claim token utilities

  * Extend device listing service to return metadata (src/lib/profile/devices/service.ts:6–32)

* Frontend

  * Update `PasskeyDevicesViewer` to add button, modal with link/QR, polling

  * Render OS/version in device list, gate delete action

## Assumptions

* `ADMIN_API_SECRET` available in environment for admin backdoor

* Users table does not have roles; admin access is via shared secret only

* ORIGIN/RP\_ID configuration remains unchanged; multi-device registration uses platform authenticators on the second device

* Soft delete is acceptable; full removal can be done via maintenance scripts if needed

## Deliverables

* API endpoints and server utilities with tests

* Updated DB schema and migrations

* Updated profile UI with modal and device metadata

* Feature flags and environment variable documentation

