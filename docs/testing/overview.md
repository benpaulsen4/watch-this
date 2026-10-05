# Testing

WatchThis uses Vitest and React Testing Library for unit and component tests.

References:

- Vitest config: [vitest.config.mts](../../vitest.config.mts)
- Test setup: [setup.ts](../../src/test/setup.ts)
- Example tests: [src/components](../../src/components), [src/lib](../../src/lib)

## What’s Tested

- **UI components** in `src/components/**` (rendering, user interactions)
- **Domain services** in `src/lib/**` (business logic)
- **Hooks** in `src/hooks/**`

## Running Tests

Scripts are defined in [package.json](../../package.json):

- `npm run test` (CI-friendly)
- `npm run test:watch` (watch mode)
- `npm run test:ui` (Vitest UI)

## Conventions

- Prefer testing behavior over implementation details (user-event over internal state).
- Keep domain logic testable by keeping heavy logic in `src/lib/*` instead of component bodies.
- Every mock is reset before each test (`mockReset: true`), so give `vi.fn()` its
  implementation inline: `vi.fn(async () => x)` is restored by the reset, while a
  `vi.fn().mockResolvedValue(x)` written outside a test is blanked by it.
- A mock that is constructed with `new` needs a `function` or `class`
  implementation; Vitest builds the mock from the shape of what you pass, and an
  arrow function is not constructible.

## End-to-End (Series Finale)

Series Finale has a Playwright suite in [e2e/series-finale/](../../e2e/series-finale/README.md). It is the only end-to-end suite in the repo. It runs a **production build** on port 3100 against a **throwaway Postgres 17 container** (podman, `127.0.0.1:5433/watchthis_e2e`), and refuses to run if `DATABASE_URL` points anywhere else.

What it covers:

- A seeded multi-account cast: a rich main viewer with eight collaborators on a shared list, a thin year, a batch-ticking user, a films-only user with a very long username, a user who joined this year, and a percentile cohort.
- An independent SQL oracle (`npm run e2e:oracle`) that recomputes what each recap must show. Specs check the UI and the share card against it, not against the app's own numbers.
- Desktop, phone and small-phone projects, plus a WebKit phone project for the visual specs. Signing in uses Chromium's virtual WebAuthn authenticator.
- Mutating flows (rename, consent withdrawal, story completion, banner dismissal) in a separate project that runs last.
- Screenshots of every surface and a gallery report (`artifacts/index.html`, `artifacts/report.md`).

Run everything with `npm run e2e:all` (about 5–10 minutes; nothing may be listening on 3100). Remove the container afterwards with `npm run e2e:db:down`. Read the suite's README before running it: it explains the safety guards, the 2026 date guard, and how to roll the cast forward a year.

The e2e scripts never read `.env.local`'s `DATABASE_URL`. Every child process gets an explicit environment from `buildE2eEnv()`, and `npm run e2e:scan-secrets` fails the run if any artifact contains the TMDB key or the WebAuthn secret.
