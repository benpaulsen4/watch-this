# Typed API Contracts: Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the auth and admin routes (session, register, authenticate, claim, sign-out, admin device claim), the passkey client helpers and their callers onto typed contracts. This is layer 7 of 8 in the spec's rollout, stacked on PR #62.

**Architecture:** `src/lib/auth/contract.ts`, `schemas.ts` and `types.ts` define the ten endpoints. The session routes use `authedRoute`. The ceremony, sign-out and admin routes use `publicRoute`, and routes that set or clear cookies return a `NextResponse` built from a `satisfies`-checked body. The WebAuthn library's thrown messages map to error codes inside each route, because changing the library is out of scope. `src/lib/auth/client.ts` and the auth and profile components call `api()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, `@simplewebauthn`, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, success response shapes, status codes and cookie names, paths and lifetimes do not change. The proxy rate-limits `/api/auth/*` and `/api/admin/*` by path.
- Every error body keeps `error` and adds `code`.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine.
- Bundle: every page's growth stays under 10 kB gzipped, checked with `node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json` after a build. No chunk contains Zod.
- The admin route checks its secret before reading the body, and logs every attempt with the caller's IP.
- In Vitest commands, pass directory paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,781 tests. On the same code the repo's full e2e suite also passed: real passkey registration for every test account through Playwright's virtual authenticator, then 155 read-only and 14 mutating specs. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/auth/types.ts`, `schemas.ts`, `contract.ts` (new) | The ten auth and admin endpoints |
| `src/lib/api/route.ts` | Exports `invalidInput()`, for a body a handler reads itself |
| `src/app/api/auth/**/route.ts`, `src/app/api/admin/device-claim/route.ts` | Rewritten on `authedRoute` and `publicRoute` |
| `src/lib/auth/client.ts` | Passkey helpers call `api()`; `User` derives from the server type |
| `AuthPageClient.tsx` | Username errors shown under the field, chosen by error code |
| `UsernameChanger.tsx`, `ProfilePictureManager.tsx`, `TimezoneSelector.tsx`, `CrewComparisonToggle.tsx`, `ProfileClient.tsx` | Call `api()` |
| `docs/api/openapi.yaml` | Admin `userId` documented as a UUID |

## Behaviour changes, all intended

- **Fixed: users now see why registration or sign-in failed.** `registerPasskey` and `authenticatePasskey` read `error.message` from failed responses, but the server sends `error`. So every failure showed a generic "Failed to get registration options" or similar. They now show the server's reason, such as "Username already exists".
- **Fixed: username errors appear under the username field.** `AuthPageClient` checked `error.includes("username")`, which never matched the capitalised messages. It now uses the `usernameTaken` code or a validation issue on `username`.
- **Session 401s:** a missing session returns `Authentication required` (code `unauthenticated`) instead of `No session found`. An invalid session still clears the cookie. Only `getCurrentSession` reads this, and it returns `null` for any failure.
- **Username stored trimmed:** a username saved through `PUT /api/auth/session` is now stored trimmed. It was validated trimmed but stored as sent. The UI already trims.
- **Stricter input:** malformed JSON and wrongly typed fields return 400 instead of 500 on every auth route. The admin route also rejects a non-UUID `userId`.
- **Error copy:** some 500 messages now come from contract labels, such as `Verify claim failed`. `Registration failed` and `Authentication failed` are unchanged.
- **Client types:** `User.profilePictureUrl` is typed as `string | null`, which is what the server has always sent.

## Known, not changed here

During e2e registration, the server logged "The destination stream closed early" twice, as the harness closed its browser after a sign-up. The cause is most likely Next aborting a page stream when the browser disconnects. It was not checked against the pre-stack code.

---

### Task 1: Auth and admin routes

**Files:**
- Create: `src/lib/auth/types.ts`, `src/lib/auth/schemas.ts`, `src/lib/auth/contract.ts`
- Modify: `src/lib/api/route.ts`, `src/app/api/auth/session/route.ts`, `src/app/api/auth/register/begin/route.ts`, `src/app/api/auth/register/verify/route.ts`, `src/app/api/auth/authenticate/begin/route.ts`, `src/app/api/auth/authenticate/verify/route.ts`, `src/app/api/auth/claim/begin/route.ts`, `src/app/api/auth/claim/verify/route.ts`, `src/app/api/auth/signout/route.ts`, `src/app/api/admin/device-claim/route.ts`
- Test: `src/app/api/auth/register/begin/route.test.ts` (covers register and authenticate), `src/app/api/auth/claim/begin/route.test.ts`, `src/app/api/auth/signout/route.test.ts`, `src/app/api/admin/device-claim/route.test.ts`

**Interfaces:**
- Consumes: from earlier layers, `defineContract`, `schemas`, `type`, `authedRoute`, `publicRoute`.
- Produces: contracts `getSession`, `updateSession`, `registerBegin`, `registerVerify`, `authenticateBegin`, `authenticateVerify`, `claimBegin`, `claimVerify`, `signOut`, `adminDeviceClaim`; types `SessionUser` and the ceremony responses; `invalidInput(error)` in `@/lib/api/route`. Task 2 uses the contracts and `SessionUser`.

The existing `session` and `claim/verify` route tests stay unchanged and must still pass. The WebAuthn credential schema uses `z.custom` to check only `id` and pass the whole response on: the library validates the rest, and a strict object would strip it.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/auth/register/begin/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webauthn = {
  createChallengeToken: vi.fn(async () => "challenge-token"),
  createSessionToken: vi.fn(async () => "session-token"),
  generatePasskeyAuthenticationOptions: vi.fn(),
  generatePasskeyRegistrationOptions: vi.fn(),
  verifyChallengeToken: vi.fn(),
  verifyPasskeyAuthentication: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => webauthn);

const registerBegin = await import("./route");
const registerVerify = await import("../verify/route");
const authenticateBegin = await import("../../authenticate/begin/route");
const authenticateVerify = await import("../../authenticate/verify/route");

const BASE = "http://localhost/api/auth";
const post = (path: string, body: unknown, cookie?: string) =>
  new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: JSON.stringify(body),
  });

const user = {
  id: "user-1",
  username: "sam",
  profilePictureUrl: null,
  timezone: "UTC",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/auth/register/begin", () => {
  it("returns options and sets the challenge cookie for the trimmed name", async () => {
    webauthn.generatePasskeyRegistrationOptions.mockResolvedValue({
      challenge: "abc",
    });
    const response = await registerBegin.POST(
      post("/register/begin", { username: "  sam  " }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "abc" },
    });
    expect(webauthn.generatePasskeyRegistrationOptions).toHaveBeenCalledWith(
      "sam",
    );
    expect(webauthn.createChallengeToken).toHaveBeenCalledWith("abc", {
      flow: "register",
      username: "sam",
    });
    expect(response.cookies.get("registration-challenge")?.value).toBe(
      "challenge-token",
    );
  });

  it.each([
    [{}, "Username is required"],
    [{ username: "  " }, "Username is required"],
    [
      { username: "a b" },
      "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens",
    ],
  ])("rejects %j with the username issue", async (body, error) => {
    const response = await registerBegin.POST(post("/register/begin", body));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe(error);
    expect(json.issues[0].path).toBe("username");
  });

  it("maps a taken username to 409 usernameTaken", async () => {
    webauthn.generatePasskeyRegistrationOptions.mockRejectedValue(
      new Error("Username already exists"),
    );
    const response = await registerBegin.POST(
      post("/register/begin", { username: "sam" }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Username already exists",
      code: "usernameTaken",
    });
  });
});

describe("POST /api/auth/register/verify", () => {
  const body = { username: "sam", registrationResponse: { id: "cred" } };

  it("creates the session and clears the challenge", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockResolvedValue({
      user,
      credential: { id: "cred-row", deviceName: "Laptop", createdAt: user.createdAt },
    });
    const response = await registerVerify.POST(
      post(
        "/register/verify",
        { ...body, timezone: "Australia/Brisbane", extra: "kept out" },
        "registration-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe("user-1");
    expect(response.cookies.get("session")?.value).toBe("session-token");
    expect(response.cookies.get("registration-challenge")?.value).toBe("");
    expect(webauthn.verifyPasskeyRegistration).toHaveBeenCalledWith(
      "sam",
      { id: "cred" },
      "abc",
      undefined,
      "Australia/Brisbane",
    );
  });

  it("requires the challenge cookie", async () => {
    const response = await registerVerify.POST(post("/register/verify", body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalidChallenge");
  });

  it.each([
    [{ username: "sam" }, "Missing required fields"],
    [{ username: "sam", registrationResponse: { noId: true } }, "Missing required fields"],
    [{ ...body, timezone: "Mars/Olympus" }, "Invalid timezone"],
  ])("rejects %j", async (input, error) => {
    const response = await registerVerify.POST(
      post("/register/verify", input, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it.each([
    ["Username already exists", 409, "usernameTaken"],
    ["Registration verification failed", 400, "verificationFailed"],
  ])("maps %s to %i", async (message, status, code) => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockRejectedValue(new Error(message));
    const response = await registerVerify.POST(
      post("/register/verify", body, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("answers 500 Registration failed for anything else", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockRejectedValue(new Error("db down"));
    const response = await registerVerify.POST(
      post("/register/verify", body, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Registration failed");
  });
});

describe("authenticate", () => {
  it("begin returns options and sets the challenge cookie", async () => {
    webauthn.generatePasskeyAuthenticationOptions.mockResolvedValue({
      challenge: "xyz",
    });
    const response = await authenticateBegin.GET(
      new NextRequest(`${BASE}/authenticate/begin`),
    );
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "xyz" },
    });
    expect(response.cookies.get("authentication-challenge")?.value).toBe(
      "challenge-token",
    );
  });

  it("verify signs in and sets the session cookie", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "xyz" });
    webauthn.verifyPasskeyAuthentication.mockResolvedValue({
      user,
      credential: { id: "cred-row", deviceName: null, lastUsed: user.createdAt },
    });
    const response = await authenticateVerify.POST(
      post(
        "/authenticate/verify",
        { authenticationResponse: { id: "cred" } },
        "authentication-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.cookies.get("session")?.value).toBe("session-token");
  });

  it.each([
    ["Credential not found", 404, "credentialNotFound"],
    ["Authentication verification failed", 400, "verificationFailed"],
  ])("verify maps %s to %i", async (message, status, code) => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "xyz" });
    webauthn.verifyPasskeyAuthentication.mockRejectedValue(new Error(message));
    const response = await authenticateVerify.POST(
      post(
        "/authenticate/verify",
        { authenticationResponse: { id: "cred" } },
        "authentication-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("verify rejects a missing response before touching the challenge", async () => {
    const response = await authenticateVerify.POST(
      post("/authenticate/verify", {}),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Missing required fields");
    expect(webauthn.verifyChallengeToken).not.toHaveBeenCalled();
  });
});
```

