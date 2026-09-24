import { describe, expect, it } from "vitest";

import {
  alsoTopForLine,
  archetypeDetail,
  archetypeName,
  bigDayLine,
  droppedIntro,
  formatCount,
  formatDateKey,
  formatDateRange,
  formatHoursMinutes,
  formatPeriodRange,
  heroSentence,
  monthLabel,
  monthName,
  nicheLine,
  numberWords,
  overlapLine,
  peakMonth,
  percentileLine,
  pluralise,
  streakLabel,
  timelineLine,
  timelineSpread,
  weekdayInitial,
  weekdayName,
} from "./format";

const rhythm = (
  overrides: Partial<{
    archetype: Parameters<typeof archetypeName>[0]["archetype"];
    weekdayCounts: number[];
    topWeekday: number | null;
    lateShare: number | null;
  }> = {},
) => ({
  archetype: null,
  weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
  topWeekday: 6,
  lateShare: null,
  ...overrides,
});

describe("label lookups", () => {
  it("names months from 1-based numbers", () => {
    expect(monthName(3)).toBe("March");
    expect(monthLabel(3)).toBe("Mar");
    expect(monthLabel(12)).toBe("Dec");
  });

  it("names weekdays from Monday = 0", () => {
    expect(weekdayName(0)).toBe("Monday");
    expect(weekdayName(6)).toBe("Sunday");
    expect(weekdayInitial(3)).toBe("T");
  });

  it("returns an empty string rather than undefined out of range", () => {
    expect(monthName(13)).toBe("");
    expect(weekdayName(7)).toBe("");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1208)).toBe("1,208");
    expect(formatCount(31)).toBe("31");
  });
});

describe("numberWords", () => {
  it("spells out small numbers", () => {
    expect(numberWords(0)).toBe("zero");
    expect(numberWords(6)).toBe("six");
    expect(numberWords(17)).toBe("seventeen");
    expect(numberWords(40)).toBe("forty");
    expect(numberWords(83)).toBe("eighty-three");
  });

  it("spells out hundreds, British style", () => {
    expect(numberWords(100)).toBe("one hundred");
    expect(numberWords(366)).toBe("three hundred and sixty-six");
  });

  it("falls back to digits from a thousand up", () => {
    expect(numberWords(1208)).toBe("1,208");
  });
});

describe("archetypeName", () => {
  it("returns null without an archetype", () => {
    expect(archetypeName(rhythm())).toBeNull();
  });

  it("names the weekday marathoner after the user's actual top weekday", () => {
    expect(
      archetypeName(rhythm({ archetype: "weekday-marathoner", topWeekday: 6 })),
    ).toBe("The Sunday Marathoner");
    expect(
      archetypeName(rhythm({ archetype: "weekday-marathoner", topWeekday: 2 })),
    ).toBe("The Wednesday Marathoner");
  });

  it("does not invent a weekday when there is none", () => {
    expect(
      archetypeName(
        rhythm({ archetype: "weekday-marathoner", topWeekday: null }),
      ),
    ).toBe("The Weekday Marathoner");
  });

  it("passes other archetypes through unchanged", () => {
    expect(archetypeName(rhythm({ archetype: "completionist" }))).toBe(
      "The Completionist",
    );
  });
});

describe("archetypeDetail", () => {
  it("states the top weekday's share and the late share", () => {
    expect(
      archetypeDetail(
        rhythm({
          weekdayCounts: [0, 20, 16, 23, 18, 30, 37],
          topWeekday: 6,
          lateShare: 0.41,
        }),
      ),
    ).toBe(
      "26% of your episodes landed on a Sunday, and 41% of everything after 21:00. Mondays you watched nothing.",
    );
  });

  it("drops the late clause when there are too few solo ticks to say", () => {
    expect(
      archetypeDetail(
        rhythm({ weekdayCounts: [1, 1, 1, 1, 1, 1, 4], lateShare: null }),
      ),
    ).toBe("40% of your episodes landed on a Sunday.");
  });

  it("names every weekday with nothing on it", () => {
    expect(
      archetypeDetail(
        rhythm({ weekdayCounts: [0, 0, 5, 5, 5, 5, 10], lateShare: null }),
      ),
    ).toBe(
      "33% of your episodes landed on a Sunday. Mondays and Tuesdays you watched nothing.",
    );
  });

  it("returns null when there is nothing to say", () => {
    expect(
      archetypeDetail(
        rhythm({
          weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
          topWeekday: null,
          lateShare: null,
        }),
      ),
    ).toBeNull();
  });
});

