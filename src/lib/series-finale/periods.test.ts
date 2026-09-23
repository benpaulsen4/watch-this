import { describe, expect, it } from "vitest";

import {
  calendarYearPeriod,
  completedYearsBetween,
  localisePeriod,
  parsePeriodLabel,
} from "./periods";

describe("calendarYearPeriod", () => {
  it("spans 1 January to the following 1 January, end exclusive", () => {
    const period = calendarYearPeriod(2026);

    expect(period.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(period.label).toBe("2026");
  });
});

describe("completedYearsBetween", () => {
  it("returns every completed year, newest first", () => {
    const periods = completedYearsBetween(
      new Date("2024-06-01T00:00:00Z"),
      new Date("2027-03-01T00:00:00Z"),
    );

    expect(periods.map((p) => p.label)).toEqual(["2026", "2025", "2024"]);
  });

  it("excludes the year in progress", () => {
    const periods = completedYearsBetween(
      new Date("2024-06-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
    );

    expect(periods.map((p) => p.label)).toEqual(["2025", "2024"]);
  });

  it("returns nothing when the first activity is in the current year", () => {
    expect(
      completedYearsBetween(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-08-31T00:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("LA: a year not yet complete locally is excluded even after it turns over in UTC", () => {
    // now is 2027-01-01T03:00:00Z, which is still 2026-12-31T19:00 in LA (PST, -8).
    const periods = completedYearsBetween(
      new Date("2025-06-01T00:00:00Z"),
      new Date("2027-01-01T03:00:00Z"),
      "America/Los_Angeles",
    );

    expect(periods.map((p) => p.label)).toEqual(["2025"]);
  });

  it("LA: a year completes once it has turned over locally", () => {
    // now is 2027-01-01T09:00:00Z, which is 2027-01-01T01:00 in LA -- 2026 is over there.
    const periods = completedYearsBetween(
      new Date("2025-06-01T00:00:00Z"),
      new Date("2027-01-01T09:00:00Z"),
      "America/Los_Angeles",
    );

    expect(periods.map((p) => p.label)).toEqual(["2026", "2025"]);
  });

  it("Auckland: first activity already in the next local year is not double counted", () => {
    // 2024-12-31T12:00:00Z is already 2025-01-01 in Auckland (NZDT, +13).
    const periods = completedYearsBetween(
      new Date("2024-12-31T12:00:00Z"),
      new Date("2027-03-01T00:00:00Z"),
      "Pacific/Auckland",
    );

    expect(periods.map((p) => p.label)).toEqual(["2026", "2025"]);
  });
});

describe("parsePeriodLabel", () => {
  it("parses a four-digit year", () => {
    expect(parsePeriodLabel("2026")?.label).toBe("2026");
  });

  it("rejects a non-year label", () => {
    expect(parsePeriodLabel("summer")).toBeNull();
  });

  it("rejects an implausible year", () => {
    expect(parsePeriodLabel("1200")).toBeNull();
    expect(parsePeriodLabel("9999")).toBeNull();
  });

  it("rejects a label with extra characters", () => {
    expect(parsePeriodLabel("2026a")).toBeNull();
  });
});

describe("localisePeriod", () => {
  it("leaves UTC bounds unchanged", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "UTC");

    expect(period.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(period.label).toBe("2026");
  });

  it("shifts to NZDT local midnight (+13 in January)", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "Pacific/Auckland");

    expect(period.start.toISOString()).toBe("2025-12-31T11:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-12-31T11:00:00.000Z");
  });

  it("shifts to PST local midnight (-8)", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "America/Los_Angeles");

    expect(period.start.toISOString()).toBe("2026-01-01T08:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T08:00:00.000Z");
  });

  it("shifts to a fractional-hour offset (Kathmandu, +5:45)", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "Asia/Kathmandu");

    expect(period.start.toISOString()).toBe("2025-12-31T18:15:00.000Z");
  });

  it("degrades an unknown zone to UTC bounds", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "Mars/Olympus");

    expect(period.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("preserves the label", () => {
    const period = localisePeriod(calendarYearPeriod(2026), "Pacific/Auckland");

    expect(period.label).toBe("2026");
  });
});