Create `src/app/api/auth/claim/begin/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const claimRows: { current: unknown[] } = { current: [] };

vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => claimRows.current,
  };
  return { db: { select: () => chain }, passkeyClaims: { id: "claims.id" } };
});

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

const verifyClaimToken = vi.fn();
vi.mock("@/lib/auth/webauthn", () => ({
  createChallengeToken: vi.fn(async () => "challenge-token"),
  generateAdditionalPasskeyRegistrationOptions: vi.fn(async () => ({
    challenge: "abc",
  })),
  verifyClaimToken: (...args: unknown[]) => verifyClaimToken(...args),
}));

const { GET } = await import("./route");

const get = (search: string) =>
  GET(new NextRequest(`http://localhost/api/auth/claim/begin${search}`));

const activeClaim = {
  status: "active",
  expiresAt: new Date(Date.now() + 60_000),
};

describe("GET /api/auth/claim/begin", () => {
  it("returns options and a challenge token for an active claim", async () => {
    verifyClaimToken.mockResolvedValue({ claimId: "c1", userId: "u1" });
    claimRows.current = [activeClaim];
    const response = await get("?token=t");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "abc" },
      challengeToken: "challenge-token",
    });
  });

  it("requires a token", async () => {
    const response = await get("");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Missing token");
  });

  it.each([
    ["an invalid token", null, [activeClaim], 401, "invalidToken"],
    ["a missing claim", { claimId: "c1", userId: "u1" }, [], 404, "notFound"],
    [
      "a used claim",
      { claimId: "c1", userId: "u1" },
      [{ ...activeClaim, status: "consumed" }],
      400,
      "notActive",
    ],
    [
      "an expired claim",
      { claimId: "c1", userId: "u1" },
      [{ ...activeClaim, expiresAt: new Date(Date.now() - 1) }],
      400,
      "expired",
    ],
  ])("maps %s to %i", async (_name, verified, rows, status, code) => {
    verifyClaimToken.mockResolvedValue(verified);
    claimRows.current = rows;
    const response = await get("?token=t");
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});
```

Create `src/app/api/auth/signout/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const setSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        setSpy(values);
        return { where: async () => undefined };
      },
    }),
  },
  users: { id: "users.id", tokenVersion: "users.tokenVersion" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  sql: () => ({ op: "sql" }),
}));

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

const { POST } = await import("./route");

const signOut = (search = "", body?: string, session = "valid") =>
  POST(
    new NextRequest(`http://localhost/api/auth/signout${search}`, {
      method: "POST",
      headers: { cookie: `session=${session}` },
      body,
    }),
  );

