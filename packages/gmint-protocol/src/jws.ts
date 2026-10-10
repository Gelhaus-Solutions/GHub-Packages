/**
 * Compact JWS (RFC 7515) with EdDSA over Ed25519 (RFC 8037), and nothing else.
 *
 * One algorithm, decided by the protocol and never by the message: `alg` must be `EdDSA`, so
 * there is no `none`, no HMAC with a public key, no negotiation. The protected header may hold
 * `alg`, `typ` and `kid` and no other member; `crit`, `jku`, `jwk`, `x5u` and friends are
 * refused, so a message can never point a verifier at a key of its own choosing. The signature
 * covers the exact bytes that travelled, and the payload is parsed only after it verified.
 */

import { createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { b64uDecode, b64uEncode, utf8Decode, utf8Encode } from "./encoding";
import { hasExactKeys, isObject, parseStrictJson } from "./json";

/** The largest compact JWS the protocol will even look at. */
export const MAX_JWS_BYTES = 16 * 1024;

export interface JwsHeader {
  alg: "EdDSA";
  typ: string;
  kid: string;
}

/** Something that can produce an Ed25519 signature, locally or in OpenBao. */
export interface Ed25519Signer {
  readonly kid: string;
  sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export type JwsError =
  | "jws_too_large"
  | "jws_malformed"
  | "jws_bad_header"
  | "jws_wrong_type"
  | "jws_unknown_key"
  | "jws_bad_signature";

export type JwsResult<T> = { ok: true; value: T } | { ok: false; error: JwsError };

export interface ParsedJws {
  header: JwsHeader;
  /** The raw payload bytes, exactly as signed. */
  payload: Uint8Array;
  /** ASCII bytes of `header.payload`, the JWS signing input. */
  signingInput: Uint8Array;
  signature: Uint8Array;
}

const KID = /^[A-Za-z0-9._:-]{1,128}$/;
const TYP = /^[a-z0-9.+-]{1,64}$/;

export async function signCompact(
  typ: string,
  payload: Uint8Array,
  signer: Ed25519Signer,
): Promise<string> {
  if (!TYP.test(typ) || !KID.test(signer.kid)) throw new TypeError("invalid typ or kid");
  const header = b64uEncode(utf8Encode(JSON.stringify({ alg: "EdDSA", typ, kid: signer.kid })));
  const input = `${header}.${b64uEncode(payload)}`;
  const signature = await signer.sign(utf8Encode(input));
  if (signature.length !== 64) throw new Error("signer returned a signature that is not 64 bytes");
  return `${input}.${b64uEncode(signature)}`;
}

/** Splits and checks the structure and header of a compact JWS. Does not verify. */
export function parseCompact(jws: string, expectedTyp: string): JwsResult<ParsedJws> {
  if (jws.length > MAX_JWS_BYTES) return { ok: false, error: "jws_too_large" };
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, error: "jws_malformed" };
  const [h, p, s] = parts as [string, string, string];
  const headerBytes = b64uDecode(h);
  const payload = b64uDecode(p);
  const signature = b64uDecode(s);
  if (!headerBytes || !payload || !signature || signature.length !== 64 || h.length === 0) {
    return { ok: false, error: "jws_malformed" };
  }
  const headerText = utf8Decode(headerBytes);
  const header = headerText == null ? undefined : parseStrictJson(headerText);
  if (
    !isObject(header) ||
    !hasExactKeys(header, ["alg", "typ", "kid"]) ||
    header.alg !== "EdDSA" ||
    typeof header.typ !== "string" ||
    typeof header.kid !== "string" ||
    !KID.test(header.kid)
  ) {
    return { ok: false, error: "jws_bad_header" };
  }
  if (header.typ !== expectedTyp) return { ok: false, error: "jws_wrong_type" };
  return {
    ok: true,
    value: {
      header: { alg: "EdDSA", typ: header.typ, kid: header.kid },
      payload,
      signingInput: utf8Encode(`${h}.${p}`),
      signature,
    },
  };
}

/** An Ed25519 public key from its raw 32 bytes. */
export function ed25519PublicKey(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new TypeError("an Ed25519 public key is 32 bytes");
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: b64uEncode(raw) },
    format: "jwk",
  });
}

/** Raw 32-byte public half of an Ed25519 or X25519 key object. */
export function rawPublicKey(key: KeyObject): Uint8Array {
  const jwk = key.export({ format: "jwk" });
  const raw = typeof jwk.x === "string" ? b64uDecode(jwk.x) : null;
  if (!raw || raw.length !== 32) throw new TypeError("not an OKP key");
  return raw;
}

// A fixed, valid key that signs nothing: used when a kid is unknown so the time taken does not
// tell an attacker which kids exist.
const DUMMY_KEY = ed25519PublicKey(b64uDecode("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")!);

/**
 * Parses and verifies a compact JWS. `resolveKey` maps a kid to its public key, or returns
 * undefined; an unknown kid still costs one verification.
 */
export function verifyCompact(
  jws: string,
  expectedTyp: string,
  resolveKey: (kid: string) => KeyObject | undefined,
): JwsResult<ParsedJws> {
  const parsed = parseCompact(jws, expectedTyp);
  if (!parsed.ok) return parsed;
  const key = resolveKey(parsed.value.header.kid);
  let good: boolean;
  try {
    good = edVerify(null, parsed.value.signingInput, key ?? DUMMY_KEY, parsed.value.signature);
  } catch {
    good = false;
  }
  if (!key) return { ok: false, error: "jws_unknown_key" };
  if (!good) return { ok: false, error: "jws_bad_signature" };
  return parsed;
}

/** A local Ed25519 signer around a private key object (clients, tests, the dev signer). */
export function localSigner(kid: string, privateKey: KeyObject): Ed25519Signer {
  if (privateKey.asymmetricKeyType !== "ed25519") throw new TypeError("not an Ed25519 key");
  return { kid, sign: (data) => new Uint8Array(edSign(null, data, privateKey)) };
}
