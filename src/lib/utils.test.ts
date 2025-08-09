import { cn, formatVoteAverage } from "./utils";
import { describe, it, expect } from "vitest";

describe("cn utility function", () => {
  it("merges class names correctly", () => {
    expect(cn("class1", "class2")).toBe("class1 class2");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "conditional", false && "hidden")).toBe(
      "base conditional"
    );
  });

  it("handles undefined and null values", () => {
    expect(cn("base", undefined, null, "valid")).toBe("base valid");
  });

  it("merges Tailwind classes correctly", () => {
    // twMerge should handle conflicting Tailwind classes
    expect(cn("p-4", "p-6")).toBe("p-6");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles arrays of classes", () => {
    expect(cn(["class1", "class2"], "class3")).toBe("class1 class2 class3");
  });

  it("handles objects with boolean values", () => {
    expect(
      cn({
        "always-present": true,
        "conditionally-present": true,
        "never-present": false,
      })
    ).toBe("always-present conditionally-present");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
    expect(cn(null, undefined, false)).toBe("");
  });
});

describe("formatVoteAverage utility function", () => {
  it("formats vote average correctly", () => {
    expect(formatVoteAverage(8.5)).toBe("85%");
    expect(formatVoteAverage(7.2)).toBe("72%");
    expect(formatVoteAverage(9.0)).toBe("90%");
  });

  it("handles edge cases", () => {
    expect(formatVoteAverage(0)).toBe("0%");
    expect(formatVoteAverage(10)).toBe("100%");
    expect(formatVoteAverage(0.1)).toBe("1%");
    expect(formatVoteAverage(9.99)).toBe("100%");
  });

  it("rounds correctly", () => {
    expect(formatVoteAverage(8.54)).toBe("85%");
    expect(formatVoteAverage(8.55)).toBe("86%");
    expect(formatVoteAverage(8.44)).toBe("84%");
    expect(formatVoteAverage(8.45)).toBe("85%");
  });

  it("handles decimal precision", () => {
    expect(formatVoteAverage(7.777)).toBe("78%");
    expect(formatVoteAverage(6.123)).toBe("61%");
  });

  it("handles negative values", () => {
    // Although unlikely in real usage, test edge case
    expect(formatVoteAverage(-1)).toBe("-10%");
  });
});