describe("POST /api/auth/signout", () => {
  it("clears the session and challenge cookies without revoking", async () => {
    const response = await signOut();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Signed out successfully",
    });
    for (const name of [
      "session",
      "registration-challenge",
      "authentication-challenge",
    ]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
    expect(setSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["?all=1", undefined],
    ["", '{"all":true}'],
  ])("revokes every session with %s %s", async (search, body) => {
    await signOut(search, body);
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a malformed body as a single-device sign-out", async () => {
    const response = await signOut("", "{bad");
    expect(response.status).toBe(200);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("signs out without revoking when the session is already invalid", async () => {
    const response = await signOut("?all=1", undefined, "expired");
    expect(response.status).toBe(200);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
```

Create `src/app/api/admin/device-claim/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userRows: { current: unknown[] } = { current: [] };
const initiateClaim = vi.fn();

vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => userRows.current,
  };
  return { db: { select: () => chain }, users: { username: "users.username" } };
});

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

vi.mock("@/lib/profile/devices/service", () => ({
  initiateClaim: (...args: unknown[]) => initiateClaim(...args),
}));

const { POST } = await import("./route");

const USER_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const send = (body: string | undefined, secret: string | null = "s3cret") =>
  POST(
    new NextRequest("http://localhost/api/admin/device-claim", {
      method: "POST",
      headers: secret ? { "x-admin-secret": secret } : {},
      body,
    }),
  );

beforeEach(() => {
  vi.stubEnv("ADMIN_API_SECRET", "s3cret");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/device-claim", () => {
  it("issues a claim for a user id", async () => {
    initiateClaim.mockResolvedValue({ claimId: "c1" });
    const response = await send(JSON.stringify({ userId: USER_ID }));
    expect(response.status).toBe(200);
    expect(initiateClaim).toHaveBeenCalledWith(USER_ID, "admin");
  });

  it("looks a username up first", async () => {
    userRows.current = [{ id: USER_ID }];
    initiateClaim.mockResolvedValue({ claimId: "c1" });
    await send(JSON.stringify({ username: "sam" }));
    expect(initiateClaim).toHaveBeenCalledWith(USER_ID, "admin");
  });

  // The secret is checked before the body, so an unauthorized caller learns
  // nothing about the expected input.
  it.each([
    [null, "{bad"],
    ["wrong", JSON.stringify({ userId: USER_ID })],
  ])("rejects secret %s with 401 before reading the body", async (secret, body) => {
    const response = await send(body, secret);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "unauthorized",
    });
    expect(initiateClaim).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("ADMIN_API_SECRET", "");
    const response = await send(JSON.stringify({ userId: USER_ID }), "");
    expect(response.status).toBe(401);
  });

  it.each([
    ["{}"],
    ["{bad"],
    [JSON.stringify({ userId: "not-a-uuid" })],
  ])("rejects body %s with a validation 400", async (body) => {
    const response = await send(body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation");
  });

  it("returns 404 for an unknown username", async () => {
    userRows.current = [];
    const response = await send(JSON.stringify({ username: "ghost" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("notFound");
  });

  it.each([
    ["maxDevices", 400],
    ["rateLimit", 429],
  ])("maps %s to %i", async (code, status) => {
    initiateClaim.mockResolvedValue(code);
    const response = await send(JSON.stringify({ userId: USER_ID }));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/auth src/app/api/admin`
Expected: FAIL in the new files. Bodies lack `code`, the old routes return 500 for malformed input and the admin's non-UUID `userId`, and the old register-begin route has no `issues` on its username errors. The existing session and claim-verify tests pass.

- [ ] **Step 3: Write the types, schemas and contract**

Create `src/lib/auth/types.ts`:

```ts
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** The signed-in user as the session endpoints return them. */
export interface SessionUser {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  timezone: string;
  createdAt: Date;
  shareStatsWithCollaborators: boolean;
}

export interface RegisterBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
}

export interface RegisterVerifyResponse {
  success: true;
  user: Pick<
    SessionUser,
    "id" | "username" | "profilePictureUrl" | "timezone" | "createdAt"
  >;
  credential: { id: string; deviceName: string | null; createdAt: Date };
}

export interface AuthenticateBeginResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
}

export interface AuthenticateVerifyResponse {
  success: true;
  user: Pick<SessionUser, "id" | "username" | "createdAt">;
  credential: { id: string; deviceName: string | null; lastUsed: Date };
}

export interface ClaimBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeToken: string;
}
```

Create `src/lib/auth/schemas.ts`:

```ts
import { z } from "zod";

const USERNAME_FORMAT =
  "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens";

const username = z.string().trim().regex(/^[a-zA-Z0-9_-]{3,50}$/, USERNAME_FORMAT);

/** An IANA zone the runtime recognises, checked the way the routes always did. */
function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const timezone = z
  .string("Timezone must be a non-empty string")
  .trim()
  .min(1, "Timezone must be a non-empty string")
  .refine(isTimeZone, "Invalid timezone");

/** A WebAuthn response from the browser, checked only for its id. */
const credentialResponse = (message: string) =>
  z.looseObject({ id: z.string(message) }, message);

export const updateSessionSchemas = {
  body: z.object({
    username: username.optional(),
    profilePictureUrl: z
      .string("Profile picture URL must be a string or null")
      .max(500, "Profile picture URL must be 500 characters or less")
      .refine(
        (url) => !url.trim() || URL.canParse(url),
        "Profile picture URL must be a valid URL",
      )
      .nullable()
      .optional(),
    timezone: timezone
      .refine((zone) => zone.length <= 100, "Timezone must be 100 characters or less")
      .optional(),
    shareStatsWithCollaborators: z
      .boolean("shareStatsWithCollaborators must be a boolean")
      .optional(),
  }),
};

export const registerBeginSchemas = {
  body: z.object({
    username: z
      .string("Username is required")
      .trim()
      .min(1, "Username is required")
      .pipe(username),
  }),
};

export const registerVerifySchemas = {
  body: z.object({
    username: z.string("Missing required fields").trim().min(1, "Missing required fields"),
    registrationResponse: credentialResponse("Missing required fields"),
    deviceName: z.string().optional(),
    timezone: timezone.optional(),
  }),
};

export const authenticateVerifySchemas = {
  body: z.object({
    authenticationResponse: credentialResponse("Missing required fields"),
  }),
};

export const claimBeginSchemas = {
  query: z.object({ token: z.string("Missing token").min(1, "Missing token") }),
};

export const claimVerifySchemas = {
  body: z.object({
    token: z.string("Missing parameters").min(1, "Missing parameters"),
    challengeToken: z.string("Missing parameters").min(1, "Missing parameters"),
    registrationResponse: credentialResponse("Missing parameters"),
    deviceName: z.string().optional(),
  }),
};

/** Parsed by the admin route itself, after the secret check. */
export const adminDeviceClaimBody = z
  .object({
    username: z.string().min(1).optional(),
    userId: z.uuid().optional(),
  })
  .refine(
    (body) => body.username !== undefined || body.userId !== undefined,
    "username or userId required",
  );

/** The admin route reads its body itself, after the secret check. */
export const adminDeviceClaimSchemas = {};
```

Then apply this follow-up to `src/lib/auth/schemas.ts`. The client's WebAuthn response types have no index signature, so `z.custom` replaces a loose object:

```diff
diff --git a/src/lib/auth/schemas.ts b/src/lib/auth/schemas.ts
index d48ea7e..71be3cc 100644
--- a/src/lib/auth/schemas.ts
+++ b/src/lib/auth/schemas.ts
@@ -21,9 +21,18 @@ const timezone = z
   .min(1, "Timezone must be a non-empty string")
   .refine(isTimeZone, "Invalid timezone");
 
-/** A WebAuthn response from the browser, checked only for its id. */
+/**
+ * A WebAuthn response from the browser, checked only for its id and passed on
+ * whole: the WebAuthn library validates the rest.
+ */
 const credentialResponse = (message: string) =>
-  z.looseObject({ id: z.string(message) }, message);
+  z.custom<{ id: string }>(
+    (value) =>
+      typeof value === "object" &&
+      value !== null &&
+      typeof (value as { id?: unknown }).id === "string",
+    message,
+  );
 
 export const updateSessionSchemas = {
   body: z.object({
```

Create `src/lib/auth/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type { ClaimInitiateResponse } from "../profile/devices/types";
import type {
  adminDeviceClaimSchemas,
  authenticateVerifySchemas,
  claimBeginSchemas,
  claimVerifySchemas,
  registerBeginSchemas,
  registerVerifySchemas,
  updateSessionSchemas,
} from "./schemas";
import type {
  AuthenticateBeginResponse,
  AuthenticateVerifyResponse,
  ClaimBeginResponse,
  RegisterBeginResponse,
  RegisterVerifyResponse,
  SessionUser,
} from "./types";

const USERNAME_EXISTS = { status: 409, message: "Username already exists" };
const INVALID_CHALLENGE = {
  status: 400,
  message: "Invalid or expired challenge",
};

export const getSession = defineContract({
  method: "GET",
  path: "/api/auth/session",
  label: "Check session",
  response: type<{ user: SessionUser }>(),
});

export const updateSession = defineContract({
  method: "PUT",
  path: "/api/auth/session",
  label: "Update profile",
  schemas: schemas<typeof updateSessionSchemas>(),
  response: type<{ success: true; user: SessionUser }>(),
  errors: {
    usernameTaken: { status: 409, message: "Username is already taken" },
  },
});

export const registerBegin = defineContract({
  method: "POST",
  path: "/api/auth/register/begin",
  label: "Generate registration options",
  schemas: schemas<typeof registerBeginSchemas>(),
  response: type<RegisterBeginResponse>(),
  errors: { usernameTaken: USERNAME_EXISTS },
});

export const registerVerify = defineContract({
  method: "POST",
  path: "/api/auth/register/verify",
  label: "Registration",
  schemas: schemas<typeof registerVerifySchemas>(),
  response: type<RegisterVerifyResponse>(),
  errors: {
    invalidChallenge: INVALID_CHALLENGE,
    usernameTaken: USERNAME_EXISTS,
    verificationFailed: {
      status: 400,
      message: "Registration verification failed",
    },
  },
});

export const authenticateBegin = defineContract({
  method: "GET",
  path: "/api/auth/authenticate/begin",
  label: "Generate authentication options",
  response: type<AuthenticateBeginResponse>(),
});

export const authenticateVerify = defineContract({
  method: "POST",
  path: "/api/auth/authenticate/verify",
  label: "Authentication",
  schemas: schemas<typeof authenticateVerifySchemas>(),
  response: type<AuthenticateVerifyResponse>(),
  errors: {
    invalidChallenge: INVALID_CHALLENGE,
    credentialNotFound: { status: 404, message: "Credential not found" },
    verificationFailed: {
      status: 400,
      message: "Authentication verification failed",
    },
  },
});

const INVALID_TOKEN = { status: 401, message: "Invalid token" };
const CLAIM_NOT_ACTIVE = { status: 400, message: "Claim not active" };

export const claimBegin = defineContract({
  method: "GET",
  path: "/api/auth/claim/begin",
  label: "Begin claim",
  schemas: schemas<typeof claimBeginSchemas>(),
  response: type<ClaimBeginResponse>(),
  errors: {
    invalidToken: INVALID_TOKEN,
    notFound: { status: 404, message: "Claim not found" },
    notActive: CLAIM_NOT_ACTIVE,
    expired: { status: 400, message: "Claim expired" },
  },
});

export const claimVerify = defineContract({
  method: "POST",
  path: "/api/auth/claim/verify",
  label: "Verify claim",
  schemas: schemas<typeof claimVerifySchemas>(),
  response: type<{ success: true }>(),
  errors: {
    invalidToken: INVALID_TOKEN,
    invalidChallenge: { status: 400, message: "Invalid challenge" },
    notActive: CLAIM_NOT_ACTIVE,
  },
});

export const signOut = defineContract({
  method: "POST",
  path: "/api/auth/signout",
  label: "Sign out",
  response: type<{ success: true; message: string }>(),
});

export const adminDeviceClaim = defineContract({
  method: "POST",
  path: "/api/admin/device-claim",
  label: "Create device claim",
  schemas: schemas<typeof adminDeviceClaimSchemas>(),
  response: type<ClaimInitiateResponse>(),
  errors: {
    unauthorized: { status: 401, message: "Unauthorized" },
    notFound: { status: 404, message: "User not found" },
    maxDevices: { status: 400, message: "Maximum devices reached" },
    rateLimit: {
      status: 429,
      message: "Too many claims for this user, try again later",
    },
  },
});
```

Apply to `src/lib/api/route.ts`:

```diff
diff --git a/src/lib/api/route.ts b/src/lib/api/route.ts
index 65922f2..c7fcb6d 100644
--- a/src/lib/api/route.ts
+++ b/src/lib/api/route.ts
@@ -65,6 +65,14 @@ function toIssues(error: z.ZodError): ApiErrorIssue[] {
   }));
 }
 
+/**
+ * A 400 for input a handler has to validate itself, such as a body read only
+ * after its own authorization check. Shaped like the wrapper's own failures.
+ */
+export function invalidInput(error: z.ZodError): NextResponse {
+  return validationFailure(toIssues(error));
+}
+
 type ParsedInputs = Record<"params" | "query" | "body", unknown>;
 
 /** Validates params, then query, then body. Returns a response on the first failure. */
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/auth/session/route.ts` with:

```ts
import { eq } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { updateSessionSchemas } from "@/lib/auth/schemas";
import type { SessionUser } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { NewUser, User, users } from "@/lib/db/schema";

function sessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    timezone: user.timezone,
    createdAt: user.createdAt,
    shareStatsWithCollaborators: user.shareStatsWithCollaborators,
  };
}

// GET /api/auth/session - the signed-in user. A missing or invalid session is
// a 401 from `withAuth`, which also clears an invalid session cookie.
export const GET = authedRoute(authApi.getSession, {}, ({ user }) => ({
  user: sessionUser(user),
}));

// PUT /api/auth/session - update the signed-in user's profile
export const PUT = authedRoute(
  authApi.updateSession,
  updateSessionSchemas,
  async ({ user, body }) => {
    const { username, profilePictureUrl, timezone, shareStatsWithCollaborators } =
      body;

    // Check if username is already taken (if username is being updated)
    if (username !== undefined && username !== user.username) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser.length > 0) return "usernameTaken";
    }

    const updateData: Partial<NewUser> = {
      updatedAt: new Date(),
    };
    if (username !== undefined) updateData.username = username;
    if (profilePictureUrl !== undefined) {
      updateData.profilePictureUrl = profilePictureUrl || null;
    }
    if (timezone !== undefined) updateData.timezone = timezone;
    if (shareStatsWithCollaborators !== undefined) {
      updateData.shareStatsWithCollaborators = shareStatsWithCollaborators;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    // The session was valid when this request started, but the account can be
    // deleted between authenticating and this UPDATE, leaving it matching no
    // rows. The wrapper answers 500 for a throw -- this only replaces an
    // opaque property-access TypeError with a message that says what happened.
    if (!updatedUser) {
      throw new Error(`Profile update matched no user row for id ${user.id}`);
    }

    return { success: true as const, user: sessionUser(updatedUser) };
  },
);
```

Replace `src/app/api/auth/register/begin/route.ts` with:

```ts
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { registerBeginSchemas } from "@/lib/auth/schemas";
import type { RegisterBeginResponse } from "@/lib/auth/types";
import {
  createChallengeToken,
  generatePasskeyRegistrationOptions,
} from "@/lib/auth/webauthn";

// POST /api/auth/register/begin - registration options for a new account
export const POST = publicRoute(
  authApi.registerBegin,
  registerBeginSchemas,
  async ({ body: { username } }) => {
    let options: RegisterBeginResponse["options"];
    try {
      options = await generatePasskeyRegistrationOptions(username);
    } catch (error) {
      if (error instanceof Error && error.message === "Username already exists") {
        return "usernameTaken";
      }
      throw error;
    }

    const response = NextResponse.json({
      options,
    } satisfies RegisterBeginResponse);

    // Set challenge in httpOnly cookie for security
    response.cookies.set(
      "registration-challenge",
      await createChallengeToken(options.challenge, {
        flow: "register",
        username,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 60, // 10 minutes
        path: "/api/auth/register",
      },
    );

    return response;
  },
);
```

Replace `src/app/api/auth/register/verify/route.ts` with:

```ts
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { registerVerifySchemas } from "@/lib/auth/schemas";
import type { RegisterVerifyResponse } from "@/lib/auth/types";
import {
  createSessionToken,
  verifyChallengeToken,
  verifyPasskeyRegistration,
} from "@/lib/auth/webauthn";

// POST /api/auth/register/verify - create the account and sign it in
export const POST = publicRoute(
  authApi.registerVerify,
  registerVerifySchemas,
  async ({ request, body }) => {
    const { username, registrationResponse, deviceName, timezone } = body;

    const storedChallenge = request.cookies.get("registration-challenge")?.value;
    if (!storedChallenge) return "invalidChallenge";

    const challengePayload = await verifyChallengeToken(storedChallenge, {
      flow: "register",
      username,
    });
    if (!challengePayload) return "invalidChallenge";

    let registered: Awaited<ReturnType<typeof verifyPasskeyRegistration>>;
    try {
      registered = await verifyPasskeyRegistration(
        username,
        registrationResponse as unknown as RegistrationResponseJSON,
        challengePayload.challenge,
        deviceName,
        timezone,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Username already exists") return "usernameTaken";
        if (error.message === "Registration verification failed") {
          return "verificationFailed";
        }
      }
      throw error;
    }
    const { user, credential } = registered;

    const token = await createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      credential: {
        id: credential.id,
        deviceName: credential.deviceName,
        createdAt: credential.createdAt,
      },
    } satisfies RegisterVerifyResponse);

    // Clear registration challenge cookie
    response.cookies.delete("registration-challenge");

    // Set session cookie
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  },
);
```

Replace `src/app/api/auth/authenticate/begin/route.ts` with:

```ts
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import type { AuthenticateBeginResponse } from "@/lib/auth/types";
import {
  createChallengeToken,
  generatePasskeyAuthenticationOptions,
} from "@/lib/auth/webauthn";

// GET /api/auth/authenticate/begin - sign-in options for any passkey
export const GET = publicRoute(authApi.authenticateBegin, {}, async () => {
  const options = await generatePasskeyAuthenticationOptions();

  const response = NextResponse.json({
    options,
  } satisfies AuthenticateBeginResponse);

  // Set challenge in httpOnly cookie for security
  response.cookies.set(
    "authentication-challenge",
    // Usernameless auth: the subject is unknown until verification, so only
    // the flow is bound here.
    await createChallengeToken(options.challenge, { flow: "authenticate" }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60, // 10 minutes
      path: "/api/auth/authenticate",
    },
  );

  return response;
});
```

Replace `src/app/api/auth/authenticate/verify/route.ts` with:

```ts
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { authenticateVerifySchemas } from "@/lib/auth/schemas";
import type { AuthenticateVerifyResponse } from "@/lib/auth/types";
import {
  createSessionToken,
  verifyChallengeToken,
  verifyPasskeyAuthentication,
} from "@/lib/auth/webauthn";

// POST /api/auth/authenticate/verify - sign in with a passkey
export const POST = publicRoute(
  authApi.authenticateVerify,
  authenticateVerifySchemas,
  async ({ request, body: { authenticationResponse } }) => {
    const storedChallenge = request.cookies.get(
      "authentication-challenge",
    )?.value;
    if (!storedChallenge) return "invalidChallenge";

    const challengePayload = await verifyChallengeToken(storedChallenge, {
      flow: "authenticate",
    });
    if (!challengePayload) return "invalidChallenge";

    let authenticated: Awaited<ReturnType<typeof verifyPasskeyAuthentication>>;
    try {
      authenticated = await verifyPasskeyAuthentication(
        authenticationResponse as unknown as AuthenticationResponseJSON,
        challengePayload.challenge,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Credential not found") return "credentialNotFound";
        if (error.message === "Authentication verification failed") {
          return "verificationFailed";
        }
      }
      throw error;
    }
    const { user, credential } = authenticated;

    const token = await createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
      credential: {
        id: credential.id,
        deviceName: credential.deviceName,
        lastUsed: credential.lastUsed,
      },
    } satisfies AuthenticateVerifyResponse);

    // Clear authentication challenge cookie
    response.cookies.delete("authentication-challenge");

    // Set session cookie
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  },
);
```

Replace `src/app/api/auth/claim/begin/route.ts` with:

```ts
import { eq } from "drizzle-orm";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { claimBeginSchemas } from "@/lib/auth/schemas";
import {
  createChallengeToken,
  generateAdditionalPasskeyRegistrationOptions,
  verifyClaimToken,
} from "@/lib/auth/webauthn";
import { db, passkeyClaims } from "@/lib/db";

