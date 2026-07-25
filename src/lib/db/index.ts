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
// So: explicit, serverless-sized pool options, plus a `globalThis` cache so
// module re-evaluation reuses the existing pool.
const isProduction = process.env.NODE_ENV === "production";

// `sslmode` / `ssl` in the URL is postgres-js's own way of asking for TLS, so a
// URL that sets it already says what it wants and we must not answer for it.
const urlSpecifiesTls = /[?&](sslmode|ssl)=/.test(connectionString);

function createClient() {
  return postgres(connectionString, {
    // Sized for Fluid Compute, NOT the classic one-invocation-per-instance
    // lambda model. Fluid multiplexes concurrent invocations onto a single
    // instance, so `max: 1` would make every concurrent request on that
    // instance queue behind one socket -- and several service functions hold
    // that socket for a whole transaction, so one slow transaction stalls
    // every other request the instance is serving. 3 keeps a small amount of
    // real concurrency while staying far below what DATA-03 was filed
    // against: 30 warm instances x 3 = 90 connections, versus 300 for the
    // driver default. `idle_timeout` below returns the extra sockets quickly,
    // so they are only held while actually needed.
    max: isProduction ? 3 : 5,
    // Return sockets to the pooler promptly instead of holding them idle.
    idle_timeout: 20,
    // Fail fast rather than hanging a request for the driver's default.
    connect_timeout: 10,
    // Named prepared statements are not supported by transaction-mode poolers
    // (PgBouncer/Supavisor), which is what a serverless deployment sits behind.
    prepare: false,
    // Managed Postgres always requires TLS, so default to "require" in
    // production for URLs that omit the parameter.
    //
    // This MUST spread the key in rather than set it to undefined. postgres-js
    // resolves every option with `k in options ? options[k] : query[k] ?? ...`
    // (see parseOptions in postgres/src/index.js), an `in` check -- so an
    // explicitly present `ssl: undefined` *wins* over the URL's `?sslmode=` and
    // falls through to the driver default of `false`, i.e. it silently turns
    // TLS off. "Let the URL decide" has to be expressed as an absent key.
    ...(isProduction && !urlSpecifiesTls ? { ssl: "require" as const } : {}),
  });
}

const globalForDb = globalThis as unknown as {
  __watchThisPostgresClient?: ReturnType<typeof createClient>;
};

// Cache unconditionally. The Prisma-style "dev only" guard exists to avoid
// leaking a singleton into a long-lived server process, which does not apply
// here: a Next production build can evaluate this module more than once across
// route bundles, and reusing one pool is strictly safer than creating a second.
const client = globalForDb.__watchThisPostgresClient ?? createClient();
globalForDb.__watchThisPostgresClient = client;

// Create the database instance
export const db = drizzle(client, { schema });

export * from "./schema";
