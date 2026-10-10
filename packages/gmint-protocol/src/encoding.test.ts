import { describe, expect, it } from "vitest";
import { b64uDecode, b64uEncode, constantTimeEqual, lengthPrefixed } from "./encoding";

describe("base64url", () => {
  it("round-trips", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
      expect(b64uDecode(b64uEncode(bytes))).toEqual(bytes);
    }
  });

  it("refuses padding, standard alphabet, whitespace and non-canonical trailing bits", () => {
    // "AB" and "AAB" decode to bytes whose re-encoding differs (non-zero trailing bits).
    for (const bad of ["AA==", "A+/B", "AA AA", "AB", "AAB", "A", "\u00e9"]) {
      expect(b64uDecode(bad)).toBeNull();
    }
    expect(b64uDecode("AA")).toEqual(new Uint8Array([0]));
  });
});

describe("constantTimeEqual", () => {
  it("compares", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("lengthPrefixed", () => {
  it("prefixes a big-endian 16-bit length", () => {
    expect(lengthPrefixed(new Uint8Array([9, 9, 9]))).toEqual(new Uint8Array([0, 3, 9, 9, 9]));
    expect(() => lengthPrefixed(new Uint8Array(0x10000))).toThrow(RangeError);
  });
});