// GET /api/auth/claim/begin?token=... - registration options for a passkey on
// a new device, from a claim link
export const GET = publicRoute(
  authApi.claimBegin,
  claimBeginSchemas,
  async ({ query: { token } }) => {
    const verified = await verifyClaimToken(token);
    if (!verified) return "invalidToken";

    const claimRows = await db
      .select()
      .from(passkeyClaims)
      .where(eq(passkeyClaims.id, verified.claimId))
      .limit(1);

    const claim = claimRows[0];
    if (!claim) return "notFound";
    if (claim.status !== "active") return "notActive";
    if (claim.expiresAt && claim.expiresAt.getTime() < Date.now()) {
      return "expired";
    }

    const options = await generateAdditionalPasskeyRegistrationOptions(
      verified.userId,
    );
    const challengeToken = await createChallengeToken(options.challenge, {
      flow: "claim",
      userId: verified.userId,
      claimId: verified.claimId,
    });

    return { options, challengeToken };
  },
);
```

Replace `src/app/api/auth/claim/verify/route.ts` with:

```ts
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { claimVerifySchemas } from "@/lib/auth/schemas";
import {
  verifyAdditionalPasskeyRegistration,
  verifyChallengeToken,
  verifyClaimToken,
} from "@/lib/auth/webauthn";
import { activityFeed, db } from "@/lib/db";
import { consumeClaim } from "@/lib/profile/devices/service";

