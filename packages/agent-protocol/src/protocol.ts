/**
 * The server half of the GOpen agents' wire protocol: GOpenCDR's mirror agent and GOpenCNR's join
 * agent sign every request to their control plane the same way, through the Go agent core
 * (gopencsr/agentcore), and each control plane checks it here. A request carries
 * `Authorization: <scheme> <compact JWS>` (RFC 7515): EdDSA only, a protected header of exactly
 * alg, typ and one of kid (an enrolled key's id) or jwk (a new key, on the enrolment alone), and
 * claims that bind the request's audience, method, path and body for one minute at most. A key
 * rotation carries a proof: a JWS by the new key over the agent, the api and a minute.
 *
 * Each product names its own scheme, JWS types, request paths and agent ids (AgentProtocol); the
 * rest is the same for every agent. Pure: looking the key up and taking the jti once are the
 * caller's, since they need its database. Everything that needs no database is checked here,
 * before anything is looked up.
 */
import { createHash, createPublicKey, verify } from "node:crypto";

/** What one product's agents name in their requests. */
export interface AgentProtocol {
  /** The Authorization scheme, such as GOCDR-Mirror. */
  scheme: string;
  /** The JWS typ of a request assertion, such as gocdr-mirror+jwt. */
  requestType: string;
  /** The JWS typ of a new key's proof, such as gocdr-mirror-key+jwt. */
  keyProofType: string;
  /** The paths a request may name, without a query: the agent api and nothing else. */
  paths: RegExp;
  /** An agent's id, as iss names it. */
  agentId: RegExp;
}

/** The longest a request assertion or a key proof holds, from iat to exp, in seconds. */
export const REQUEST_LIFETIME_SECONDS = 60;

/** How far an assertion's iat may lie ahead of this clock, in seconds. */
export const SKEW_SECONDS = 30;

/**
 * An api's origin, which every claim names as its audience: a scheme and a host, with a port only
 * where one is needed, and nothing after it, such as https://cdr.gplatform.org.
 */
export const AUDIENCE = /^https?:\/\/[a-z0-9.-]{1,253}(?::[0-9]{1,5})?$/;

/** A key's id: its RFC 7638 JWK thumbprint, SHA-256 in base64url without padding. */
export const KEY_ID = /^[A-Za-z0-9_-]{43}$/;

/** Random, 16 to 48 bytes in base64url: taken once per key. */
const JTI = /^[A-Za-z0-9_-]{22,64}$/;

/** A SHA-256 digest in base64url without padding. */
const SHA256 = /^[A-Za-z0-9_-]{43}$/;

/** An assertion or a proof that does not hold, and why, for the agent's operator to read. */
export class AssertionRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AssertionRefused";
  }
}

/** The payload of a request assertion. Times are whole seconds since the epoch. */
export interface RequestClaims {
  /** The agent's id, from its enrolment. The enrolment request itself has none yet. */
  iss?: string;
  /** The origin of the api the agent enrolled with. */
  aud: string;
  iat: number;
  /** At most REQUEST_LIFETIME_SECONDS after iat. */
  exp: number;
  jti: string;
  method: "GET" | "POST";
  /** The request's path without its query. */
  path: string;
  /** The SHA-256 of the body exactly as sent: of the empty string for a request with none. */
  bodySha256: string;
}

/** What a new key signs: the agent, the api, and a minute's window, once. */
export interface KeyProofClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** The bytes of canonical base64url without padding, or a refusal: no other spelling is taken. */
function base64url(part: string, what: string): Buffer {
  const bytes = Buffer.from(part, "base64url");
  if (!BASE64URL.test(part) || bytes.toString("base64url") !== part) {
    throw new AssertionRefused(`the ${what} is not canonical base64url`);
  }
  return bytes;
}

