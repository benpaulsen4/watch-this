import { describe, expect, it } from "vitest";

import { DEFAULT_TIME_ZONE, getTimezoneDateKey, resolveTimeZone } from "./time";

describe("resolveTimeZone", () => {
  // LOGIC-12 / DATA-10: `Intl.DateTimeFormat` throws `RangeError` on an unknown
  // zone, and a stale profile value must never take down an episode update or
  // the activity timeline.
  it("falls back to UTC for a missing or invalid stored timezone", () => {
    expect(resolveTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(DEFAULT_TIME_ZONE).toBe("UTC");
  });

  it("keeps a valid IANA zone", () => {
    expect(resolveTimeZone("Pacific/Auckland")).toBe("Pacific/Auckland");
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });
});

describe("getTimezoneDateKey", () => {
  it("returns the calendar day observed in the given zone", () => {
    // 2026-07-20 22:00Z is already the 21st in Auckland and still the 20th in
    // Honolulu.
    const instant = new Date("2026-07-20T22:00:00Z");

    expect(getTimezoneDateKey(instant, "Pacific/Auckland")).toBe("2026-07-21");
    expect(getTimezoneDateKey(instant, "UTC")).toBe("2026-07-20");
    expect(getTimezoneDateKey(instant, "Pacific/Honolulu")).toBe("2026-07-20");
  });

  it("zero-pads so keys sort lexicographically", () => {
    expect(getTimezoneDateKey(new Date("2026-01-02T12:00:00Z"), "UTC")).toBe(
      "2026-01-02",
    );
  });
});