// Thrown when the claim could not be atomically consumed (already
// consumed/cancelled/expired), to roll back the surrounding transaction.
class ClaimUnavailableError extends Error {}

// POST /api/auth/claim/verify - attach the new device's passkey to the account
export const POST = publicRoute(
  authApi.claimVerify,
  claimVerifySchemas,
  async ({ body }) => {
    const { token, challengeToken, registrationResponse, deviceName } = body;

    const claim = await verifyClaimToken(token);
    if (!claim) return "invalidToken";

    const challenge = await verifyChallengeToken(challengeToken, {
      flow: "claim",
      userId: claim.userId,
      claimId: claim.claimId,
    });
    if (!challenge) return "invalidChallenge";

    // Consume the claim and register the passkey atomically. The claim is
    // consumed first via a single conditional UPDATE, so concurrent redemptions
    // cannot both proceed; if registration then fails, the transaction rolls
    // back the consume and the claim stays available for a retry.
    try {
      await db.transaction(async (tx) => {
        const consumed = await consumeClaim(tx, claim.claimId);
        if (!consumed) {
          throw new ClaimUnavailableError();
        }

        // Register the passkey on the SAME transaction, so if anything after
        // this (or this itself) throws, the credential insert rolls back
        // alongside the claim consumption -- no orphan credential can persist
        // while the claim reverts to active.
        await verifyAdditionalPasskeyRegistration(
          claim.userId,
          registrationResponse as unknown as RegistrationResponseJSON,
          challenge.challenge,
          deviceName,
          tx,
        );

        await tx.insert(activityFeed).values({
          userId: claim.userId,
          activityType: "claim_consumed",
          metadata: { claimId: claim.claimId },
        });
      });
    } catch (error) {
      if (error instanceof ClaimUnavailableError) return "notActive";
      throw error;
    }

    return { success: true as const };
  },
);
```

Replace `src/app/api/auth/signout/route.ts` with:

```ts
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { db, users } from "@/lib/db";

// POST /api/auth/signout - sign out this device, or every device with
// `?all=1` or a JSON `{ all: true }` body
export const POST = publicRoute(authApi.signOut, {}, async ({ request }) => {
  // "Sign out all devices": bump the user's token version so every
  // outstanding session JWT is rejected on its next request, not just the
  // cookie on this device. Ordinary single-device signout stays cookie-clear
  // only. The body is optional and read leniently, so it has no schema.
  let signOutAll = request.nextUrl.searchParams.get("all") === "1";
  if (!signOutAll) {
    try {
      const body = await request.json();
      if (body && body.all === true) signOutAll = true;
    } catch {
      // No/invalid body -- treat as single-device signout.
    }
  }

  if (signOutAll) {
    const sessionToken = request.cookies.get("session")?.value;
    const user = sessionToken ? await getCurrentUser(sessionToken) : null;
    if (user) {
      await db
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, user.id));
    }
  }

  const response = NextResponse.json({
    success: true as const,
    message: "Signed out successfully",
  });

  // Clear session cookie
  response.cookies.delete("session");

  // Also clear any challenge cookies that might exist
  response.cookies.delete("registration-challenge");
  response.cookies.delete("authentication-challenge");

  return response;
});
```

Replace `src/app/api/admin/device-claim/route.ts` with:

```ts
import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { invalidInput, publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { adminDeviceClaimBody } from "@/lib/auth/schemas";
import { db, users } from "@/lib/db";
import { getClientIp } from "@/lib/net/client-ip";
import { initiateClaim } from "@/lib/profile/devices/service";

// Constant-time secret comparison that does not leak via early return or via
// timing correlated with how many leading characters match. When lengths
// differ we still run a fixed comparison so timing stays independent of the
// mismatch position, then fail.
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

// POST /api/admin/device-claim - issue a passkey claim for a user, authorized
// by the `x-admin-secret` header. The secret is checked before the body is
// read, so an unauthorized caller learns nothing about the expected input and
// every failed attempt is logged; that is why the body has no contract schema.
export const POST = publicRoute(
  authApi.adminDeviceClaim,
  {},
  async ({ request }) => {
    const ip = getClientIp(request);
    try {
      const secretHeader = request.headers.get("x-admin-secret");
      const adminSecret = process.env.ADMIN_API_SECRET;

      // Fail closed when the admin secret is not configured, and use a
      // constant-time comparison otherwise.
      const authorized =
        !!adminSecret &&
        !!secretHeader &&
        secretsMatch(secretHeader, adminSecret);

      if (!authorized) {
        // Log every failed attempt for auditing (never log the secret itself).
        console.warn("Admin device-claim: unauthorized attempt", {
          ip,
          secretConfigured: !!adminSecret,
          secretProvided: !!secretHeader,
        });
        return "unauthorized";
      }

      let json: unknown;
      try {
        json = await request.json();
      } catch {
        json = undefined;
      }
      const parsed = adminDeviceClaimBody.safeParse(json ?? {});
      if (!parsed.success) return invalidInput(parsed.error);
      const { username, userId } = parsed.data;

      let targetUserId = userId;
      if (!targetUserId && username) {
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        const row = rows[0];
        if (!row) return "notFound";
        targetUserId = row.id;
      }

      const res = await initiateClaim(targetUserId!, "admin");
      if (res === "maxDevices") {
        console.warn("Admin device-claim: max devices reached", {
          ip,
          targetUserId,
        });
        return "maxDevices";
      }
      if (res === "rateLimit") {
        console.warn("Admin device-claim: rate limit reached", {
          ip,
          targetUserId,
        });
        return "rateLimit";
      }

      // Log every successful issuance for auditing.
      console.info("Admin device-claim: issued", {
        ip,
        targetUserId,
        claimId: res.claimId,
      });

      return res;
    } catch (error) {
      // Kept for the audit trail: the wrapper logs the error, but not the IP.
      console.error("Admin device claim error:", { ip, error });
      throw error;
    }
  },
);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/auth src/app/api/admin src/lib/api src/lib/auth && pnpm typecheck`
Expected: all PASS, no type errors. The client still calls the routes with plain `fetch` until Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/types.ts src/lib/auth/schemas.ts src/lib/auth/contract.ts src/lib/api/route.ts src/app/api/auth src/app/api/admin
git commit -m "refactor: move auth and admin routes onto typed contracts"
```

---

### Task 2: Passkey client and auth UI

**Files:**
- Modify: `src/lib/auth/client.ts`, `src/components/auth/AuthPageClient.tsx`, `src/components/profile/UsernameChanger.tsx`, `src/components/profile/ProfilePictureManager.tsx`, `src/components/profile/TimezoneSelector.tsx`, `src/components/series-finale/CrewComparisonToggle.tsx`, `src/components/profile/ProfileClient.tsx`, `src/components/profile/ProfileClient.test.tsx`
- Test: `src/components/auth/AuthPageClient.test.tsx`

**Interfaces:**
- Consumes: Task 1's contracts and `SessionUser`; `api`, `isApiError`, `errorMessage` and `Jsonify` from layer 1.
- Produces: the same exports from `src/lib/auth/client.ts`, with `User` now `Jsonify<SessionUser>`. `verifyClaimRegistration` takes `registrationResponse: { id: string }`, which the WebAuthn library's response satisfies.

`ProfileClient`'s sign-out keeps its old behaviour: any server answer, an error included, still signs out locally. Only a network failure stops it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/auth/AuthPageClient.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { registerPasskey } from "@/lib/auth/client";

import AuthPageClient from "./AuthPageClient";

vi.mock("@/lib/auth/client", () => ({
  authenticatePasskey: vi.fn(),
  isPasskeySupported: () => true,
  isPlatformAuthenticatorAvailable: async () => true,
  registerPasskey: vi.fn(),
}));

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ refreshSession: vi.fn() }),
}));

