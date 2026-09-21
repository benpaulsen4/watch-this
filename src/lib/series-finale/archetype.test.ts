import { describe, expect, it } from "vitest";

import {
  type ArchetypeInput,
  classifyArchetype,
  coefficientOfVariation,
  maxWindowShare,
} from "./archetype";

/** A deliberately unremarkable year that matches no rule. */
const base = (): ArchetypeInput => ({
  completedTitles: 20,
  droppedShows: 1,
  pausedTitles: 3,
  weekdayCounts: [30, 30, 30, 30, 30, 30, 30],
  medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 1],
  monthlyEpisodeCounts: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  soloTickHours: [],
  soloTickWeekdays: [],
  soloTickCount: 0,
  topGenreShare: 0.2,
  medianPopularity: 90,
  collaborativeCompletedShare: 0.1,
  totalEpisodes: 210,
  totalTitles: 24,
});

describe("coefficientOfVariation", () => {
  it("is zero for identical values", () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
  });

  it("is zero when the mean is zero, rather than NaN", () => {
    expect(coefficientOfVariation([0, 0, 0])).toBe(0);
  });

  it("rises with spread", () => {
    expect(coefficientOfVariation([0, 0, 120])).toBeGreaterThan(1);
  });
});

describe("maxWindowShare", () => {
  it("finds a window holding every hour", () => {
    expect(maxWindowShare([21, 22, 23], 3)).toBe(1);
  });

  it("wraps across midnight", () => {
    expect(maxWindowShare([23, 0, 1], 3)).toBe(1);
  });

  it("honours the window width, not just its placement", () => {
    // 20, 22 and 23 span four hours, so no 3-hour window holds more than two of
    // them. Kills an off-by-one that widened the window (`offset <= windowSize`),
    // which every other case here would return the same value under.
    expect(maxWindowShare([20, 22, 23], 3)).toBe(2 / 3);
  });

  it("returns 0 for no hours", () => {
    expect(maxWindowShare([], 3)).toBe(0);
  });

  it("ignores hours outside 0-23 without letting them count toward a window", () => {
    // Two valid hours out of four entries: corrupt input can only dilute the
    // share, never manufacture one.
    expect(maxWindowShare([22, 22, 24, -1], 3)).toBe(0.5);
  });
});

