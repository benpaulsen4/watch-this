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