vi.mock("@/hooks/useProgressRouter", () => ({
  useProgressRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const mockedRegister = registerPasskey as unknown as ReturnType<typeof vi.fn>;

async function submitRegistration(username: string) {
  const user = userEvent.setup();
  render(<AuthPageClient />);
  await user.click(
    await screen.findByRole("button", { name: /create account/i }),
  );
  await user.type(screen.getByLabelText(/username/i), username);
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

// The general error box, as opposed to the message under the username field.
const errorBox = (text: string) =>
  screen.getByText(text).closest(".border-red-500\\/30");

describe("AuthPageClient registration errors", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("shows a taken username under the username field", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("usernameTaken", 409, "Username already exists"),
    );
    await submitRegistration("sam");

    expect(await screen.findByText("Username already exists")).toBeInTheDocument();
    expect(errorBox("Username already exists")).toBeNull();
  });

  it("shows a username validation issue under the field", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("validation", 400, "Username must be 3-50 characters", [
        { path: "username", message: "Username must be 3-50 characters" },
      ]),
    );
    await submitRegistration("ab");

    await waitFor(() =>
      expect(errorBox("Username must be 3-50 characters")).toBeNull(),
    );
  });

  it("shows other failures in the general error box", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("verificationFailed", 400, "Registration verification failed"),
    );
    await submitRegistration("sam");

    await screen.findByText("Registration verification failed");
    expect(errorBox("Registration verification failed")).not.toBeNull();
  });
});
```

Apply to `src/components/profile/ProfileClient.test.tsx`:

```diff
diff --git a/src/components/profile/ProfileClient.test.tsx b/src/components/profile/ProfileClient.test.tsx
index bf55a14..a735a60 100644
--- a/src/components/profile/ProfileClient.test.tsx
+++ b/src/components/profile/ProfileClient.test.tsx
@@ -221,6 +221,23 @@ describe("ProfileClient", () => {
     await waitFor(() => expect(authState.current.clearAuth).toHaveBeenCalled());
   });
 
