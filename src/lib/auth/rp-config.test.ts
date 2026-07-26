// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// The module imports the db client at load, and we never reach the database
// here, so stub both specifiers it uses -- same approach as ./webauthn.test.ts.
vi.mock("../db/index", () => ({ db: {} }));
vi.mock("../db", () => ({ db: {}, users: {}, passkeyCredentials: {} }));

import { getRpId, getWebAuthnOrigin } from "./webauthn";

// SUPPLY-02. The failure these guard is a silent one: an RP ID and origin of
// localhost in production are not an error to SimpleWebAuthn, they are just the
// wrong values to compare against, and every ceremony validates happily against
// them. So the assertion that matters is not "returns the right value" but
// "refuses to guess".
//
// The helpers read process.env on each call rather than caching at module
// scope, so vi.stubEnv alone is enough here -- no vi.resetModules needed.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WebAuthn RP config in production", () => {
  it("throws rather than defaulting the RP ID to localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_RP_ID", "");
    expect(() => getRpId()).toThrow(/WEBAUTHN_RP_ID/);
  });

  it("throws rather than defaulting the origin to http://localhost:3000", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_ORIGIN", "");
    expect(() => getWebAuthnOrigin()).toThrow(/WEBAUTHN_ORIGIN/);
  });

  it("names the localhost value it refused to use, so the log is actionable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_ORIGIN", "");
    expect(() => getWebAuthnOrigin()).toThrow(/http:\/\/localhost:3000/);
  });

  it("uses the configured values when they are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_RP_ID", "watchthis.example");
    vi.stubEnv("WEBAUTHN_ORIGIN", "https://watchthis.example");
    expect(getRpId()).toBe("watchthis.example");
    expect(getWebAuthnOrigin()).toBe("https://watchthis.example");
  });
});

describe("WebAuthn RP config outside production", () => {
  it("keeps the localhost defaults in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_RP_ID", "");
    vi.stubEnv("WEBAUTHN_ORIGIN", "");
    expect(getRpId()).toBe("localhost");
    expect(getWebAuthnOrigin()).toBe("http://localhost:3000");
  });

  it("still prefers explicit config over the development default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("WEBAUTHN_ORIGIN", "http://192.168.1.10:3000");
    // Testing a passkey against a phone on the LAN needs the origin the phone
    // actually sees, which is the reason this override exists.
    expect(getWebAuthnOrigin()).toBe("http://192.168.1.10:3000");
  });
});

describe("Vercel preview deployments", () => {
  // Preview deploys run with NODE_ENV=production, so the throw above must not
  // fire for them: VERCEL_URL is platform-injected and is the only host a
  // preview ceremony can possibly use.
  it("derives both values from VERCEL_URL without requiring WEBAUTHN_*", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "watch-this-abc123.vercel.app");
    vi.stubEnv("WEBAUTHN_RP_ID", "");
    vi.stubEnv("WEBAUTHN_ORIGIN", "");
    expect(getRpId()).toBe("watch-this-abc123.vercel.app");
    expect(getWebAuthnOrigin()).toBe("https://watch-this-abc123.vercel.app");
  });
});
