import { describe, expect, it } from "vitest";
import { parseStrictJson } from "./json";

describe("parseStrictJson", () => {
  it("parses ordinary JSON with integers", () => {
    expect(parseStrictJson('{"a":[1,-2,0,"x",true,null,{"b":"\\u00e9\\n"}]}')).toEqual({
      a: [1, -2, 0, "x", true, null, { b: "é\n" }],
    });
  });

  it("returns objects without a prototype", () => {
    const v = parseStrictJson('{"a":1}') as object;
    expect(Object.getPrototypeOf(v)).toBeNull();
  });

  it.each([
    ['{"a":1,"a":2}', "duplicate key"],
    ['{"__proto__":{}}', "__proto__"],
    ['{"constructor":1}', "constructor"],
    ['{"prototype":1}', "prototype"],
    ["1.5", "fraction"],
    ["1e3", "exponent"],
    ["9007199254740993", "unsafe integer"],
    ["-0", "negative zero"],
    ["01", "leading zero"],
    ['"\\ud800"', "lone surrogate"],
    ['"a\u0001"', "control character"],
    ['{"a":1} x', "trailing data"],
    ["[1,]", "trailing comma"],
    ["{'a':1}", "single quotes"],
    ["NaN", "NaN"],
    ['"\\x41"', "bad escape"],
    ["[".repeat(20) + "]".repeat(20), "too deep"],
    ["", "empty"],
  ])("refuses %s (%s)", (input) => {
    expect(parseStrictJson(input)).toBeUndefined();
  });

  it("accepts a well-formed surrogate pair", () => {
    expect(parseStrictJson('"\\ud83d\\ude00"')).toBe("\u{1F600}");
  });
});
