import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const E2E_DATABASE_URL =
  "postgresql://e2e:e2e@localhost:5433/watchthis_e2e";
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
