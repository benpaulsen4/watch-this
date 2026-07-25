import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Companion to ./index.test.ts, which mocks the driver. A mock can only report
// the options we handed it, so it cannot see how postgres-js *resolves* them --
// and the resolution is the subtle part: options are merged with
// `k in options ? options[k] : query[k] ?? env ?? default`, an `in` check. An
// explicitly present `ssl: undefined` therefore beats the URL's `?sslmode=` and
// falls through to the driver default of `false`, silently disabling TLS. That
// shipped once and broke every production query with
// `28000 connection is insecure`, so it is worth a test against the real thing.
//
// `postgres()` builds a lazy pool and opens no socket until the first query, so
// nothing here connects anywhere.

const globalForDb = globalThis as unknown as {
  __watchThisPostgresClient?: { options: Record<string, unknown> };
};

describe("resolved ssl option (real postgres-js)", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete globalForDb.__watchThisPostgresClient;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalForDb.__watchThisPostgresClient;
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  const resolveSsl = async (url: string, nodeEnv: string) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    process.env.DATABASE_URL = url;
    await import("./index");
    const client = globalForDb.__watchThisPostgresClient;
    if (!client) throw new Error("client was not cached on globalThis");
    return client.options.ssl;
  };

  it("keeps TLS on for a production URL that requests sslmode=require", async () => {
    // The exact shape of the production connection string. Before the fix this
    // resolved to `false` and every query failed at the Postgres proxy.
    const ssl = await resolveSsl(
      "postgres://user:pw@ep-example.eu-west-2.aws.neon.tech:5432/main?sslmode=require",
      "production",
    );
    expect(ssl).toBe("require");
  });

  it("honours a stricter sslmode from the URL rather than downgrading it", async () => {
    const ssl = await resolveSsl(
      "postgres://user:pw@db.example.com:5432/watchthis?sslmode=verify-full",
      "production",
    );
    expect(ssl).toBe("verify-full");
  });

  it("turns TLS on for a production URL that says nothing about it", async () => {
    const ssl = await resolveSsl(
      "postgres://user:pw@db.example.com:5432/watchthis",
      "production",
    );
    expect(ssl).toBe("require");
  });

  it("respects an explicit opt-out in the URL", async () => {
    const ssl = await resolveSsl(
      "postgres://user:pw@db.example.com:5432/watchthis?sslmode=disable",
      "production",
    );
    expect(ssl).toBe(false);
  });

  it("still honours the URL outside production", async () => {
    // The bug was not production-only: a present-but-undefined key clobbered
    // the URL in every environment, so a dev pointed at a managed database
    // could not connect either.
    const ssl = await resolveSsl(
      "postgres://user:pw@db.example.com:5432/watchthis?sslmode=require",
      "development",
    );
    expect(ssl).toBe("require");
  });

  it("leaves a plain local URL without TLS outside production", async () => {
    const ssl = await resolveSsl(
      "postgres://user:pw@localhost:5432/watchthis",
      "development",
    );
    expect(ssl).toBe(false);
  });
});
