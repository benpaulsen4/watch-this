import { describe, expect, it } from "vitest";
import { z } from "zod";

import { q, searchParamsToObject } from "./query";

describe("searchParamsToObject", () => {
  it("treats an empty value as absent", () => {
    expect(searchParamsToObject(new URLSearchParams("x=&y=1"))).toEqual({
      y: "1",
    });
  });

  it("turns a repeated key into an array", () => {
    expect(searchParamsToObject(new URLSearchParams("x=1&x=2"))).toEqual({
      x: ["1", "2"],
    });
  });
});

describe("q.int", () => {
  const schema = q.int({ min: 1, max: 10, message: "Bad number" });

  it.each([
    ["7", 7],
    ["1", 1],
    ["10", 10],
    [7, 7],
  ])("accepts %s", (input, expected) => {
    expect(schema.parse(input)).toBe(expected);
  });

  it.each(["12abc", "2.5", "", "-1", "0", "11", "abc", 2.5, null])(
    "rejects %s with the given message",
    (input) => {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Bad number");
    },
  );

  it("rejects a digit string beyond the safe integer range", () => {
    const result = q.int({ message: "Bad number" }).safeParse(
      "99999999999999999999",
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Bad number");
  });

  it("can be optional", () => {
    expect(schema.optional().parse(undefined)).toBeUndefined();
  });
});

describe("q.list", () => {
  const schema = q.list(z.enum(["a", "b"]));

  it("wraps one value in an array", () => {
    expect(schema.parse("a")).toEqual(["a"]);
  });

  it("keeps many values", () => {
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("rejects a value outside the schema", () => {
    expect(schema.safeParse(["a", "c"]).success).toBe(false);
  });
});

describe("q.list with catching or lenient schemas", () => {
  it("keeps every element of an array when the element schema catches", () => {
    const schema = q.list(z.enum(["a", "b"]).catch("a"));
    expect(schema.parse(["b", "b"])).toEqual(["b", "b"]);
  });

  describe("dropInvalid", () => {
    const schema = q.list(z.enum(["a", "b"]), { dropInvalid: true });

    it("keeps valid elements and drops invalid ones", () => {
      expect(schema.parse(["a", "bogus"])).toEqual(["a"]);
    });

    it("gives an empty array for one invalid value", () => {
      expect(schema.parse("bogus")).toEqual([]);
    });

    it("wraps one valid value", () => {
      expect(schema.parse("b")).toEqual(["b"]);
    });
  });
});

// The form for an optional query param with a default. A bare `.catch()` would
// leave the key required in `z.input`, and `.optional().catch()` returns
// undefined for a missing value; contract.types.test.ts proves `.default().catch()`
// keeps it optional for `api()`.
describe("optional defaulted query param", () => {
  const sortOrder = z
    .enum(["ascending", "descending"])
    .default("ascending")
    .catch("ascending");

  it.each([
    [undefined, "ascending"],
    ["bogus", "ascending"],
    ["descending", "descending"],
    ["ascending", "ascending"],
  ])("parses %s as %s", (input, expected) => {
    expect(sortOrder.parse(input)).toBe(expected);
  });
});
