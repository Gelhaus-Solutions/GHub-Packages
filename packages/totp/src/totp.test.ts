/**
 * The RFC 6238 vectors are the whole reason this is worth writing by hand: an
 * implementation that reproduces them is correct, and one that does not is
 * wrong in a way no amount of manual testing with a phone would reveal.
 */

import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  totpUri,
  verifyTotp,
} from "./totp.js";

/** RFC 6238 appendix B uses the ASCII secret "12345678901234567890". */
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("totpCode against the RFC 6238 vectors", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`T=${seconds} produces ${expected}`, () => {
      expect(totpCode(RFC_SECRET, seconds, { digits: 8, algorithm: "sha1" })).toBe(expected);
    });
  }

  it("still works past 2038, where a 32 bit counter would not", () => {
    // 20000000000 is the vector above, and it is exactly the case a
    // writeUInt32BE implementation gets wrong.
    expect(totpCode(RFC_SECRET, 20_000_000_000, { digits: 8 })).toBe("65353130");
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000;
  const secret = generateTotpSecret();

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totpCode(secret, now), { now })).toBe(true);
  });

  it("accepts one step of drift either way", () => {
    // A phone thirty seconds out is a phone, not an attacker, and locking an
    // operator out of their own control plane mid-incident is the worse failure.
    expect(verifyTotp(secret, totpCode(secret, now - 30), { now })).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 30), { now })).toBe(true);
  });

  it("refuses drift beyond the window", () => {
    expect(verifyTotp(secret, totpCode(secret, now - 120), { now })).toBe(false);
    expect(verifyTotp(secret, totpCode(secret, now + 120), { now })).toBe(false);
  });

  it("refuses anything that is not digits", () => {
    expect(verifyTotp(secret, "abcdef", { now })).toBe(false);
    expect(verifyTotp(secret, "", { now })).toBe(false);
    expect(verifyTotp(secret, "12345", { now })).toBe(false);
  });

  it("ignores the spaces people type", () => {
    const code = totpCode(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { now })).toBe(true);
  });
});

describe("base32", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 17]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("matches the RFC 4648 vectors", () => {
    const encode = (text: string): string => base32Encode(new TextEncoder().encode(text));
    expect(encode("")).toBe("");
    expect(encode("f")).toBe("MY");
    expect(encode("fo")).toBe("MZXQ");
    expect(encode("foo")).toBe("MZXW6");
    expect(encode("foob")).toBe("MZXW6YQ");
    expect(encode("fooba")).toBe("MZXW6YTB");
    expect(encode("foobar")).toBe("MZXW6YTBOI");
  });

  it("accepts padding and lower case, because people paste both", () => {
    expect(base32Decode("mzxw6ytboi=")).toEqual(base32Decode("MZXW6YTBOI"));
  });

  it("refuses a character that is not in the alphabet", () => {
    expect(() => base32Decode("MZXW6YTB01")).toThrow(/not a base32 character/);
  });
});

describe("totpUri", () => {
  it("carries what an authenticator needs and nothing else", () => {
    const uri = totpUri({
      secretBase32: "JBSWY3DPEHPK3PXP",
      accountName: "owner@acme.example",
      issuer: "GControl",
    });
    expect(uri).toContain("otpauth://totp/GControl%3Aowner%40acme.example");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=GControl");
    expect(uri).toContain("period=30");
  });
});
