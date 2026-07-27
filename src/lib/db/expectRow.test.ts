import { describe, expect, it } from "vitest";

import { expectRow } from "./expectRow";

// expectRow exists so that a violated "this statement always returns a row"
// assumption fails as a named error at the bad assumption, rather than as
// `Cannot read properties of undefined` several lines downstream. These tests pin
// that contract, since it is the whole reason to prefer it over `!`.
describe("expectRow", () => {
  it("returns the first row when there is one", () => {
    const row = { id: "list-1", name: "Watchlist" };
    expect(expectRow([row], "createList insert")).toBe(row);
  });

  it("ignores anything beyond the first row", () => {
    const first = { id: "a" };
    expect(expectRow([first, { id: "b" }], "somewhere")).toBe(first);
  });

  it("throws naming the statement when the array is empty", () => {
    expect(() => expectRow([], "createList insert")).toThrow(
      "createList insert: expected one row, got none",
    );
  });

  // The distinction that matters: a row that is present but falsy is still a
  // row. Guarding on truthiness instead of `undefined` would reject it.
  it("returns a falsy row rather than treating it as missing", () => {
    expect(expectRow([0], "numeric")).toBe(0);
    expect(expectRow([null], "nullable")).toBe(null);
    expect(expectRow([false], "boolean")).toBe(false);
  });

  it("still throws when the first element is explicitly undefined", () => {
    expect(() => expectRow([undefined], "sparse")).toThrow(/expected one row/);
  });
});
