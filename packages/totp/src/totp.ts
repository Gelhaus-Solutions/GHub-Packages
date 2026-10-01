/**
 * TOTP (RFC 6238) and the base32 alphabet authenticator apps expect.
 *
 * Hand-written rather than pulled in, for two reasons that both point the same
 * way. The algorithm is HMAC, a counter and a truncation: forty lines, frozen
 * since 2011, and verifiable against the RFC's own published vectors, which the
 * tests next to this file use. And a sign-in carries every dependency it adds
 * into the supply chain of every product that uses it, so the bar for adding
 * one is higher than "it exists".
 *
 * Verification accepts a window of steps either side of now. Clock drift on a
 * phone is real, and a person locked out of their own account during an
 * incident is a worse outcome than a thirty second replay window.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 4648 base32, which is what every authenticator app reads. */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface TotpOptions {
  /** Seconds per step. 30 is what every authenticator assumes. */
  stepSeconds?: number;
  digits?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
}

export interface TotpVerifyOptions extends TotpOptions {
  /** Steps of drift accepted either side. 1 is 30 seconds each way. */
  window?: number;
  /** Unix seconds. Injected so tests and audits can evaluate at a moment. */
  now?: number;
}

/** A fresh secret. 20 bytes is the RFC's SHA-1 recommendation. */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(new Uint8Array(randomBytes(byteLength)));
}

/** The code for a given moment. */
export function totpCode(
  secretBase32: string,
  unixSeconds: number,
  options: TotpOptions = {},
): string {
  const step = options.stepSeconds ?? 30;
  const digits = options.digits ?? 6;
  const algorithm = options.algorithm ?? "sha1";

  const counter = Math.floor(unixSeconds / step);
  const buffer = Buffer.alloc(8);
  // Big-endian 64 bit counter. Node's writeBigUInt64BE keeps this readable and
  // correct past 2038, which a 32 bit write would not be.
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm, Buffer.from(base32Decode(secretBase32)))
    .update(buffer)
    .digest();

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * Whether a presented code is valid now. Compares in constant time and checks
 * every step in the window, so a wrong code takes the same work as a right one.
 */
export function verifyTotp(
  secretBase32: string,
  presented: string,
  options: TotpVerifyOptions = {},
): boolean {
  const window = options.window ?? 1;
  const step = options.stepSeconds ?? 30;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  const candidate = presented.replace(/\s/g, "");
  if (!/^\d+$/.test(candidate)) return false;

  let matched = false;
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = totpCode(secretBase32, now + drift * step, options);
    // No early exit: leaving the loop on a match would make a near-miss
    // measurably faster than a miss.
    if (constantTimeEquals(expected, candidate)) matched = true;
  }
  return matched;
}

/** The URI an authenticator app scans. Never logged: it contains the secret. */
export function totpUri(input: {
  secretBase32: string;
  accountName: string;
  issuer: string;
  digits?: number;
  stepSeconds?: number;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(input.digits ?? 6),
    period: String(input.stepSeconds ?? 30),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  // No padding: authenticator apps accept it either way, and unpadded is what
  // people end up typing when they enter a secret by hand.
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const normalised = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalised) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`'${character}' is not a base32 character`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