describe("formatHoursMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatHoursMinutes(1002)).toBe("16h 42m");
    expect(formatHoursMinutes(500)).toBe("8h 20m");
  });

  it("omits a zero part", () => {
    expect(formatHoursMinutes(480)).toBe("8h");
    expect(formatHoursMinutes(42)).toBe("42m");
  });
});

describe("formatDateKey", () => {
  it("formats a calendar date without a timezone shift", () => {
    expect(formatDateKey("2026-03-14")).toBe("14 March");
    expect(formatDateKey("2026-01-01")).toBe("1 January");
    expect(formatDateKey("2026-12-31")).toBe("31 December");
  });

  it("can lead with the weekday", () => {
    expect(formatDateKey("2026-03-14", { weekday: true })).toBe(
      "Saturday 14 March",
    );
  });

  it("never echoes a malformed key", () => {
    expect(formatDateKey("not-a-date")).toBe("");
  });
});

describe("formatDateRange", () => {
  it("collapses a range inside one month", () => {
    expect(formatDateRange("2026-01-02", "2026-01-24")).toBe("2–24 Jan");
  });

  it("spells out both months across a month boundary", () => {
    expect(formatDateRange("2026-01-28", "2026-02-03")).toBe("28 Jan – 3 Feb");
  });

  it("shows a single day once", () => {
    expect(formatDateRange("2026-03-14", "2026-03-14")).toBe("14 Mar");
  });
});

