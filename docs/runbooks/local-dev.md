# Local Development

This runbook captures the common local-development workflows for WatchThis.

Primary references:

- [README.md](../../README.md)
- [.env.example](../../.env.example)
- DB scripts: [package.json](../../package.json)

## Setup

- Install dependencies with `pnpm install` (not npm: `pnpm-lock.yaml` is the lockfile) and create `.env.local` from `.env.example`.
- Ensure Postgres is running and `DATABASE_URL` points to it.
- Set `TMDB_API_KEY`.
- Set `WEBAUTHN_SECRET` (required for signing session + challenge tokens).

## Database

- Fast dev approach: `pnpm db:push`
- Migration approach: `pnpm db:generate` then `pnpm db:migrate`

## App

- Start dev server: `pnpm dev`
- Build: `pnpm build`
- Start production server locally: `pnpm start`

## Auth Notes (WebAuthn)

WebAuthn is origin- and RP ID-sensitive. Local development typically uses:

- `WEBAUTHN_ORIGIN=http://localhost:3000`
- `WEBAUTHN_RP_ID=localhost`

If you change hostnames/ports, update these variables accordingly.
