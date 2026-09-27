import { describe, expect, it } from "vitest";

import { assertE2eDatabaseUrl, assertSuiteInDate } from "./test-env";

describe("assertE2eDatabaseUrl", () => {
  it("accepts the local e2e database", () => {
    expect(() =>
      assertE2eDatabaseUrl("postgresql://e2e:e2e@localhost:5433/watchthis_e2e"),
    ).not.toThrow();
    expect(() =>
      assertE2eDatabaseUrl("postgresql://e2e:e2e@127.0.0.1:5433/watchthis_e2e"),
    ).not.toThrow();
  });

  it.each([
    "postgresql://u:p@db.example.com:5432/watchthis",
    "postgresql://u:p@localhost:5432/watchthis_e2e",
    "postgresql://u:p@localhost:5433/watchthis",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(() => assertE2eDatabaseUrl(url)).toThrow(/e2e database/i);
  });

  // E4: the podman Postgres has TLS off, so the URL must be able to carry
  // ?sslmode=disable (src/lib/db otherwise forces ssl:"require" under
  // NODE_ENV=production). The check only looks at host/port/pathname, so a
  // query string must neither be required nor let a bad host sneak past.
  it("accepts the local e2e database with a query string", () => {
    expect(() =>
      assertE2eDatabaseUrl(
        "postgresql://e2e:e2e@localhost:5433/watchthis_e2e?sslmode=disable",
      ),
    ).not.toThrow();
  });

  it("still refuses a remote host even with ?sslmode=disable", () => {
    expect(() =>
      assertE2eDatabaseUrl(
        "postgresql://u:p@db.example.com:5433/watchthis_e2e?sslmode=disable",
      ),
    ).toThrow(/e2e database/i);
  });
});

describe("assertSuiteInDate", () => {
  it("runs on the cast's last day, in Brisbane", () => {
    expect(() => assertSuiteInDate(new Date("2026-09-27T00:00:00Z"))).not.toThrow();
    // 2026-12-31 13:59 UTC is 23:59 on the 31st in Brisbane.
    expect(() => assertSuiteInDate(new Date("2026-12-31T13:59:00Z"))).not.toThrow();
  });

  it("refuses once 2027 has begun in Brisbane, even while it is still 2026 in UTC", () => {
    expect(() => assertSuiteInDate(new Date("2026-12-31T14:00:00Z"))).toThrow(/dated for 2026 and it is now 2027-01-01/);
    expect(() => assertSuiteInDate(new Date("2027-06-01T00:00:00Z"))).toThrow(/Refusing to run/);
  });
});
