import { describe, expect, it } from "vitest";

import {
  alsoTopForLine,
  andMore,
  archetypeDescription,
  archetypeDetail,
  archetypeName,
  bigDayLine,
  bigDaySentence,
  compareHeadline,
  crewHeadline,
  dateKeyWeekday,
  episodesPerDayLine,
  finishedLine,
  formatCount,
  formatDateKey,
  formatDateRange,
  formatHoursMinutes,
  heroSentence,
  hoursLine,
  isThinPeriod,
  monthInitial,
  monthLabel,
  monthName,
  monthsHeadline,
  mostFamousLine,
  newMaterialLine,
  nicheComparison,
  nicheLine,
  numberWords,
  overlapLine,
  peakMonth,
  percentileLine,
  periodRange,
  planningLine,
  planningMoreLine,
  pluralise,
  quietestMonth,
  SHAME_PLANNING_LINK,
  shameIntro,
  soloTickDisclosure,
  streakLabel,
  streakLine,
  TIMELINE_TOO_FEW,
  timelineLine,
  timelineSpread,
  topShowStats,
  unknownRuntimeNote,
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
  it("states the top weekday's share and the solo-tick late share", () => {
    expect(
      archetypeDetail(
        rhythm({
          weekdayCounts: [0, 20, 16, 23, 18, 30, 37],
          topWeekday: 6,
          lateShare: 0.41,
        }),
      ),
    ).toBe(
      "26% of your episodes landed on a Sunday. 41% of the episodes you ticked one at a time came after 21:00. Mondays had no episodes.",
    );
  });

  it("drops the late clause when there are too few solo ticks to say", () => {
    expect(
      archetypeDetail(
        rhythm({ weekdayCounts: [1, 1, 1, 1, 1, 1, 4], lateShare: null }),
      ),
    ).toBe("40% of your episodes landed on a Sunday.");
  });

  it("states the late share alone when there is no top weekday", () => {
    expect(
      archetypeDetail(
        rhythm({
          weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
          topWeekday: null,
          lateShare: 0.6,
        }),
      ),
    ).toBe("60% of the episodes you ticked one at a time came after 21:00.");
  });

  it("names every weekday with no episodes on it", () => {
    expect(
      archetypeDetail(
        rhythm({ weekdayCounts: [0, 0, 5, 5, 5, 5, 10], lateShare: null }),
      ),
    ).toBe(
      "33% of your episodes landed on a Sunday. Mondays and Tuesdays had no episodes.",
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

describe("archetypeDescription", () => {
  it("leads with the archetype's blurb, then what the weekday strip shows", () => {
    expect(
      archetypeDescription(
        "weekday-marathoner",
        rhythm({ weekdayCounts: [1, 1, 1, 1, 1, 1, 4], lateShare: null }),
      ),
    ).toBe(
      "One day a week does most of the work. 40% of your episodes landed on a Sunday.",
    );
  });

  it("is the blurb alone when rhythm has nothing to add", () => {
    expect(
      archetypeDescription(
        "completionist",
        rhythm({
          weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
          topWeekday: null,
          lateShare: null,
        }),
      ),
    ).toBe("Once you start something you see it through, whatever it costs.");
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

  it("can shorten the month and the weekday", () => {
    expect(formatDateKey("2026-03-14", { short: true })).toBe("14 Mar");
    expect(formatDateKey("2026-03-14", { short: true, weekday: true })).toBe(
      "Sat 14 Mar",
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

describe("periodRange", () => {
  it("spans the calendar year its label names", () => {
    expect(periodRange("2026")).toBe("1 January – 31 December 2026");
    expect(periodRange("1999")).toBe("1 January – 31 December 1999");
  });

  it("says nothing for a label that is not a year", () => {
    expect(periodRange("spring-2026")).toBe("");
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
    rhythm: { topWeekday: 6 },
  };

  it("builds the mock's sentence from the payload", () => {
    expect(heroSentence(input)).toBe(
      "1,208 episodes, most often on Sundays, and 31 films. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("drops clauses whose data is null", () => {
    expect(heroSentence({ ...input, rhythm: { topWeekday: null } })).toBe(
      "1,208 episodes and 31 films. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("keeps the weekday with the episodes when there are no films", () => {
    expect(heroSentence({ ...input, finished: { films: 0 } })).toBe(
      "1,208 episodes, most often on Sundays. Seventeen straight days of screen, if you had done it all at once.",
    );
  });

  it("leaves out a count of zero and singularises one", () => {
    expect(
      heroSentence({
        headline: { episodes: 0, minutes: 1500 },
        finished: { films: 1 },
        rhythm: { topWeekday: 3 },
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
        rhythm: { topWeekday: null },
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

describe("shameIntro", () => {
  const show = (lastEpisode: string | null) => ({
    tmdbId: 1,
    title: "Foundation",
    lastEpisode,
  });
  const film = { tmdbId: 2, title: "Stalker", days: 892, runtime: 161 };

  it("counts the dropped shows and points at the tipping episodes", () => {
    expect(
      shameIntro({
        dropped: Array.from({ length: 6 }, () => show("S2E03")),
        stillPlanning: [],
      }),
    ).toBe(
      "Six shows marked dropped. These episodes were what tipped you over the edge.",
    );
  });

  it("singularises one", () => {
    expect(shameIntro({ dropped: [show("S2E03")], stillPlanning: [] })).toBe(
      "One show marked dropped. This episode was what tipped you over the edge.",
    );
  });

  it("does not point at episodes it cannot name", () => {
    expect(
      shameIntro({ dropped: [show(null), show(null)], stillPlanning: [] }),
    ).toBe("Two shows marked dropped.");
  });

  it("speaks about the waiting films when nothing was dropped", () => {
    expect(shameIntro({ dropped: [], stillPlanning: [film] })).toBe(
      "Nothing dropped this year. These films, on the other hand, are still waiting.",
    );
  });

  it("has nothing to say about an empty list", () => {
    expect(shameIntro({ dropped: [], stillPlanning: [] })).toBeNull();
  });

  it("links the dropped shows to the waiting films", () => {
    expect(SHAME_PLANNING_LINK).toBe(
      "And even after giving up on those, you still didn't find time for these.",
    );
  });
});

describe("soloTickDisclosure", () => {
  it("quotes the year's solo ticks", () => {
    expect(soloTickDisclosure(12)).toBe(
      "Only 12 episodes this year were ticked one at a time — too few to put on a clock.",
    );
  });

  it("singularises one", () => {
    expect(soloTickDisclosure(1)).toBe(
      "Only 1 episode this year was ticked one at a time — too few to put on a clock.",
    );
  });

  it("says none plainly", () => {
    expect(soloTickDisclosure(0)).toBe(
      "No episodes this year were ticked one at a time, so there is nothing to put on a clock.",
    );
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

describe("isThinPeriod", () => {
  it("is thin only below both floors at once", () => {
    expect(isThinPeriod({ episodes: 9, titlesCompleted: 4 })).toBe(true);
    expect(isThinPeriod({ episodes: 10, titlesCompleted: 4 })).toBe(false);
    expect(isThinPeriod({ episodes: 9, titlesCompleted: 5 })).toBe(false);
    expect(isThinPeriod({ episodes: 0, titlesCompleted: 0 })).toBe(true);
  });

  it("is not thin once either floor is cleared", () => {
    expect(isThinPeriod({ episodes: 1208, titlesCompleted: 47 })).toBe(false);
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

// ---------------------------------------------------------------------------
// The story's lines. Where a card states the same fact as a recap panel it
// uses the recap's helper; these are the story's own sentences.
// ---------------------------------------------------------------------------

describe("monthInitial", () => {
  it("gives the month's initial, empty out of range", () => {
    expect(monthInitial(1)).toBe("J");
    expect(monthInitial(3)).toBe("M");
    expect(monthInitial(13)).toBe("");
  });
});

describe("hoursLine", () => {
  it("converts the hours into straight days and working months", () => {
    // 412 hours: 17 whole days, and 412 / 160 = 2.6 working months.
    expect(hoursLine(24720)).toBe(
      "in front of something. That is 17 straight days, or roughly two and a half working months if you had a job doing this.",
    );
  });

  it("rounds to the nearest half month and says 'full' for a whole one", () => {
    expect(hoursLine(160 * 60)).toBe(
      "in front of something. That is 6 straight days, or roughly one full working month if you had a job doing this.",
    );
    expect(hoursLine(330 * 60)).toBe(
      "in front of something. That is 13 straight days, or roughly two full working months if you had a job doing this.",
    );
  });

  it("counts working days under three weeks of work", () => {
    expect(hoursLine(30 * 60)).toBe(
      "in front of something. That is 1 straight day, or roughly four working days if you had a job doing this.",
    );
  });

  it("drops the straight days under a full day", () => {
    expect(hoursLine(6 * 60)).toBe(
      "in front of something. That is roughly one working day, if you had a job doing this.",
    );
  });

  it("says nothing more for a handful of hours", () => {
    expect(hoursLine(3 * 60)).toBe("in front of something.");
  });
});

describe("unknownRuntimeNote", () => {
  it("discloses episodes the hours could not count", () => {
    expect(unknownRuntimeNote(3)).toBe(
      "Excludes 3 episodes with no runtime on TMDB",
    );
    expect(unknownRuntimeNote(1)).toBe(
      "Excludes 1 episode with no runtime on TMDB",
    );
    expect(unknownRuntimeNote(0)).toBeNull();
  });
});

describe("episodesPerDayLine", () => {
  it("states the average, never 'every day'", () => {
    expect(episodesPerDayLine(3.3)).toBe("3.3 a day, on average.");
    expect(episodesPerDayLine(1)).toBe("1.0 a day, on average.");
  });

  it("turns a rate under one a day into a gap between episodes", () => {
    expect(episodesPerDayLine(0.3)).toBe(
      "About one every 3 days, on average.",
    );
  });

  it("says one a day when the gap rounds to a day", () => {
    expect(episodesPerDayLine(0.7)).toBe("About one a day, on average.");
    expect(episodesPerDayLine(0.99)).toBe("About one a day, on average.");
  });

  it("says nothing without episodes", () => {
    expect(episodesPerDayLine(0)).toBeNull();
  });
});

describe("topShowStats", () => {
  it("counts the episodes and the time", () => {
    expect(
      topShowStats({ episodes: 38, minutes: 1002, finishedAt: null }),
    ).toBe("38 episodes · 16h 42m");
  });

  it("dates the last episode watched, from its zone-correct key", () => {
    expect(
      topShowStats({ episodes: 38, minutes: 1002, finishedAt: "2026-04-04" }),
    ).toBe("38 episodes · 16h 42m · last watched 4 April");
  });

  it("leaves out an unknown runtime or date", () => {
    expect(
      topShowStats({ episodes: 1, minutes: 0, finishedAt: null }),
    ).toBe("1 episode");
    expect(
      topShowStats({ episodes: 1, minutes: 0, finishedAt: "nonsense" }),
    ).toBe("1 episode");
  });
});

describe("newMaterialLine", () => {
  it("counts everyone who shares the top show, the viewer included", () => {
    expect(newMaterialLine(1)).toBe("You two need new material.");
    expect(newMaterialLine(3)).toBe("You four need new material.");
  });

  it("says nothing when nobody shares it", () => {
    expect(newMaterialLine(0)).toBeNull();
  });
});

describe("nicheComparison", () => {
  it("compares against the median of the other films", () => {
    expect(
      nicheComparison({
        popularity: 2.14,
        medianPopularity: 68.4,
        filmPopularities: Array.from({ length: 31 }, () => 50),
      }),
    ).toBe(
      "TMDB popularity 2.1, against a median of 68 for the other 30 films you finished.",
    );
  });

  it("compares against a single other film directly", () => {
    expect(
      nicheComparison({
        popularity: 2.1,
        medianPopularity: 41.2,
        filmPopularities: [2.1, 41.2],
      }),
    ).toBe("TMDB popularity 2.1, against 41 for the other film you finished.");
  });

  it("makes no comparison with nothing to compare against", () => {
    expect(
      nicheComparison({
        popularity: 2.1,
        medianPopularity: 2.1,
        filmPopularities: [2.1],
      }),
    ).toBe("TMDB popularity 2.1. The only film you finished.");
  });
});

describe("mostFamousLine", () => {
  it("names the most popular film finished", () => {
    expect(mostFamousLine({ title: "Dune: Part Two", popularity: 411.6 })).toBe(
      "Most famous: Dune: Part Two, popularity 412",
    );
  });
});

describe("quietestMonth", () => {
  it("picks the quietest month, the earlier one on a tie", () => {
    expect(
      quietestMonth([
        { month: 1, episodes: 5 },
        { month: 2, episodes: 3 },
        { month: 3, episodes: 3 },
      ]),
    ).toEqual({ month: 2, episodes: 3 });
  });

  it("has none for an empty list", () => {
    expect(quietestMonth([])).toBeNull();
  });
});

describe("monthsHeadline", () => {
  const months = (counts: number[]) =>
    counts.map((episodes, index) => ({ month: index + 1, episodes }));

  it("names the peak and the quietest month when the gap is at least fourfold", () => {
    expect(monthsHeadline(months([90, 60, 174, 80, 40, 20, 29, 30, 60, 70, 80, 90]))).toBe(
      "March happened. June, not so much.",
    );
  });

  it("names an empty month outright", () => {
    expect(monthsHeadline(months([90, 60, 174, 80, 40, 20, 0, 30, 60, 70, 80, 90]))).toBe(
      "March happened. July did not.",
    );
  });

  it("counts several empty months", () => {
    expect(monthsHeadline(months([0, 0, 174, 80, 40, 20, 0, 30, 60, 70, 80, 0]))).toBe(
      "March happened. Four months did not.",
    );
  });

  it("calls an even year steady", () => {
    expect(monthsHeadline(months([90, 60, 100, 80, 40, 50, 29, 30, 60, 70, 80, 90]))).toBe(
      "A steady year, peaking in March.",
    );
  });

  it("has nothing to say about an empty year", () => {
    expect(monthsHeadline(months(Array.from({ length: 12 }, () => 0)))).toBeNull();
  });
});

describe("dateKeyWeekday", () => {
  it("names the weekday of a date key without a timezone shift", () => {
    expect(dateKeyWeekday("2026-03-14")).toBe("Saturday");
    expect(dateKeyWeekday("nonsense")).toBe("");
  });
});

describe("bigDaySentence", () => {
  it("counts the day's episodes and time", () => {
    expect(bigDaySentence({ episodes: 11, minutes: 500 })).toBe(
      "Eleven episodes in one day, 8h 20m of screen.",
    );
  });

  it("leaves out an unknown runtime and singularises one", () => {
    expect(bigDaySentence({ episodes: 1, minutes: 0 })).toBe(
      "One episode in one day.",
    );
  });
});

describe("streakLine", () => {
  it("dates the longest streak", () => {
    expect(streakLine({ days: 23, start: "2026-01-02", end: "2026-01-24" })).toBe(
      "Longest streak: 23 days, 2–24 Jan",
    );
    expect(streakLine({ days: 1, start: "2026-01-02", end: "2026-01-02" })).toBe(
      "Longest streak: 1 day, 2 Jan",
    );
  });
});

describe("TIMELINE_TOO_FEW", () => {
  it("does not imply a session from a short timeline", () => {
    expect(TIMELINE_TOO_FEW).toBe(
      "Too few of these were ticked one at a time to say how the day went.",
    );
  });
});

describe("planningLine", () => {
  it("names the film, how long it has waited and how long it runs", () => {
    expect(
      planningLine({ title: "Blade Runner 2049", days: 1104, runtime: 164 }),
    ).toBe("Blade Runner 2049, for 1,104 days. It is 164 minutes long.");
  });

  it("leaves out an unknown runtime and singularises", () => {
    expect(planningLine({ title: "Heat", days: 1, runtime: null })).toBe(
      "Heat, for 1 day.",
    );
    expect(planningLine({ title: "Heat", days: 2, runtime: 1 })).toBe(
      "Heat, for 2 days. It is 1 minute long.",
    );
  });
});

describe("planningMoreLine", () => {
  it("counts the films waiting behind the first", () => {
    expect(planningMoreLine(1)).toBe("One more is waiting behind it.");
    expect(planningMoreLine(4)).toBe("Four more are waiting behind it.");
    expect(planningMoreLine(0)).toBeNull();
  });
});

describe("andMore", () => {
  it("counts what a list left out", () => {
    expect(andMore(4)).toBe("And four more.");
    expect(andMore(0)).toBeNull();
  });
});

describe("crewHeadline", () => {
  const crew = (...episodes: number[]) => episodes.map((count) => ({ episodes: count }));

  it("counts everyone the viewer out-watched, by episodes", () => {
    expect(crewHeadline(1208, crew(1041, 760, 512, 88))).toBe(
      "You out-watched four people who were also trying",
    );
    expect(crewHeadline(1208, crew(88))).toBe(
      "You out-watched one person who was also trying",
    );
  });

  it("says how many of the crew when it is not all of them", () => {
    expect(crewHeadline(600, crew(1041, 760, 512, 88))).toBe(
      "You out-watched two of the four people who were also trying",
    );
  });

  it("does not count a tie as out-watching", () => {
    expect(crewHeadline(500, crew(500))).toBe(
      "You out-watched nobody. It is not a race.",
    );
  });

  it("says nothing without a crew", () => {
    expect(crewHeadline(500, [])).toBeNull();
  });
});

describe("compareHeadline", () => {
  it("reads the overlap share by a fixed rule", () => {
    // under 20% in common
    expect(compareHeadline({ onlyYou: 62, both: 10, onlyThem: 28 })).toBe(
      "A shared list, and almost no shared taste",
    );
    // 20% to under 50%
    expect(compareHeadline({ onlyYou: 62, both: 34, onlyThem: 28 })).toBe(
      "A shared list, and some shared taste",
    );
    // 50% and over
    expect(compareHeadline({ onlyYou: 10, both: 30, onlyThem: 10 })).toBe(
      "A shared list, and mostly shared taste",
    );
  });

  it("says nothing when neither of you finished anything", () => {
    expect(compareHeadline({ onlyYou: 0, both: 0, onlyThem: 0 })).toBeNull();
  });
});

describe("finishedLine", () => {
  it("counts what did not make it, from the dropped titles", () => {
    expect(finishedLine(47, 6)).toBe(
      "things, all the way to the end. Which is more impressive than it sounds, given six others did not make it.",
    );
    expect(finishedLine(1, 1)).toBe(
      "thing, all the way to the end. Which is more impressive than it sounds, given one other did not make it.",
    );
  });

  it("leaves the comparison out when nothing was dropped", () => {
    expect(finishedLine(47, 0)).toBe("things, all the way to the end.");
  });
});