function json(part: string, what: string): unknown {
  try {
    return JSON.parse(base64url(part, what).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof AssertionRefused) throw error;
    throw new AssertionRefused(`the ${what} is not JSON`);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === "string" && pattern.test(value);

/**
 * The claims an object holds, each checked against its rule, or a refusal naming every claim that
 * fails and every member that is no claim at all.
 */
function claimsOf<T>(
  value: unknown,
  rules: Record<string, { optional?: boolean; holds: (value: unknown) => boolean }>,
  what: string,
): T {
  if (!isRecord(value)) throw new AssertionRefused(`the ${what} do not hold: not an object`);
  const wrong: string[] = [];
  for (const [name, rule] of Object.entries(rules)) {
    if (!(name in value)) {
      if (rule.optional !== true) wrong.push(`${name} is missing`);
    } else if (!rule.holds(value[name])) {
      wrong.push(name);
    }
  }
  for (const name of Object.keys(value)) {
    if (!(name in rules)) wrong.push(`${name} is not a claim`);
  }
  if (wrong.length > 0) throw new AssertionRefused(`the ${what} do not hold: ${wrong.join(", ")}`);
  return value as T;
}

/**
 * The encodings of Ed25519's small-order points, with the sign bit cleared, as libsodium refuses
 * them: a signature by such a key can be forged for any message, so an agent enrolled with one
 * could be spoken for by anyone. With them, y = p and y = p + 1, which name points of small order
 * in a non-canonical way.
 */
const SMALL_ORDER = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0100000000000000000000000000000000000000000000000000000000000000",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
];

/** p = 2^255 - 19, little endian, as an Ed25519 point's y is written. */
const P = Buffer.from("edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", "hex");

/** Whether a key is a small-order point, or writes its y at or past p (non-canonical). */
export function weakKey(publicKey: Buffer): boolean {
  const y = Buffer.from(publicKey);
  y[31] = (y[31] ?? 0) & 0x7f;
  if (SMALL_ORDER.includes(y.toString("hex"))) return true;
  // y >= p, compared from the most significant byte down.
  for (let i = 31; i >= 0; i -= 1) {
    const a = y[i] ?? 0;
    const b = P[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/** The RFC 7638 thumbprint of an Ed25519 public key: an agent key's id. */
export function thumbprint(publicKey: Buffer): string {
  const x = publicKey.toString("base64url");
  return createHash("sha256")
    .update(JSON.stringify({ crv: "Ed25519", kty: "OKP", x }))
    .digest("base64url");
}

/** The Ed25519 public key a jwk carries, or a refusal for anything but kty, crv and x. */
function jwkKey(jwk: unknown): Buffer {
  if (
    !isRecord(jwk) ||
    Object.keys(jwk).sort().join(",") !== "crv,kty,x" ||
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    typeof jwk.x !== "string"
  ) {
    throw new AssertionRefused("jwk is not an Ed25519 public key (kty, crv and x only)");
  }
  const publicKey = base64url(jwk.x, "jwk's x");
  if (publicKey.length !== 32) throw new AssertionRefused("jwk's x is not 32 bytes");
  if (weakKey(publicKey)) {
    throw new AssertionRefused("jwk's x is a small-order or non-canonical Ed25519 point");
  }
  return publicKey;
}

/** The key an assertion names: an enrolled key by its id, or a new one it carries. */
export type AssertionKey =
  { kind: "kid"; keyId: string } | { kind: "jwk"; keyId: string; publicKey: Buffer };

export interface ParsedAssertion {
  key: AssertionKey;
  claims: RequestClaims;
  /** What the signature covers, and the signature. */
  signingInput: Buffer;
  signature: Buffer;
}

/**
 * Takes the Authorization header apart and checks everything that needs neither a key nor the
 * clock: the scheme, the JWS shape, the protected header and the claims' shape.
 */
export function parseAssertion(
  protocol: AgentProtocol,
  authorization: string | undefined,
): ParsedAssertion {
  if (authorization === undefined) throw new AssertionRefused("no Authorization header");
  const space = authorization.indexOf(" ");
  const scheme = space < 0 ? authorization : authorization.slice(0, space);
  if (scheme.toLowerCase() !== protocol.scheme.toLowerCase()) {
    throw new AssertionRefused(`the Authorization scheme is not ${protocol.scheme}`);
  }
  const parts = authorization
    .slice(space + 1)
    .trim()
    .split(".");
  if (parts.length !== 3) throw new AssertionRefused("the assertion is not a compact JWS");
  const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;

  const header = json(headerPart, "protected header");
  if (!isRecord(header)) throw new AssertionRefused("the protected header is not an object");
  const extra = Object.keys(header).filter((name) => !["alg", "typ", "kid", "jwk"].includes(name));
  if (extra.length > 0) {
    throw new AssertionRefused(`the protected header carries ${extra.join(", ")}`);
  }
  if (header.alg !== "EdDSA") throw new AssertionRefused("alg is not EdDSA");
  if (header.typ !== protocol.requestType) {
    throw new AssertionRefused(`typ is not ${protocol.requestType}`);
  }
  if ((header.kid === undefined) === (header.jwk === undefined)) {
    throw new AssertionRefused("the protected header names exactly one of kid and jwk");
  }

  let key: AssertionKey;
  if (header.kid !== undefined) {
    if (!matches(header.kid, KEY_ID)) throw new AssertionRefused("kid is not a key id");
    key = { kind: "kid", keyId: header.kid };
  } else {
    const publicKey = jwkKey(header.jwk);
    key = { kind: "jwk", keyId: thumbprint(publicKey), publicKey };
  }

  const claims = claimsOf<RequestClaims>(
    json(payloadPart, "payload"),
    {
      iss: { optional: true, holds: (v) => matches(v, protocol.agentId) },
      aud: { holds: (v) => matches(v, AUDIENCE) },
      iat: { holds: isTime },
      exp: { holds: isTime },
      jti: { holds: (v) => matches(v, JTI) },
      method: { holds: (v) => v === "GET" || v === "POST" },
      path: { holds: (v) => matches(v, protocol.paths) },
      bodySha256: { holds: (v) => matches(v, SHA256) },
    },
    "claims",
  );
  const signature = base64url(signaturePart, "signature");
  if (signature.length !== 64) throw new AssertionRefused("the signature is not 64 bytes");
  return {
    key,
    claims,
    signingInput: Buffer.from(`${headerPart}.${payloadPart}`, "ascii"),
    signature,
  };
}

function ed25519(publicKey: Buffer) {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicKey.toString("base64url") },
    format: "jwk",
  });
}

/** Whether the signature is the key's, over the signing input. */
export function signatureHolds(assertion: ParsedAssertion, publicKey: Buffer): boolean {
  return verify(null, assertion.signingInput, ed25519(publicKey), assertion.signature);
}

/** The request an assertion must match. */
export interface RequestFacts {
  /** The api's origin, which the claims name as their audience. */
  audience: string;
  method: string;
  /** The path without its query. */
  path: string;
  /** The query string, with its question mark, or nothing: an agent request carries none. */
  query: string;
  /** The Content-Encoding header, if any: an agent request is never compressed. */
  contentEncoding: string | undefined;
  /** The body exactly as it arrived, or nothing. */
  body: Buffer | undefined;
  now: Date;
}

/** The SHA-256 of a body in base64url, of the empty string for none. */
export const bodyHash = (body: Buffer | undefined): string =>
  createHash("sha256")
    .update(body ?? Buffer.alloc(0))
    .digest("base64url");

/** Checks the claims against the request and the clock. */
export function claimsMatch(claims: RequestClaims, request: RequestFacts): void {
  const now = Math.floor(request.now.getTime() / 1000);
  if (claims.exp <= claims.iat || claims.exp - claims.iat > REQUEST_LIFETIME_SECONDS) {
    throw new AssertionRefused(
      `an assertion holds for at most ${REQUEST_LIFETIME_SECONDS} seconds from its iat`,
    );
  }
  if (claims.iat > now + SKEW_SECONDS) throw new AssertionRefused("iat lies in the future");
  if (claims.exp <= now) throw new AssertionRefused("the assertion has expired");
  if (claims.aud !== request.audience) {
    throw new AssertionRefused(`aud is not this api, ${request.audience}`);
  }
  if (request.query !== "") throw new AssertionRefused("an agent request carries no query string");
  if (request.contentEncoding !== undefined && request.contentEncoding !== "identity") {
    throw new AssertionRefused("an agent request is not compressed");
  }
  if (claims.method !== request.method) throw new AssertionRefused("method is not the request's");
  if (claims.path !== request.path) throw new AssertionRefused("path is not the request's");
  if (claims.bodySha256 !== bodyHash(request.body)) {
    throw new AssertionRefused("bodySha256 is not the body's");
  }
}

/** A new key's proof of itself, taken apart and its signature checked. */
export interface KeyProof {
  keyId: string;
  publicKey: Buffer;
  claims: KeyProofClaims;
}

/**
 * Takes a key rotation's proof apart: a compact JWS whose protected header is exactly alg, the
 * protocol's key proof typ and the new key's jwk, signed by that key, whose claims name the agent
 * and this api and hold for a minute at most around now.
 */
export function parseKeyProof(
  protocol: AgentProtocol,
  proof: string,
  audience: string,
  now: Date,
): KeyProof {
  const parts = proof.split(".");
  if (parts.length !== 3) throw new AssertionRefused("the proof is not a compact JWS");
  const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;
  const header = json(headerPart, "proof's protected header");
  if (!isRecord(header) || Object.keys(header).sort().join(",") !== "alg,jwk,typ") {
    throw new AssertionRefused(
      "the proof's protected header is alg, typ and jwk, and nothing else",
    );
  }
  if (header.alg !== "EdDSA") throw new AssertionRefused("the proof's alg is not EdDSA");
  if (header.typ !== protocol.keyProofType) {
    throw new AssertionRefused(`the proof's typ is not ${protocol.keyProofType}`);
  }
  const publicKey = jwkKey(header.jwk);
  const claims = claimsOf<KeyProofClaims>(
    json(payloadPart, "proof's payload"),
    {
      iss: { holds: (v) => matches(v, protocol.agentId) },
      aud: { holds: (v) => matches(v, AUDIENCE) },
      iat: { holds: isTime },
      exp: { holds: isTime },
      jti: { holds: (v) => matches(v, JTI) },
    },
    "proof's claims",
  );
  const signature = base64url(signaturePart, "proof's signature");
  if (signature.length !== 64) throw new AssertionRefused("the proof's signature is not 64 bytes");
  if (
    !verify(
      null,
      Buffer.from(`${headerPart}.${payloadPart}`, "ascii"),
      ed25519(publicKey),
      signature,
    )
  ) {
    throw new AssertionRefused("the proof's signature does not verify");
  }
  const seconds = Math.floor(now.getTime() / 1000);
  const { iat, exp, aud } = claims;
  if (exp <= iat || exp - iat > REQUEST_LIFETIME_SECONDS) {
    throw new AssertionRefused("the proof holds for at most a minute from its iat");
  }
  if (iat > seconds + SKEW_SECONDS || exp <= seconds) {
    throw new AssertionRefused("the proof is not current");
  }
  if (aud !== audience) throw new AssertionRefused(`the proof's aud is not this api, ${audience}`);
  return { keyId: thumbprint(publicKey), publicKey, claims };
}
