# Troubleshooting

## “401 Authentication required” on API routes

- Confirm you have a valid `session` cookie set in the browser.
- Check the response's `code`: `unauthenticated` means no cookie was sent, `invalidSession` means the cookie was rejected (and has been cleared).
- Check you are calling the route from the same site/origin that can send cookies.

Reference: [authedRoute](../../src/lib/api/route.ts) and [withAuth](../../src/lib/auth/api-middleware.ts)

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