describe("formatPeriodRange", () => {
  it("formats a UTC year", () => {
    expect(
      formatPeriodRange(
        { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z" },
        "UTC",
      ),
    ).toBe("1 January – 31 December 2026");
  });

  it("reads bounds west of UTC in the user's zone", () => {
    expect(
      formatPeriodRange(
        { start: "2026-01-01T08:00:00.000Z", end: "2027-01-01T08:00:00.000Z" },
        "America/Los_Angeles",
      ),
    ).toBe("1 January – 31 December 2026");
  });

  it("reads bounds east of UTC in the user's zone", () => {
    expect(
      formatPeriodRange(
        { start: "2025-12-31T11:00:00.000Z", end: "2026-12-31T11:00:00.000Z" },
        "Pacific/Auckland",
      ),
    ).toBe("1 January – 31 December 2026");
  });
});

describe("percentileLine", () => {
  it.each([
    [4, "Top 4% of everyone on WatchThis"],
    [50, "Top 50% of everyone on WatchThis"],
  ])("brags about the top half (%i)", (percentile, line) => {
    expect(percentileLine(percentile)).toBe(line);
  });

  it.each([51, 96, null])("stays quiet otherwise (%s)", (percentile) => {
    expect(percentileLine(percentile)).toBeNull();
  });
});

describe("heroSentence", () => {
  const input = {
    headline: { episodes: 1208, minutes: 24720 },
    finished: { films: 31 },
    rhythm: { topWeekday: 6, lateShare: 0.62 },
  };

  it("builds the mock's sentence from the payload", () => {
    expect(heroSentence(input)).toBe(
      "1,208 episodes and 31 films, mostly on Sundays, mostly after nine. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("drops the after-nine clause unless late viewing is a majority", () => {
    expect(
      heroSentence({ ...input, rhythm: { topWeekday: 6, lateShare: 0.41 } }),
    ).toBe(
      "1,208 episodes and 31 films, mostly on Sundays. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("drops clauses whose data is null", () => {
    expect(
      heroSentence({
        ...input,
        rhythm: { topWeekday: null, lateShare: null },
      }),
    ).toBe(
      "1,208 episodes and 31 films. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("leaves out a count of zero and singularises one", () => {
    expect(
      heroSentence({
        headline: { episodes: 0, minutes: 1500 },
        finished: { films: 1 },
        rhythm: { topWeekday: null, lateShare: null },
      }),
    ).toBe(
      "1 film. One straight day of screen, if you had done it all at once.",
    );
  });

  it("says nothing about days of screen under a full day", () => {
    expect(
      heroSentence({
        headline: { episodes: 12, minutes: 600 },
        finished: { films: 0 },
        rhythm: { topWeekday: null, lateShare: null },
      }),
    ).toBe("12 episodes.");
  });
});

describe("streakLabel", () => {
  it("dates the streak", () => {
    expect(
      streakLabel({ days: 23, start: "2026-01-02", end: "2026-01-24" }),
    ).toBe("Day streak, 2–24 Jan");
  });

  it("falls back to a plain label", () => {
    expect(streakLabel(null)).toBe("Day streak");
  });
});

describe("bigDayLine", () => {
  it("names the day, the episodes and the time", () => {
    expect(bigDayLine({ date: "2026-03-14", episodes: 11, minutes: 500 })).toBe(
      "Saturday 14 March · 11 episodes · 8h 20m",
    );
  });

  it("omits an unknown runtime and singularises one episode", () => {
    expect(bigDayLine({ date: "2026-03-14", episodes: 1, minutes: 0 })).toBe(
      "Saturday 14 March · 1 episode",
    );
  });
});

describe("droppedIntro", () => {
  it("counts the dropped shows and points at the tipping episodes", () => {
    expect(droppedIntro(6, true)).toBe(
      "Six shows marked dropped. These episodes were what tipped you over the edge.",
    );
  });

  it("singularises one", () => {
    expect(droppedIntro(1, true)).toBe(
      "One show marked dropped. This episode was what tipped you over the edge.",
    );
  });

  it("does not point at episodes it cannot name", () => {
    expect(droppedIntro(2, false)).toBe("Two shows marked dropped.");
  });
});

describe("overlapLine", () => {
  it("states the overlap", () => {
    expect(overlapLine({ onlyYou: 62, both: 34, onlyThem: 28 })).toBe(
      "34 titles in common out of 124. A 27% overlap.",
    );
  });

  it("uses 'an' before a vowel sound", () => {
    expect(overlapLine({ onlyYou: 46, both: 8, onlyThem: 46 })).toBe(
      "8 titles in common out of 100. An 8% overlap.",
    );
    expect(overlapLine({ onlyYou: 10, both: 80, onlyThem: 10 })).toBe(
      "80 titles in common out of 100. An 80% overlap.",
    );
  });

  it("singularises one title", () => {
    expect(overlapLine({ onlyYou: 2, both: 1, onlyThem: 1 })).toBe(
      "1 title in common out of 4. A 25% overlap.",
    );
  });

  it("returns null when neither of you finished anything", () => {
    expect(overlapLine({ onlyYou: 0, both: 0, onlyThem: 0 })).toBeNull();
  });
});

describe("nicheLine", () => {
  it("compares against the median of the other films", () => {
    expect(
      nicheLine({
        medianPopularity: 68.4,
        filmPopularities: Array.from({ length: 31 }, () => 50),
      }),
    ).toBe("Your most obscure watch — median for your other 30 films was 68");
  });

  it("compares against a single other film directly", () => {
    expect(
      nicheLine({ medianPopularity: 41.2, filmPopularities: [2.1, 41.2] }),
    ).toBe("Your most obscure watch — your other film was at 41");
  });

  it("makes no comparison with nothing to compare against", () => {
    expect(nicheLine({ medianPopularity: 2.1, filmPopularities: [2.1] })).toBe(
      "The only film you finished",
    );
  });
});

describe("pluralise", () => {
  it("counts a noun", () => {
    expect(pluralise(1, "episode")).toBe("1 episode");
    expect(pluralise(1208, "episode")).toBe("1,208 episodes");
  });
});

describe("peakMonth", () => {
  it("picks the busiest month, the earlier one on a tie", () => {
    expect(
      peakMonth([
        { month: 1, episodes: 5 },
        { month: 2, episodes: 9 },
        { month: 3, episodes: 9 },
      ]),
    ).toEqual({ month: 2, episodes: 9 });
  });

  it("has no peak in an empty year", () => {
    expect(
      peakMonth([
        { month: 1, episodes: 0 },
        { month: 2, episodes: 0 },
      ]),
    ).toBeNull();
  });
});

describe("alsoTopForLine", () => {
  it("names the crew who shared the top show", () => {
    expect(alsoTopForLine(["ana"])).toBe("Also number one for ana.");
    expect(alsoTopForLine(["ana", "marcus", "tom"])).toBe(
      "Also number one for ana, marcus and tom.",
    );
  });

  it("says nothing when nobody did", () => {
    expect(alsoTopForLine([])).toBeNull();
  });
});

describe("timelineSpread", () => {
  it("places each solo tick along the span from first to last", () => {
    expect(
      timelineSpread([
        "2026-03-14T10:00:00.000Z",
        "2026-03-14T14:50:00.000Z",
        "2026-03-14T19:40:00.000Z",
      ]),
    ).toEqual({ offsets: [0, 50, 100], minutes: 580 });
  });

  it("returns null when the ticks do not span any time", () => {
    expect(timelineSpread(["2026-03-14T10:00:00.000Z"])).toBeNull();
    expect(
      timelineSpread(["2026-03-14T10:00:00.000Z", "2026-03-14T10:00:00.000Z"]),
    ).toBeNull();
  });
});

describe("timelineLine", () => {
  it("states how the solo ticks spread across the day", () => {
    expect(timelineLine(8, 580)).toBe(
      "8 of these were ticked one at a time, 9h 40m from first to last.",
    );
    expect(timelineLine(1, 0)).toBe("1 of these was ticked one at a time.");
  });
});
