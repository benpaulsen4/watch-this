import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const connectionString = process.env.DATABASE_URL;

// DATA-03: a bare `postgres(url)` at module scope leaks a whole pool on every
// dev fast-refresh (the old pool keeps its sockets open) and, in production,
// takes the driver default of `max: 10` *per lambda instance* -- 30 warm
// instances is 300 connections against a pooler that typically caps far lower.
// So: explicit, serverless-sized pool options, plus a `globalThis` cache
// outside production so module re-evaluation reuses the existing pool.
const isProduction = process.env.NODE_ENV === "production";

function createClient() {
  return postgres(connectionString, {
    // Serverless: one connection per instance. Concurrency comes from the
    // platform spawning instances, not from a deep per-instance pool.
    max: isProduction ? 1 : 5,
    // Return sockets to the pooler promptly instead of holding them idle.
    idle_timeout: 20,
    // Fail fast rather than hanging a request for the driver's default.
    connect_timeout: 10,
    // Named prepared statements are not supported by transaction-mode poolers
    // (PgBouncer/Supavisor), which is what a serverless deployment sits behind.
    prepare: false,
    // postgres-js only enables TLS when the URL asks for it. Managed Postgres
    // always requires it, so default to "require" in production for URLs that
    // omit the parameter; URLs that specify it keep their own setting.
    ssl:
      isProduction && !/[?&](sslmode|ssl)=/.test(connectionString)
        ? "require"
        : undefined,
  });
}

const globalForDb = globalThis as unknown as {
  __watchThisPostgresClient?: ReturnType<typeof createClient>;
};

const client = globalForDb.__watchThisPostgresClient ?? createClient();

if (!isProduction) {
  globalForDb.__watchThisPostgresClient = client;
}

// Create the database instance
export const db = drizzle(client, { schema });

export * from "./schema";
