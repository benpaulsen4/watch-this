import { describe, expect, it } from "vitest";

import { assertE2eDatabaseUrl } from "./test-env";

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
});
