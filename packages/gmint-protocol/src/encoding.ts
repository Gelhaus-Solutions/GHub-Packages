/**
 * Byte helpers the protocol relies on. Strict on input: a base64url string that does not
 * re-encode to itself is rejected, so one value has exactly one spelling on the wire and a
 * verifier never has to wonder whether two encodings mean the same bytes.
 */

import { createHash } from "node:crypto";

const B64URL = /^[A-Za-z0-9_-]*$/;

export function b64uEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64url");
}

/** Decodes unpadded, canonical base64url; null for anything else. */
export function b64uDecode(text: string): Uint8Array | null {
  if (!B64URL.test(text) || text.length % 4 === 1) return null;
  const bytes = Buffer.from(text, "base64url");
  if (bytes.toString("base64url") !== text) return null;
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Decodes UTF-8, refusing malformed sequences; null on error. */
export function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** A two-byte big-endian length followed by the bytes, so concatenations cannot be ambiguous. */
export function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 0xffff) throw new RangeError("value too long for a 16-bit length prefix");
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
}

/**
 * Compares two values of the same, public length without an early exit. Callers compare
 * digests or fixed-size values only; comparing different lengths returns false at once, which
 * leaks nothing because the lengths are fixed by the protocol.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
