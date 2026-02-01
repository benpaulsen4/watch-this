# Troubleshooting

## “401 Authentication required” on API routes

- Confirm you have a valid `session` cookie set in the browser.
- Check the route uses `withAuth` and that you are calling it from the same site/origin that can send cookies.

Reference: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)

## WebAuthn errors during registration/authentication

Common causes:

- `WEBAUTHN_ORIGIN` does not match the current browser origin
- `WEBAUTHN_RP_ID` is incorrect for the current hostname
- HTTPS requirements (production environments)

Reference: [README.md](../../README.md#L77-L89)

## TMDB / provider endpoints returning 503 or 429

- `503` typically indicates an upstream failure talking to TMDB.
- `429` indicates rate limiting (either upstream or enforced by error mapping).

Reference: [handleApiError](../../src/lib/auth/api-middleware.ts#L66-L86)

## Migrations not applying as expected

- Verify `DATABASE_URL` points to the expected database.
- Confirm whether you are using `db:push` (schema push) vs `db:migrate` (migrations).

Reference: [Migrations](../database/migrations.md)