+  // The server answering with an error still signs this device out, as the
+  // plain fetch the typed client replaced did.
+  it("still clears the auth context when sign-out answers with an error", async () => {
+    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
+      {
+        ok: false,
+        status: 500,
+        json: async () => ({ error: "Sign out failed", code: "internal" }),
+      },
+    );
+    render(<ProfileClient initialUser={SERVER_USER} />);
+
+    fireEvent.click(screen.getByRole("button", { name: /logout/i }));
+
+    await waitFor(() => expect(authState.current.clearAuth).toHaveBeenCalled());
+  });
+
   it("logs out and navigates to /auth", async () => {
     (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
       { ok: true, json: async () => ({}) },
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/components/auth src/components/profile`
Expected: FAIL in "shows a taken username under the username field", because the old page shows it in the general error box. The new `ProfileClient` test may already pass, because the old plain `fetch` never threw on a 500; it pins that behaviour.

- [ ] **Step 3: Migrate the client helpers**

Apply to `src/lib/auth/client.ts`:

```diff
diff --git a/src/lib/auth/client.ts b/src/lib/auth/client.ts
index db1b448..6908758 100644
--- a/src/lib/auth/client.ts
+++ b/src/lib/auth/client.ts
@@ -1,14 +1,12 @@
 "use client";
 
-import {
-  type PublicKeyCredentialCreationOptionsJSON,
-  type PublicKeyCredentialRequestOptionsJSON,
-  startAuthentication,
-  startRegistration,
-} from "@simplewebauthn/browser";
+import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
 import { UAParser } from "ua-parser-js";
 
 import { api } from "@/lib/api/client";
+import type { Jsonify } from "@/lib/api/contract";
+import * as authApi from "@/lib/auth/contract";
+import type { SessionUser } from "@/lib/auth/types";
 import * as devicesApi from "@/lib/profile/devices/contract";
 
 export interface RegistrationOptions {
@@ -25,44 +23,17 @@ export async function registerPasskey({
     // Detect browser timezone
     const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
     // Get registration options from server
-    const optionsResponse = await fetch("/api/auth/register/begin", {
-      method: "POST",
-      headers: { "Content-Type": "application/json" },
-      body: JSON.stringify({ username }),
-    });
-
-    if (!optionsResponse.ok) {
-      const error = await optionsResponse.json();
-      throw new Error(error.message || "Failed to get registration options");
-    }
-
-    const { options } = await optionsResponse.json();
+    const { options } = await api(authApi.registerBegin, { body: { username } });
 
     // Start registration with the browser
     const registrationResponse = await startRegistration({
-      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
+      optionsJSON: options,
     });
 
     // Verify registration with server
-    const verificationResponse = await fetch("/api/auth/register/verify", {
-      method: "POST",
-      headers: { "Content-Type": "application/json" },
-      body: JSON.stringify({
-        username,
-        registrationResponse,
-        deviceName,
-        timezone,
-      }),
+    return await api(authApi.registerVerify, {
+      body: { username, registrationResponse, deviceName, timezone },
     });
-
-    if (!verificationResponse.ok) {
-      const error = await verificationResponse.json();
-      throw new Error(error.message || "Registration verification failed");
-    }
-
-    const result = await verificationResponse.json();
-
-    return result;
   } catch (error) {
     console.error("Registration error:", error);
     throw error;
@@ -73,37 +44,17 @@ export async function registerPasskey({
 export async function authenticatePasskey() {
   try {
     // Get authentication options from server
-    const optionsResponse = await fetch("/api/auth/authenticate/begin");
-
-    if (!optionsResponse.ok) {
-      const error = await optionsResponse.json();
-      throw new Error(error.message || "Failed to get authentication options");
-    }
-
-    const { options } = await optionsResponse.json();
+    const { options } = await api(authApi.authenticateBegin);
 
     // Start authentication with the browser
     const authenticationResponse = await startAuthentication({
-      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
+      optionsJSON: options,
     });
 
     // Verify authentication with server
-    const verificationResponse = await fetch("/api/auth/authenticate/verify", {
-      method: "POST",
-      headers: { "Content-Type": "application/json" },
-      body: JSON.stringify({
-        authenticationResponse,
-      }),
+    return await api(authApi.authenticateVerify, {
+      body: { authenticationResponse },
     });
-
-    if (!verificationResponse.ok) {
-      const error = await verificationResponse.json();
-      throw new Error(error.message || "Authentication verification failed");
-    }
-
-    const result = await verificationResponse.json();
-
-    return result;
   } catch (error) {
     console.error("Authentication error:", error);
     throw error;
@@ -116,22 +67,12 @@ export function initiatePasskeyClaim() {
 }
 
 // Begin claim registration on another device using the magic link token
-export async function beginClaimRegistration(token: string): Promise<{
-  options: PublicKeyCredentialCreationOptionsJSON;
-  challengeToken: string;
-}> {
-  const response = await fetch(
-    `/api/auth/claim/begin?token=${encodeURIComponent(token)}`,
-  );
-  if (!response.ok) {
-    const error = await response.json();
-    throw new Error(error.error || "Failed to begin claim registration");
-  }
-  return await response.json();
+export function beginClaimRegistration(token: string) {
+  return api(authApi.claimBegin, { query: { token } });
 }
 
 // Verify claim registration and attach credential to existing user
-export async function verifyClaimRegistration({
+export function verifyClaimRegistration({
   token,
   challengeToken,
   registrationResponse,
@@ -139,9 +80,9 @@ export async function verifyClaimRegistration({
 }: {
   token: string;
   challengeToken: string;
-  registrationResponse: unknown;
+  registrationResponse: { id: string };
   deviceName?: string;
-}): Promise<{ success: boolean }> {
+}) {
   const { browser, os } = UAParser(navigator.userAgent);
   const computedDeviceName =
     deviceName ||
@@ -149,30 +90,20 @@ export async function verifyClaimRegistration({
       os.version
     }`;
 
-  const response = await fetch("/api/auth/claim/verify", {
-    method: "POST",
-    headers: { "Content-Type": "application/json" },
-    body: JSON.stringify({
+  return api(authApi.claimVerify, {
+    body: {
       token,
       challengeToken,
       registrationResponse,
       deviceName: computedDeviceName,
-    }),
+    },
   });
-
-  if (!response.ok) {
-    const error = await response.json();
-    throw new Error(error.error || "Failed to verify claim registration");
-  }
-  return await response.json();
 }
 
-// Get current user session
-export async function getCurrentSession(): Promise<{ user: User } | null> {
+// Get current user session, or null when signed out or unreachable
+export async function getCurrentSession() {
   try {
-    const response = await fetch("/api/auth/session");
-    if (!response.ok) return null;
-    return await response.json();
+    return await api(authApi.getSession);
   } catch {
     return null;
   }
@@ -199,11 +130,6 @@ export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
   }
 }
 
-export type User = {
-  id: string;
-  username: string;
-  profilePictureUrl: string;
-  timezone: string;
-  createdAt: string;
-  shareStatsWithCollaborators: boolean;
-};
+// The session user as the client receives it. `profilePictureUrl` is null
+// for a user without one.
+export type User = Jsonify<SessionUser>;
```

- [ ] **Step 4: Migrate the callers**

Apply to `src/components/auth/AuthPageClient.tsx`:

```diff
diff --git a/src/components/auth/AuthPageClient.tsx b/src/components/auth/AuthPageClient.tsx
index 8fcd0a1..e1205e5 100644
--- a/src/components/auth/AuthPageClient.tsx
+++ b/src/components/auth/AuthPageClient.tsx
@@ -12,12 +12,23 @@ import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
 import { Input } from "@/components/ui/Input";
 import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
 import { useProgressRouter } from "@/hooks/useProgressRouter";
+import { errorMessage, isApiError } from "@/lib/api/client";
 import {
   authenticatePasskey,
   isPasskeySupported,
   isPlatformAuthenticatorAvailable,
   registerPasskey,
 } from "@/lib/auth/client";
+import * as authApi from "@/lib/auth/contract";
+
+/** Whether a registration failure is about the username, to show it there. */
+function isUsernameError(error: unknown) {
+  return (
+    isApiError(error, authApi.registerBegin) &&
+    (error.code === "usernameTaken" ||
+      (error.issues ?? []).some((issue) => issue.path === "username"))
+  );
+}
 
 type AuthMode = "signin" | "register";
 
@@ -33,6 +44,7 @@ function AuthPageContent() {
   const [username, setUsername] = useState("");
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState("");
+  const [usernameError, setUsernameError] = useState("");
   const [passkeySupported, setPasskeySupported] = useState(false);
   const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false);
 
@@ -55,12 +67,13 @@ function AuthPageContent() {
     e.preventDefault();
 
     if (!username.trim()) {
-      setError("Username is required");
+      setUsernameError("Username is required");
       return;
     }
 
     setLoading(true);
     setError("");
+    setUsernameError("");
 
     try {
       const { browser, os } = UAParser(navigator.userAgent);
@@ -73,7 +86,9 @@ function AuthPageContent() {
       await refreshSession();
       router.push(redirectTo);
     } catch (err) {
-      setError(err instanceof Error ? err.message : "Registration failed");
+      const message = errorMessage(err, "Registration failed");
+      if (isUsernameError(err)) setUsernameError(message);
+      else setError(message);
     } finally {
       setLoading(false);
     }
@@ -84,13 +99,14 @@ function AuthPageContent() {
 
     setLoading(true);
     setError("");
+    setUsernameError("");
 
     try {
       await authenticatePasskey();
       await refreshSession();
       router.push(redirectTo);
     } catch (err) {
-      setError(err instanceof Error ? err.message : "Authentication failed");
+      setError(errorMessage(err, "Authentication failed"));
     } finally {
       setLoading(false);
     }
@@ -169,13 +185,11 @@ function AuthPageContent() {
                   onChange={(e) => setUsername(e.target.value)}
                   placeholder="Enter your username"
                   required={true}
-                  error={
-                    error && error.includes("username") ? error : undefined
-                  }
+                  error={usernameError || undefined}
                 />
               )}
 
-              {error && !error.includes("username") && (
+              {error && (
                 <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30">
                   <p className="text-red-400 text-sm">{error}</p>
                 </div>
@@ -234,6 +248,7 @@ function AuthPageContent() {
                 onClick={() => {
                   setMode(mode === "register" ? "signin" : "register");
                   setError("");
+                  setUsernameError("");
                   setUsername("");
                 }}
                 className="mt-1"
```

Apply to `src/components/profile/UsernameChanger.tsx`:

```diff
diff --git a/src/components/profile/UsernameChanger.tsx b/src/components/profile/UsernameChanger.tsx
index b8fe991..25483ac 100644
--- a/src/components/profile/UsernameChanger.tsx
+++ b/src/components/profile/UsernameChanger.tsx
@@ -6,7 +6,9 @@ import { useState } from "react";
 
 import { Button } from "@/components/ui/Button";
 import { Input } from "@/components/ui/Input";
+import { api, errorMessage, isApiError } from "@/lib/api/client";
 import { User } from "@/lib/auth/client";
+import * as authApi from "@/lib/auth/contract";
 
 interface UsernameChangerProps {
   user: User;
@@ -69,28 +71,17 @@ export function UsernameChanger({ user, onUserUpdate }: UsernameChangerProps) {
   };
 
   const saveUsernameMutation = useMutation({
-    mutationFn: async () => {
-      const response = await fetch("/api/auth/session", {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ username: newUsername.trim() }),
-      });
-      const errorData = await response.json();
-      if (!response.ok) {
-        if (response.status === 409) {
-          throw new Error("This username is already taken");
-        }
-        throw new Error(errorData.error || "Failed to update username");
-      }
-      return errorData;
-    },
+    mutationFn: () =>
+      api(authApi.updateSession, { body: { username: newUsername.trim() } }),
     onSuccess: (updatedUser) => {
       onUserUpdate(updatedUser.user);
       setIsEditing(false);
     },
     onError: (err: unknown) => {
       setError(
-        err instanceof Error ? err.message : "Failed to update username",
+        isApiError(err, authApi.updateSession) && err.code === "usernameTaken"
+          ? "This username is already taken"
+          : errorMessage(err, "Failed to update username"),
       );
     },
     onSettled: () => setLoading(false),
```

Apply to `src/components/profile/ProfilePictureManager.tsx`:

```diff
diff --git a/src/components/profile/ProfilePictureManager.tsx b/src/components/profile/ProfilePictureManager.tsx
index 3402ea0..2e4f2bb 100644
--- a/src/components/profile/ProfilePictureManager.tsx
+++ b/src/components/profile/ProfilePictureManager.tsx
@@ -7,7 +7,9 @@ import { useState } from "react";
 
 import { Button } from "@/components/ui/Button";
 import { Input } from "@/components/ui/Input";
+import { api, errorMessage } from "@/lib/api/client";
 import { User } from "@/lib/auth/client";
+import * as authApi from "@/lib/auth/contract";
 
 interface ProfilePictureManagerProps {
   user: User;
@@ -44,26 +46,17 @@ export function ProfilePictureManager({
   };
 
   const updatePictureMutation = useMutation({
-    mutationFn: async () => {
-      const response = await fetch("/api/auth/session", {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ profilePictureUrl: newUrl.trim() || null }),
-      });
-      const data = await response.json();
-      if (!response.ok)
-        throw new Error(data.error || "Failed to update profile picture");
-      return data;
-    },
+    mutationFn: () =>
+      api(authApi.updateSession, {
+        body: { profilePictureUrl: newUrl.trim() || null },
+      }),
     onSuccess: (data) => {
       onUserUpdate(data.user);
       setIsEditing(false);
       setPreviewError(false);
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to update profile picture",
-      );
+      setError(errorMessage(err, "Failed to update profile picture"));
     },
     onSettled: () => setLoading(false),
   });
```

Apply to `src/components/profile/TimezoneSelector.tsx`:

```diff
diff --git a/src/components/profile/TimezoneSelector.tsx b/src/components/profile/TimezoneSelector.tsx
index c4ce649..377e27b 100644
--- a/src/components/profile/TimezoneSelector.tsx
+++ b/src/components/profile/TimezoneSelector.tsx
@@ -6,6 +6,8 @@ import { useEffect, useMemo, useState } from "react";
 
 import { Button } from "@/components/ui/Button";
 import Dropdown from "@/components/ui/Dropdown";
+import { api, errorMessage } from "@/lib/api/client";
+import * as authApi from "@/lib/auth/contract";
 
 type Props = {
   user: { timezone?: string };
@@ -66,22 +68,13 @@ export function TimezoneSelector({ user, onUserUpdate }: Props) {
   };
 
   const saveTimezoneMutation = useMutation({
-    mutationFn: async () => {
-      const res = await fetch("/api/auth/session", {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ timezone }),
-      });
-      const data = await res.json();
-      if (!res.ok) throw new Error(data?.error || "Failed to update timezone");
-      return data;
-    },
+    mutationFn: () => api(authApi.updateSession, { body: { timezone } }),
     onSuccess: async () => {
       await onUserUpdate();
       setIsEditing(false);
     },
     onError: (e: unknown) => {
-      setError(e instanceof Error ? e.message : "Failed to update timezone");
+      setError(errorMessage(e, "Failed to update timezone"));
     },
     onSettled: () => setSaving(false),
   });
```

Apply to `src/components/series-finale/CrewComparisonToggle.tsx`:

```diff
diff --git a/src/components/series-finale/CrewComparisonToggle.tsx b/src/components/series-finale/CrewComparisonToggle.tsx
index 277fc1e..a73bd92 100644
--- a/src/components/series-finale/CrewComparisonToggle.tsx
+++ b/src/components/series-finale/CrewComparisonToggle.tsx
@@ -4,6 +4,8 @@ import { useMutation } from "@tanstack/react-query";
 import { useState } from "react";
 
 import { Switch } from "@/components/ui/Switch";
+import { api } from "@/lib/api/client";
+import * as authApi from "@/lib/auth/contract";
 
 type Props = {
   user: { shareStatsWithCollaborators: boolean };
@@ -50,18 +52,10 @@ export function CrewComparisonToggle({ user, onUpdate }: Props) {
   }
 
   const mutation = useMutation({
-    mutationFn: async (next: boolean) => {
-      const response = await fetch("/api/auth/session", {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ shareStatsWithCollaborators: next }),
-      });
-      const data = await response.json();
-      if (!response.ok) {
-        throw new Error(data?.error || "Failed to save");
-      }
-      return data;
-    },
+    mutationFn: (next: boolean) =>
+      api(authApi.updateSession, {
+        body: { shareStatsWithCollaborators: next },
+      }),
     onSuccess: async () => {
       await onUpdate();
     },
```

Apply to `src/components/profile/ProfileClient.tsx`:

```diff
diff --git a/src/components/profile/ProfileClient.tsx b/src/components/profile/ProfileClient.tsx
index e82558a..ee79150 100644
--- a/src/components/profile/ProfileClient.tsx
+++ b/src/components/profile/ProfileClient.tsx
@@ -8,7 +8,9 @@ import { Button } from "@/components/ui/Button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
 import { useFragmentNavigation } from "@/hooks/useFragmentNavigation";
 import { useProgressRouter } from "@/hooks/useProgressRouter";
+import { api, isApiError } from "@/lib/api/client";
 import type { User } from "@/lib/auth/client";
+import * as authApi from "@/lib/auth/contract";
 
 import { useAuth } from "../providers/AuthProvider";
 import { PageHeader } from "../ui/PageHeader";
@@ -51,7 +53,13 @@ export function ProfileClient({ initialUser }: { initialUser: User }) {
 
   const handleLogout = async () => {
     try {
-      await fetch("/api/auth/signout", { method: "POST" });
+      // Any answer from the server signs out here, an error included, as the
+      // plain fetch this replaced did; only an unreachable server stops it.
+      await api(authApi.signOut).catch((error: unknown) => {
+        if (!isApiError(error, authApi.signOut) || error.code === "network") {
+          throw error;
+        }
+      });
       // Navigation alone leaves the context holding this user. Clearing it
       // is what makes AuthProvider drop the query cache, so the next person
       // to sign in on this tab never sees this user's cached data.
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run src/components src/lib src/app/api/auth && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/client.ts src/components/auth src/components/profile src/components/series-finale/CrewComparisonToggle.tsx
git commit -m "refactor: move the passkey client and auth UI onto the typed client"
```

---

### Task 3: API docs and final checks

**Files:**
- Modify: `docs/api/openapi.yaml`

- [ ] **Step 1: Document the admin `userId` format**

Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index b14a8be..4e7a898 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -3693,6 +3693,7 @@ paths:
                   type: string
                 userId:
                   type: string
+                  format: uuid
               anyOf:
                 - required: [username]
                 - required: [userId]
```

- [ ] **Step 2: Confirm no hand parsing remains in these routes**

Run: `grep -rnE 'request\.json\(\)|searchParams\.get' src/app/api/auth src/app/api/admin --include=route.ts`
Expected: exactly three matches: sign-out's `?all` flag and its lenient optional body, and the admin route's body, which it reads after the secret check.

- [ ] **Step 3: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,781 passing tests. Report any failure with its output.

- [ ] **Step 4: Check the bundle**

```bash
node tools/page-bundle-sizes.mjs --compare tools/page-bundle-baseline.json
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: the largest growth is about 3,700 bytes; the second command prints `0`. If a command is blocked, report it rather than finding another way to run it.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: document the admin device-claim userId format"
```
