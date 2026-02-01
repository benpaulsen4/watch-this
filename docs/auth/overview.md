# Authentication Overview

WatchThis authenticates users with passkeys (WebAuthn) and stores an authenticated session in an HTTP-only cookie.

This document describes the implementation in this repository: routes, cookies, data model, and how to protect endpoints.

## Key Concepts

- **Passkey**: A WebAuthn credential created and verified using SimpleWebAuthn (server + browser).
- **Session**: A stateless JWT (HS256) stored in the `session` httpOnly cookie. The JWT contains `userId` and `username`; server code still loads the user from the DB for each request.
- **Challenge tokens**: WebAuthn challenges are wrapped in short-lived signed JWTs (HS256, 10 minutes) to prevent client-side tampering.
  - For register/authenticate flows, the challenge token is stored in a dedicated httpOnly cookie.
  - For the “claim” flow (adding another device), the challenge token is returned in JSON.

Relevant code:

- WebAuthn + JWT helpers: [webauthn.ts](../../src/lib/auth/webauthn.ts)
- API auth wrapper: [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
- Browser/client helpers: [client.ts](../../src/lib/auth/client.ts)
- Session endpoint: [session route](../../src/app/api/auth/session/route.ts)

## High-Level Flow

```mermaid
flowchart TD
  A[Browser] -->|WebAuthn ceremony| B[Platform Authenticator]
  A -->|Begin: get options| C[/api/auth/*/begin]
  C -->|Set challenge token| D[(challenge cookie or JSON)]
  A -->|Verify response| E[/api/auth/*/verify]
  E -->|Set httpOnly session cookie| F[(session cookie)]
  A -->|Subsequent API calls include cookie| G[/api/*]
  G -->|withAuth validates| H[JWT verify + DB lookup]
```

## Configuration

The WebAuthn relying party (RP) configuration is derived from environment variables in [webauthn.ts](../../src/lib/auth/webauthn.ts#L18-L38):

- `WEBAUTHN_SECRET` (required): HS256 secret used for signing/verifying session and challenge JWTs.
- `WEBAUTHN_RP_NAME` (optional, default `WatchThis`): RP display name.
- `WEBAUTHN_RP_ID` (optional, default `localhost`): RP ID used for WebAuthn verification.
- `WEBAUTHN_ORIGIN` (optional, default `http://localhost:3000`): expected origin used for verification.
- `VERCEL_ENV=preview`: uses `VERCEL_URL` for RP ID and origin (preview deployments).
- `NODE_ENV=production`: controls cookie `secure` flag (cookies are `secure` only in production).

## HTTP API Surface

### Register (create user + first passkey)

- **POST** `/api/auth/register/begin`
  - Validates username and generates WebAuthn registration options.
  - Sets `registration-challenge` httpOnly cookie containing a signed challenge token.
  - Implementation: [register begin](../../src/app/api/auth/register/begin/route.ts)
- **POST** `/api/auth/register/verify`
  - Verifies the `registration-challenge` cookie, verifies attestation, creates `users` + `passkey_credentials`, and sets the `session` cookie.
  - Implementation: [register verify](../../src/app/api/auth/register/verify/route.ts)

### Authenticate (sign in with an existing passkey)

- **GET** `/api/auth/authenticate/begin`
  - Generates WebAuthn authentication options and sets `authentication-challenge` httpOnly cookie.
  - Implementation: [authenticate begin](../../src/app/api/auth/authenticate/begin/route.ts)
- **POST** `/api/auth/authenticate/verify`
  - Verifies `authentication-challenge`, verifies assertion, updates credential counter/last-used, and sets the `session` cookie.
  - Implementation: [authenticate verify](../../src/app/api/auth/authenticate/verify/route.ts)

### Session (check and update profile fields)

- **GET** `/api/auth/session`
  - Reads and validates the `session` cookie and returns user profile fields.
  - Deletes the cookie when invalid.
  - Implementation: [session route](../../src/app/api/auth/session/route.ts)
- **PUT** `/api/auth/session`
  - Same auth check as GET, then updates user profile fields (username/profile picture/timezone).
  - Implementation: [session route](../../src/app/api/auth/session/route.ts)

### Sign out

- **POST** `/api/auth/signout`
  - Deletes `session`, `registration-challenge`, and `authentication-challenge` cookies.
  - Implementation: [signout route](../../src/app/api/auth/signout/route.ts)

### Add another device (claim flow)

This flow lets an already-authenticated user add an additional passkey from another device via a short-lived claim token.

- **POST** `/api/profile/devices` (authenticated)
  - Initiates a claim and returns a claim token (plus other UX data like a magic link).
  - Implementation: [devices route](../../src/app/api/profile/devices/route.ts)
- **GET** `/api/auth/claim/begin?token=...`
  - Verifies the claim token and returns `{ options, challengeToken }` (challenge token is a signed JWT).
  - Implementation: [claim begin](../../src/app/api/auth/claim/begin/route.ts)
- **POST** `/api/auth/claim/verify`
  - Verifies claim token + `challengeToken`, verifies registration response, attaches the new credential, and consumes the claim.
  - Implementation: [claim verify](../../src/app/api/auth/claim/verify/route.ts)

## Cookies

### `session` (session JWT)

Set by register/auth verify routes and read by `withAuth` and `/api/auth/session`.

- `httpOnly: true`
- `secure: process.env.NODE_ENV === "production"`
- `sameSite: "lax"`
- `maxAge: 7 * 24 * 60 * 60` (7 days)
- `path: "/"`

Session token signing/verification helpers:

- [createSessionToken](../../src/lib/auth/webauthn.ts#L313-L324)
- [verifySessionToken](../../src/lib/auth/webauthn.ts#L327-L339)
- [getCurrentUser](../../src/lib/auth/webauthn.ts#L369-L384)

### `registration-challenge` (challenge JWT)

Scoped to registration endpoints only:

- `httpOnly: true`
- `secure: process.env.NODE_ENV === "production"`
- `sameSite: "strict"`
- `maxAge: 10 * 60` (10 minutes)
- `path: "/api/auth/register"`

### `authentication-challenge` (challenge JWT)

Scoped to authentication endpoints only:

- `httpOnly: true`
- `secure: process.env.NODE_ENV === "production"`
- `sameSite: "strict"`
- `maxAge: 10 * 60` (10 minutes)
- `path: "/api/auth/authenticate"`

Challenge token helpers:

- [createChallengeToken](../../src/lib/auth/webauthn.ts#L342-L352)
- [verifyChallengeToken](../../src/lib/auth/webauthn.ts#L355-L366)

## Protecting API Routes

Authenticated API routes must wrap their handlers using `withAuth`. This wrapper:

- reads the `session` cookie
- verifies and resolves the current user (DB lookup)
- injects `request.user`
- returns `401` when unauthenticated and clears invalid session cookies

Implementation: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)

Example usage:

```ts
import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";

async function handler(request: AuthenticatedRequest) {
  return NextResponse.json({ userId: request.user.id });
}

export const GET = withAuth(handler);
```

## Authenticated Pages and Client Session Hydration

- Client session hydration uses `/api/auth/session` via [AuthProvider](../../src/components/providers/AuthProvider.tsx#L30-L123) and [getCurrentSession](../../src/lib/auth/client.ts#L188-L197).
- Passkey ceremonies are initiated from the browser via [registerPasskey](../../src/lib/auth/client.ts#L19-L69) and [authenticatePasskey](../../src/lib/auth/client.ts#L72-L110).

## Data Model (Drizzle)

Auth-related tables live in [schema.ts](../../src/lib/db/schema.ts):

- `users`: primary user record (includes `username`, `profilePictureUrl`, `timezone`).
- `passkey_credentials`: stores passkeys for a user.
  - `credentialId` is the WebAuthn credential ID (unique)
  - `publicKey` is stored as a base64url string
  - `counter` is stored and updated on each successful authentication
  - `deletedAt` supports soft-delete (auth ignores deleted credentials)
- `passkey_claims`: supports the “claim” device-add flow.

## Security Notes (Implementation-Specific)

- **Challenge integrity**: the server does not trust a raw client-provided challenge; it only trusts a signed challenge token with a short expiration.
- **Replay protection**: assertion counters are checked/updated during authentication.
- **Cookie scope**: challenge cookies are scoped to their respective endpoint paths and use `sameSite: "strict"`.
- **Session invalidation**: invalid/expired session cookies are proactively deleted by both `withAuth` and `/api/auth/session`.
