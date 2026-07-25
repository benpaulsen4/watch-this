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
    vi.unstubAllEnvs();
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

  it("caches the client in production too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await import("./index");
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(globalForDb.__watchThisPostgresClient).toBeDefined();

    // A production build can evaluate this module more than once across route
    // bundles; the second evaluation must reuse the pool, not open a new one.
    vi.resetModules();
    await import("./index");
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  describe("production pool options", () => {
    const loadOptions = async (url: string) => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.DATABASE_URL = url;
      await import("./index");
      const options = postgresMock.mock.calls[0][1];
      if (!options) throw new Error("no pool options passed");
      return options;
    };

    it("allows a little real concurrency per instance", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis",
      );
      // Fluid Compute multiplexes concurrent invocations onto one instance, so
      // `max: 1` serialises every concurrent request behind a single socket.
      expect(options.max).toBeGreaterThan(1);
      // But still far below the driver default of 10 that DATA-03 was about.
      expect(options.max).toBeLessThanOrEqual(3);
      expect(options.idle_timeout).toBe(20);
    });

    // The ssl regex is the subtlest line in the module: it must default TLS on
    // for URLs that say nothing about it, and defer to URLs that do.
    it("defaults ssl to require when the URL says nothing about TLS", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis",
      );
      expect(options.ssl).toBe("require");
    });

    it("defers to an explicit ?sslmode= in the URL", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis?sslmode=verify-full",
      );
      expect(options.ssl).toBeUndefined();
    });

    it("defers to an explicit &ssl= in a URL with other params", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis?pool_timeout=5&ssl=true",
      );
      expect(options.ssl).toBeUndefined();
    });

    // `sslrootcert` names a CA file; it does not decide whether TLS is on, so
    // it must NOT suppress the default. A regex of /ssl/ would get this wrong.
    it("still defaults ssl on when only ?sslrootcert= is present", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis?sslrootcert=/ca.pem",
      );
      expect(options.ssl).toBe("require");
    });

    it("leaves ssl unset outside production", async () => {
      const options = await loadOptions(
        "postgres://user:pw@db.example.com:5432/watchthis",
      );
      expect(options.ssl).toBe("require");

      postgresMock.mockClear();
      delete globalForDb.__watchThisPostgresClient;
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "development");
      await import("./index");
      expect(postgresMock.mock.calls[0][1]?.ssl).toBeUndefined();
    });
  });
});
