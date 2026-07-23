import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DATA-03 regression tests: the postgres client must be created with explicit,
// serverless-sized pool options and cached on `globalThis` outside production,
// so module re-evaluation (dev fast-refresh) reuses the existing pool instead
// of leaking a new one on every save.

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(
    (_url: string, _options?: Record<string, unknown>) =>
      ({ __client: true }) as unknown,
  ),
}));

vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn((client: unknown) => ({ __db: true, client })),
}));

const globalForDb = globalThis as unknown as {
  __watchThisPostgresClient?: unknown;
};

describe("db client (DATA-03)", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    postgresMock.mockClear();
    delete globalForDb.__watchThisPostgresClient;
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://user:pw@localhost:5432/watchthis";
  });

  afterEach(() => {
    delete globalForDb.__watchThisPostgresClient;
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it("passes explicit pool options instead of driver defaults", async () => {
    await import("./index");

    expect(postgresMock).toHaveBeenCalledTimes(1);
    const options = postgresMock.mock.calls[0][1];
    expect(options).toBeDefined();
    if (!options) throw new Error("no pool options passed");
    expect(typeof options.max).toBe("number");
    // The driver default is 10 per instance; anything that high defeats the fix.
    expect(options.max).toBeLessThanOrEqual(5);
    expect(options.idle_timeout).toBeGreaterThan(0);
    expect(options.connect_timeout).toBeGreaterThan(0);
    // Transaction-mode poolers cannot handle named prepared statements.
    expect(options.prepare).toBe(false);
  });

  it("reuses the globalThis-cached client across module re-evaluation", async () => {
    await import("./index");
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(globalForDb.__watchThisPostgresClient).toBeDefined();

    // Simulate a dev fast-refresh re-evaluating the module.
    vi.resetModules();
    await import("./index");

    // Still exactly one pool, not two.
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("./index")).rejects.toThrow(/DATABASE_URL/);
  });
});