describe("classifyArchetype", () => {
  it("returns null for a year too thin to characterise", () => {
    expect(
      classifyArchetype({
        ...base(),
        totalEpisodes: 9,
        totalTitles: 4,
      }),
    ).toBeNull();
  });

  it("does not return null when only one thin threshold is met", () => {
    // base() matches no rule on its own, so this input is given one match; the
    // point under test is that the thin guard needs BOTH thresholds to fire.
    expect(
      classifyArchetype({
        ...base(),
        totalEpisodes: 9,
        totalTitles: 24,
        topGenreShare: 0.5,
      }),
    ).not.toBeNull();
  });

  it("matches serial-abandoner at the threshold", () => {
    expect(
      classifyArchetype({ ...base(), droppedShows: 7, completedTitles: 13 }),
    ).toBe("serial-abandoner");
  });

  it("misses serial-abandoner below the minimum dropped count", () => {
    // ratio is 0.44, but only 4 dropped shows
    expect(
      classifyArchetype({ ...base(), droppedShows: 4, completedTitles: 5 }),
    ).not.toBe("serial-abandoner");
  });

  it("misses serial-abandoner one percentage point below the ratio", () => {
    // 17 / 50 = 0.34, against a 0.35 threshold, with the dropped count clear
    expect(
      classifyArchetype({ ...base(), droppedShows: 17, completedTitles: 33 }),
    ).not.toBe("serial-abandoner");
  });

  it("matches completionist", () => {
    expect(
      classifyArchetype({
        ...base(),
        completedTitles: 19,
        droppedShows: 1,
        pausedTitles: 0,
      }),
    ).toBe("completionist");
  });

  it("misses completionist below the 15-title minimum", () => {
    // 14 titles, all completed: a perfect ratio one title short of the minimum
    expect(
      classifyArchetype({
        ...base(),
        completedTitles: 14,
        droppedShows: 0,
        pausedTitles: 0,
      }),
    ).not.toBe("completionist");
  });

  it("misses completionist just below the completion ratio", () => {
    // 17 / 19 = 0.894, against a 0.9 threshold, with the title count clear
    expect(
      classifyArchetype({
        ...base(),
        completedTitles: 17,
        droppedShows: 2,
        pausedTitles: 0,
      }),
    ).not.toBe("completionist");
  });

  it("matches weekday-marathoner", () => {
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 5],
      }),
    ).toBe("weekday-marathoner");
  });

  it("misses weekday-marathoner when the weekday is concentrated but shallow", () => {
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 3],
      }),
    ).not.toBe("weekday-marathoner");
  });

  it("misses weekday-marathoner one percentage point below the share", () => {
    // 16 / 76 = 0.2105, against a 0.22 threshold, with the median clear
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 16],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 5],
      }),
    ).not.toBe("weekday-marathoner");
  });

  it("matches feast-or-famine", () => {
    expect(
      classifyArchetype({
        ...base(),
        monthlyEpisodeCounts: [174, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36],
      }),
    ).toBe("feast-or-famine");
  });

  it("misses feast-or-famine one percentage point below the threshold", () => {
    // Six months at 13 and six at 87: mean 50, deviation 37, so the coefficient
    // of variation is exactly 0.74 against a 0.75 threshold.
    expect(
      classifyArchetype({
        ...base(),
        monthlyEpisodeCounts: [13, 13, 13, 13, 13, 13, 87, 87, 87, 87, 87, 87],
      }),
    ).not.toBe("feast-or-famine");
  });

  it("matches nightly-ritualist when solo ticks clear the floor", () => {
    const hours = Array.from({ length: 60 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4, 5, 6],
        soloTickCount: hours.length,
      }),
    ).toBe("nightly-ritualist");
  });

  it("skips nightly-ritualist below the solo-tick floor, even when the pattern is perfect", () => {
    const hours = Array.from({ length: 49 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4],
        soloTickCount: hours.length,
      }),
    ).not.toBe("nightly-ritualist");
  });

  it("skips nightly-ritualist when solo ticks span too few weekdays", () => {
    const hours = Array.from({ length: 60 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3],
        soloTickCount: hours.length,
      }),
    ).not.toBe("nightly-ritualist");
  });

  it("misses nightly-ritualist one percentage point below the window share", () => {
    // 59 ticks at 22:00 and 41 at 10:00: the best 3-hour window holds 0.59,
    // against a 0.6 threshold, with the floor and weekday spread both clear.
    const hours = [
      ...Array.from({ length: 59 }, () => 22),
      ...Array.from({ length: 41 }, () => 10),
    ];
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4, 5, 6],
        soloTickCount: hours.length,
      }),
    ).not.toBe("nightly-ritualist");
  });

  it("matches one-genre-only", () => {
    expect(classifyArchetype({ ...base(), topGenreShare: 0.4 })).toBe(
      "one-genre-only",
    );
  });

  it("misses one-genre-only one percentage point below the threshold", () => {
    expect(classifyArchetype({ ...base(), topGenreShare: 0.39 })).not.toBe(
      "one-genre-only",
    );
  });

  it("matches deep-cut-hunter", () => {
    expect(classifyArchetype({ ...base(), medianPopularity: 25 })).toBe(
      "deep-cut-hunter",
    );
  });

  it("misses deep-cut-hunter one point above the threshold", () => {
    expect(classifyArchetype({ ...base(), medianPopularity: 26 })).not.toBe(
      "deep-cut-hunter",
    );
  });

  it("does not match deep-cut-hunter when there is no popularity data", () => {
    expect(classifyArchetype({ ...base(), medianPopularity: null })).not.toBe(
      "deep-cut-hunter",
    );
  });

  it("matches group-watcher", () => {
    expect(
      classifyArchetype({ ...base(), collaborativeCompletedShare: 0.5 }),
    ).toBe("group-watcher");
  });

  it("misses group-watcher one percentage point below the threshold", () => {
    expect(
      classifyArchetype({ ...base(), collaborativeCompletedShare: 0.49 }),
    ).not.toBe("group-watcher");
  });

  it("returns null when nothing matches", () => {
    expect(classifyArchetype(base())).toBeNull();
  });

  it("resolves an input matching two rules to the earlier one", () => {
    // serial-abandoner (rule 1) and one-genre-only (rule 6) both hold
    expect(
      classifyArchetype({
        ...base(),
        droppedShows: 7,
        completedTitles: 13,
        topGenreShare: 0.9,
      }),
    ).toBe("serial-abandoner");
  });

  it("resolves a middle-rule collision to the earlier rule", () => {
    // Rules 3 and 4 both fire: Sunday holds 60 of 120 episodes (0.50) at a
    // median of 5, and a single 120-episode month against eleven empty ones
    // gives a coefficient of variation of 3.32. Rule 3 is first, so it wins.
    // Pins the order of two adjacent middle rules, which a rule-1-versus-rule-6
    // test cannot reach.
    expect(
      classifyArchetype({
        ...base(),
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        medianEpisodesPerActiveDayByWeekday: [1, 1, 1, 1, 1, 1, 5],
        monthlyEpisodeCounts: [120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        totalEpisodes: 120,
      }),
    ).toBe("weekday-marathoner");
  });

  it("lets a later rule win when the skipped rule 5 would have matched", () => {
    // Perfect nightly pattern but below the floor, so rule 6 is reached
    const hours = Array.from({ length: 49 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3, 4],
        soloTickCount: hours.length,
        topGenreShare: 0.5,
      }),
    ).toBe("one-genre-only");
  });

  it("still reaches rules 6 to 8 after rule 5 is skipped for a thin weekday spread", () => {
    // Rule 5's own guards must skip the rule, not the rules after it
    const hours = Array.from({ length: 60 }, () => 22);
    expect(
      classifyArchetype({
        ...base(),
        soloTickHours: hours,
        soloTickWeekdays: [0, 1, 2, 3],
        soloTickCount: hours.length,
        collaborativeCompletedShare: 0.6,
      }),
    ).toBe("group-watcher");
  });
});
