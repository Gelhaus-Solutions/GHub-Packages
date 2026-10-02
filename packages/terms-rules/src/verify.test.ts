/**
 * A snapshot is only read once its signature holds, over exactly the bytes it
 * arrived as, with a key the release pins.
 *
 * The key pair is made here, per run: the real signing key lives in the
 * service's key store and its private half never leaves it, so a test signs
 * with a key of its own and pins that key's public half the way keys.ts will
 * pin the real one.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { GCTL_TERMS_0_1_4 } from "./fixtures/gctl-terms-0.1.4.js";
import { SnapshotError } from "./snapshot.js";
import {
  parseSnapshotSignature,
  SnapshotSignatureError,
  verifySnapshot,
  type PinnedKey,
  type SnapshotSignature,
} from "./verify.js";

function keyPair(keyId: string, keyVersion: number) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pinned: PinnedKey = {
    keyId,
    keyVersion,
    publicKeySpkiDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
  const signatureOf = (text: string): SnapshotSignature => ({
    keyId,
    keyVersion,
    signature: sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64"),
  });
  return { pinned, signatureOf };
}

const CURRENT = keyPair("gpterms-snapshot", 2);
const EARLIER = keyPair("gpterms-snapshot", 1);
const KEYS = [EARLIER.pinned, CURRENT.pinned];

const TEXT = canonicalJson(GCTL_TERMS_0_1_4);
const SIGNATURE = CURRENT.signatureOf(TEXT);

function refusal(text: string, signature: SnapshotSignature, keys = KEYS): string {
  try {
    verifySnapshot(text, signature, keys);
  } catch (error) {
    expect(error).toBeInstanceOf(SnapshotSignatureError);
    return (error as Error).message;
  }
  throw new Error("verifySnapshot accepted it");
}

describe("verifySnapshot", () => {
  it("returns the snapshot when the signature holds over its canonical text", () => {
    expect(verifySnapshot(TEXT, SIGNATURE, KEYS)).toEqual(GCTL_TERMS_0_1_4);
  });

  it("verifies with whichever pinned version signed it, so a rotation adds a key", () => {
    expect(verifySnapshot(TEXT, EARLIER.signatureOf(TEXT), KEYS).serial).toBe(1);
  });

  it("refuses a snapshot with one byte changed after signing", () => {
    // Still canonical, still a valid snapshot: only the signature can tell.
    const tampered = TEXT.replace('"serial":1', '"serial":2');
    expect(tampered).not.toBe(TEXT);
    expect(canonicalJson(JSON.parse(tampered))).toBe(tampered);
    expect(refusal(tampered, SIGNATURE)).toMatch(/signature does not hold/);

    const date = TEXT.replace("2026-11-20T00:00:00+01:00", "2026-11-21T00:00:00+01:00");
    expect(date).not.toBe(TEXT);
    expect(refusal(date, SIGNATURE)).toMatch(/signature does not hold/);
  });

  it("refuses a signature with one bit changed", () => {
    const bytes = Buffer.from(SIGNATURE.signature, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    expect(refusal(TEXT, { ...SIGNATURE, signature: bytes.toString("base64") })).toMatch(
      /signature does not hold/,
    );
  });

  it("refuses text that is not canonical, even where it means the same snapshot", () => {
    const pretty = JSON.stringify(JSON.parse(TEXT), null, 2);
    expect(refusal(pretty, SIGNATURE)).toMatch(/not in canonical form/);
    // Signed as it is, it is still refused: the contract is the canonical bytes.
    expect(refusal(pretty, CURRENT.signatureOf(pretty))).toMatch(/not in canonical form/);
    expect(refusal(`${TEXT}\n`, CURRENT.signatureOf(`${TEXT}\n`))).toMatch(/not in canonical form/);
    // A key repeated, which JSON.parse would quietly resolve to the last.
    const repeated = TEXT.replace('{"documents"', '{"serial":9,"documents"');
    expect(refusal(repeated, CURRENT.signatureOf(repeated))).toMatch(/not in canonical form/);
    // Keys out of order.
    const reordered = JSON.stringify(GCTL_TERMS_0_1_4);
    expect(reordered).not.toBe(TEXT);
    expect(refusal(reordered, CURRENT.signatureOf(reordered))).toMatch(/not in canonical form/);
  });

  it("refuses a key id or key version this release does not pin", () => {
    expect(refusal(TEXT, { ...SIGNATURE, keyVersion: 3 })).toMatch(
      /key gpterms-snapshot version 3, which this release does not pin/,
    );
    const stranger = keyPair("somebody-else", 2);
    expect(refusal(TEXT, stranger.signatureOf(TEXT))).toMatch(/does not pin/);
    expect(refusal(TEXT, SIGNATURE, [])).toMatch(/does not pin/);
  });

  it("refuses a signature made by another key under a pinned key's name", () => {
    const impostor = keyPair("gpterms-snapshot", 2);
    expect(refusal(TEXT, impostor.signatureOf(TEXT))).toMatch(/signature does not hold/);
  });

  it("refuses a pinned key that is not an Ed25519 public key", () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ec: PinnedKey = {
      keyId: "gpterms-snapshot",
      keyVersion: 2,
      publicKeySpkiDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    };
    expect(refusal(TEXT, SIGNATURE, [ec])).toMatch(/not Ed25519/);
    const garbage = { ...ec, publicKeySpkiDer: Buffer.from("not a key").toString("base64") };
    expect(refusal(TEXT, SIGNATURE, [garbage])).toMatch(/not a public key/);
  });

  it("refuses text that is not JSON", () => {
    expect(refusal("{", SIGNATURE)).toMatch(/not JSON/);
  });

  it("verifies first and still refuses a signed snapshot that is malformed", () => {
    const zoneless = canonicalJson({
      ...GCTL_TERMS_0_1_4,
      generatedAt: "2026-10-01 19:16:32",
    });
    const call = () => verifySnapshot(zoneless, CURRENT.signatureOf(zoneless), KEYS);
    expect(call).toThrow(SnapshotError);
    expect(call).not.toThrow(SnapshotSignatureError);
    expect(call).toThrow(/has no zone/);
  });
});

describe("parseSnapshotSignature", () => {
  it("reads a signature as snapshot.sig.json holds it", () => {
    expect(parseSnapshotSignature(JSON.parse(JSON.stringify(SIGNATURE)))).toEqual(SIGNATURE);
  });

  it("refuses one that is malformed", () => {
    const cases: [unknown, RegExp][] = [
      [null, /should be an object/],
      [{ ...SIGNATURE, extra: 1 }, /fields it should not: extra/],
      [{ ...SIGNATURE, keyId: "" }, /names no key id/],
      [{ ...SIGNATURE, keyVersion: 0 }, /not a whole number from 1/],
      [{ ...SIGNATURE, keyVersion: "2" }, /not a whole number from 1/],
      [{ ...SIGNATURE, signature: "not base64!" }, /is not base64/],
      [{ ...SIGNATURE, signature: Buffer.alloc(32).toString("base64") }, /not 64 bytes/],
    ];
    for (const [value, message] of cases) {
      expect(() => parseSnapshotSignature(value)).toThrow(message);
      expect(() => parseSnapshotSignature(value)).toThrow(SnapshotSignatureError);
    }
  });
});
