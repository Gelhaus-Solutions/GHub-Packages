/**
 * Canonical JSON is the contract between the server that signs a snapshot and
 * every product that verifies one, so it is pinned here byte for byte. A
 * change that makes one of these fail invalidates every signature issued.
 *
 * Escapes are built from a backslash character rather than written into the
 * source, so that what the test compares is unambiguous whichever tool last
 * touched this file.
 */

import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";

const BS = String.fromCharCode(92);
const u = (hex: string): string => `${BS}u${hex}`;
const char = (codePoint: number): string => String.fromCodePoint(codePoint);

describe("canonicalJson", () => {
  it("sorts the keys of every object, at every depth, and keeps arrays in order", () => {
    const value = { b: 1, a: { d: [3, 1, 2], c: [{ f: 1, e: { h: null, g: true } }] } };
    expect(canonicalJson(value)).toBe(
      '{"a":{"c":[{"e":{"g":true,"h":null},"f":1}],"d":[3,1,2]},"b":1}',
    );
  });

  it("writes no whitespace anywhere", () => {
    expect(canonicalJson({ a: [1, { b: "two words" }], c: {} })).toBe(
      '{"a":[1,{"b":"two words"}],"c":{}}',
    );
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson({})).toBe("{}");
  });

  it("orders keys by UTF-16 code unit, not by locale, number or code point", () => {
    // Upper case before lower, a prefix before what extends it.
    expect(canonicalJson({ b: 1, B: 2, a: 3, aa: 4, A: 5 })).toBe(
      '{"A":5,"B":2,"a":3,"aa":4,"b":1}',
    );
    // Integer-like keys, which an object enumerates in numeric order.
    expect(canonicalJson({ 10: "ten", 9: "nine", 1: "one" })).toBe(
      '{"1":"one","10":"ten","9":"nine"}',
    );
    // Above U+FFFF a character is two code units starting at U+D800, so it
    // sorts before U+FFFF here, where code point order would put it after.
    const emoji = char(0x1f600);
    const last = char(0xffff);
    expect(canonicalJson({ [last]: 1, [emoji]: 2 })).toBe(`{"${emoji}":2,"${last}":1}`);
  });

  it("sorts the keys of RFC 8785's example as it does", () => {
    // The euro sign, a carriage return, the Hebrew dalet with dagesh, "1", the
    // grinning face, U+0080 and o with diaeresis, in the RFC's order.
    const source = `{"${u("20ac")}":"euro","${u("000d")}":"return","${u("fb33")}":"dalet","${u("0031")}":"one","${u("d83d")}${u("de00")}":"face","${u("0080")}":"control","${u("00f6")}":"o"}`;
    expect(canonicalJson(JSON.parse(source))).toBe(
      `{"${BS}r":"return","1":"one","${char(0x80)}":"control","${char(0xf6)}":"o","${char(0x20ac)}":"euro","${char(0x1f600)}":"face","${char(0xfb33)}":"dalet"}`,
    );
  });

  it("writes RFC 8785's worked example byte for byte", () => {
    const input = `{
      "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
      "string": "${u("20ac")}$${u("000F")}${u("000a")}A'${u("0042")}${u("0022")}${u("005c")}${BS}${BS}${BS}"${BS}/",
      "literals": [null, true, false]
    }`;
    const expected =
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
      `"string":"${char(0x20ac)}$${BS}u000f${BS}nA'B${BS}"${BS}${BS}${BS}${BS}${BS}"/"}`;
    expect(canonicalJson(JSON.parse(input))).toBe(expected);
  });

  it("escapes only quotes, backslashes and control characters", () => {
    const value = `say ${'"'}hi${'"'} ${BS} tab\tline\nbell${char(7)} umlaut ${char(0xfc)} emoji ${char(0x1f600)} separator ${char(0x2028)}`;
    expect(canonicalJson(value)).toBe(
      `"say ${BS}"hi${BS}" ${BS}${BS} tab${BS}tline${BS}nbell${BS}u0007 umlaut ${char(0xfc)} emoji ${char(0x1f600)} separator ${char(0x2028)}"`,
    );
    // A lone surrogate is written as an escape, as JSON.stringify does.
    expect(canonicalJson(char(0xd800))).toBe(`"${u("d800")}"`);
    // Keys are escaped exactly as values are.
    expect(canonicalJson({ [`a${'"'}b`]: 1 })).toBe(`{"a${BS}"b":1}`);
  });

  it("writes numbers in the shortest form that reads back as the same number", () => {
    expect(canonicalJson([1, 1.5, -0, 1e21, 1e-7, 0.1 + 0.2, 2 ** 53])).toBe(
      "[1,1.5,0,1e+21,1e-7,0.30000000000000004,9007199254740992]",
    );
  });

  it("leaves out a property that is undefined, as an absent one, and keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson({ summary: undefined, id: "x" })).toBe(canonicalJson({ id: "x" }));
  });

  it("accepts the same object twice where it is not inside itself", () => {
    const shared = { a: 1 };
    expect(canonicalJson({ x: shared, y: [shared, shared] })).toBe(
      '{"x":{"a":1},"y":[{"a":1},{"a":1}]}',
    );
  });

  it("accepts an object without a prototype, as JSON.parse can produce", () => {
    const bare = Object.assign(Object.create(null) as object, { b: 2, a: 1 });
    expect(canonicalJson(bare)).toBe('{"a":1,"b":2}');
  });

  it("refuses anything that is not plain JSON, rather than choosing how to write it", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    class Version {
      readonly id = "x";
    }
    const refused: [string, unknown][] = [
      ["NaN", Number.NaN],
      ["Infinity", { a: Number.POSITIVE_INFINITY }],
      ["a Date", { at: new Date(0) }],
      ["a function", { f: () => 1 }],
      ["a symbol", Symbol("s")],
      ["a bigint", { n: BigInt(1) }],
      ["undefined", undefined],
      ["undefined in an array", [1, undefined]],
      // eslint-disable-next-line no-sparse-arrays
      ["a hole in an array", [1, , 3]],
      ["a Map", new Map([["a", 1]])],
      ["a class instance", new Version()],
      ["a boxed string", { s: Object("boxed") }],
      ["a symbol key", { [Symbol("k")]: 1 }],
      ["a cycle", cyclic],
    ];
    for (const [what, value] of refused) {
      expect(() => canonicalJson(value), what).toThrow(TypeError);
    }
  });

  it("is what JSON.parse reads back unchanged, and writes again identically", () => {
    const value = { z: [1, "two", { y: null, x: false }], a: { nested: { deeper: "yes" } } };
    const text = canonicalJson(value);
    expect(JSON.parse(text)).toEqual(value);
    expect(canonicalJson(JSON.parse(text))).toBe(text);
  });
});
