import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  getTimezoneDateKey,
  getTimezoneHour,
  getTimezoneWeekday,
  resolveTimeZone,
} from "./time";

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

describe("getTimezoneWeekday", () => {
  it("returns 0 for Monday", () => {
    // 2026-03-16T12:00:00Z is a Monday
    expect(getTimezoneWeekday(new Date("2026-03-16T12:00:00Z"), "UTC")).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 2026-03-15T12:00:00Z is a Sunday
    expect(getTimezoneWeekday(new Date("2026-03-15T12:00:00Z"), "UTC")).toBe(6);
  });

  it("uses the caller's timezone, not the server's", () => {
    // 23:30 Sunday UTC is already Monday in Sydney
    const at = new Date("2026-03-15T23:30:00Z");
    expect(getTimezoneWeekday(at, "UTC")).toBe(6);
    expect(getTimezoneWeekday(at, "Australia/Sydney")).toBe(0);
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    expect(
      getTimezoneWeekday(new Date("2026-03-16T12:00:00Z"), "Mars/Olympus"),
    ).toBe(0);
  });
});

describe("getTimezoneHour", () => {
  it("returns the hour observed in the zone", () => {
    const at = new Date("2026-03-16T21:30:00Z");
    expect(getTimezoneHour(at, "UTC")).toBe(21);
    expect(getTimezoneHour(at, "America/New_York")).toBe(17);
  });

  it("returns 0 for midnight rather than 24", () => {
    expect(getTimezoneHour(new Date("2026-03-16T00:15:00Z"), "UTC")).toBe(0);
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(getTimezoneHour(new Date("2026-03-16T21:30:00Z"), "Mars/Olympus")).toBe(
      21,
    );
  });
});
