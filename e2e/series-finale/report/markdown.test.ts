import { describe, expect, it } from "vitest";

import { cell } from "./markdown";

describe("cell", () => {
  it("escapes a pipe so it cannot end the table cell", () => {
    expect(cell("a|b")).toBe("a\\|b");
  });

  it("escapes a backslash first, so one before a pipe cannot unescape it", () => {
    // Unescaped, "x\\|y" would become "x\\\\|y" -- an escaped backslash
    // followed by a bare pipe that splits the cell.
    expect(cell("x\\|y")).toBe("x\\\\\\|y");
    expect(cell("C:\\path")).toBe("C:\\\\path");
  });

  it("folds line breaks into spaces", () => {
    expect(cell("one\r\ntwo\nthree")).toBe("one two three");
  });
});
