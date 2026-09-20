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
