import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// E4: the podman Postgres has TLS off (the default), but src/lib/db forces
// `ssl: "require"` under NODE_ENV=production (which buildE2eEnv() always
// sets) unless the URL itself names sslmode/ssl -- so this must disable TLS
// explicitly, or every real DB call hangs until the socket is dropped.
export const E2E_DATABASE_URL =
  "postgresql://e2e:e2e@localhost:5433/watchthis_e2e?sslmode=disable";
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DIR = join(process.cwd(), "e2e", "series-finale");
export const AUTH_DIR = join(E2E_DIR, ".auth");
export const ARTIFACTS_DIR = join(E2E_DIR, "artifacts");

/** Throws unless `url` is the throwaway local e2e database. */
export function assertE2eDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to run: not the e2e database (${url || "empty"})`);
  }
  const ok =
    ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
    parsed.port === "5433" &&
    parsed.pathname === "/watchthis_e2e";
  if (!ok) {
    throw new Error(`Refusing to run: not the e2e database (${parsed.host}${parsed.pathname})`);
  }
}

/**
 * The cast is dated for runs in 2026: 2025 is the newest completed year, 2026
 * is "not over", neo joins in 2026 and ava has a 2026-01-01 edge episode and a
 * 2026 planning film. Once 2026 ends -- in Australia/Brisbane, the cast's
 * earliest zone -- the app completes 2026 and a wave of checks would fail as if
 * the app had regressed, so the suite refuses to run instead.
 */
export const SUITE_LAST_DAY = "2026-12-31";
const SUITE_EARLIEST_ZONE = "Australia/Brisbane";

/** Throws once SUITE_LAST_DAY has passed in the cast's earliest zone. */
export function assertSuiteInDate(now: Date = new Date()): void {
  const today = now.toLocaleDateString("en-CA", { timeZone: SUITE_EARLIEST_ZONE }); // YYYY-MM-DD
  if (today > SUITE_LAST_DAY) {
    throw new Error(
      `Refusing to run: the e2e cast is dated for 2026 and it is now ${today} in ${SUITE_EARLIEST_ZONE}. ` +
        "Move the cast forward a year before running (see README, \"Dated for 2026\"): LAST_COMPLETED_YEAR and YEARS in " +
        "seed/oracle.ts, every year the specs hard-code (grep specs/ for 2023-2026), neo's createdAt and ava's 2026 " +
        "edge episodes and planning film in seed/personas.ts, then SUITE_LAST_DAY here.",
    );
  }
}

/** The TMDB key from the env, else the one line in .env.local. Never logged. */
export function readTmdbKey(): string {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  const path = join(process.cwd(), ".env.local");
  if (existsSync(path)) {
    const line = readFileSync(path, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("TMDB_API_KEY="));
    const value = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  throw new Error("TMDB_API_KEY is not set (env or .env.local)");
}

function runSecret(): string {
  mkdirSync(AUTH_DIR, { recursive: true });
  const path = join(AUTH_DIR, "run-secret");
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"));
  return readFileSync(path, "utf8").trim();
}

/** Everything the app server, migrations and the seeder need. Explicit, so .env.local cannot leak in. */
export function buildE2eEnv(): NodeJS.ProcessEnv {
  assertE2eDatabaseUrl(E2E_DATABASE_URL);
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: E2E_DATABASE_URL,
    TMDB_API_KEY: readTmdbKey(),
    SITE_URL: E2E_BASE_URL,
    NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
    WEBAUTHN_RP_NAME: "WatchThis E2E",
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGIN: E2E_BASE_URL,
    WEBAUTHN_SECRET: runSecret(),
    ADMIN_API_SECRET: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
