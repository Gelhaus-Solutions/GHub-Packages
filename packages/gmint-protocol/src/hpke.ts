/**
 * HPKE (RFC 9180), base mode, single shot, for one KEM and one KDF:
 * DHKEM(X25519, HKDF-SHA256) with HKDF-SHA256. The AEAD is AES-256-GCM in the protocol;
 * AES-128-GCM exists here only so the RFC's own Appendix A.1 vectors can check the shared code.
 *
 * Hand-written on node:crypto rather than pulled in: the construction is a few HKDF calls, the
 * RFC publishes vectors for it, and every dependency of a credential channel is a dependency of
 * every product that uses it.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { b64uDecode, b64uEncode, concat, utf8Encode } from "./encoding";

export type Aead = "aes-256-gcm" | "aes-128-gcm";

const KEM_ID = 0x0020;
const KDF_ID = 0x0001;
const AEAD_ID: Record<Aead, number> = { "aes-128-gcm": 0x0001, "aes-256-gcm": 0x0002 };
const NK: Record<Aead, number> = { "aes-128-gcm": 16, "aes-256-gcm": 32 };
const NN = 12;
const NH = 32;
const NSECRET = 32;
const TAG = 16;

function i2osp(n: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = n & 0xff;
    n >>>= 8;
  }
  return out;
}

const KEM_SUITE = concat(utf8Encode("KEM"), i2osp(KEM_ID, 2));
function hpkeSuite(aead: Aead): Uint8Array {
  return concat(utf8Encode("HPKE"), i2osp(KEM_ID, 2), i2osp(KDF_ID, 2), i2osp(AEAD_ID[aead], 2));
}

function hmac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac("sha256", key).update(data).digest());
}

function extract(salt: Uint8Array, ikm: Uint8Array): Uint8Array {
  return hmac(salt.length ? salt : new Uint8Array(NH), ikm);
}

function expand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let t: Uint8Array = new Uint8Array(0);
  for (let i = 0, filled = 0; filled < length; i++) {
    t = hmac(prk, concat(t, info, new Uint8Array([i + 1])));
    out.set(t.subarray(0, Math.min(t.length, length - filled)), filled);
    filled += t.length;
  }
  return out;
}

const V1 = utf8Encode("HPKE-v1");
function labeledExtract(
  suite: Uint8Array,
  salt: Uint8Array,
  label: string,
  ikm: Uint8Array,
): Uint8Array {
  return extract(salt, concat(V1, suite, utf8Encode(label), ikm));
}
function labeledExpand(
  suite: Uint8Array,
  prk: Uint8Array,
  label: string,
  info: Uint8Array,
  len: number,
): Uint8Array {
  return expand(prk, concat(i2osp(len, 2), V1, suite, utf8Encode(label), info), len);
}

export function x25519PublicFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new TypeError("an X25519 public key is 32 bytes");
  return createPublicKey({ key: { kty: "OKP", crv: "X25519", x: b64uEncode(raw) }, format: "jwk" });
}

/** An X25519 private key from its raw 32 bytes (RFC 8410 PKCS8 prefix, then the scalar). */
export function x25519PrivateFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new TypeError("an X25519 private key is 32 bytes");
  const prefix = Buffer.from("302e020100300506032b656e04220420", "hex");
  return createPrivateKey({
    key: Buffer.concat([prefix, Buffer.from(raw)]),
    format: "der",
    type: "pkcs8",
  });
}

function rawPublic(key: KeyObject): Uint8Array {
  const x = key.export({ format: "jwk" }).x;
  const raw = typeof x === "string" ? b64uDecode(x) : null;
  if (!raw || raw.length !== 32) throw new TypeError("not an X25519 key");
  return raw;
}

function dh(privateKey: KeyObject, publicKey: KeyObject): Uint8Array {
  const shared = new Uint8Array(diffieHellman({ privateKey, publicKey }));
  // RFC 9180 section 7.1.4: an all-zero X25519 output means a low-order public key.
  if (shared.every((b) => b === 0)) throw new Error("hpke: invalid public key");
  return shared;
}

/** DeriveKeyPair for X25519 (RFC 9180 section 7.1.3), used by the vectors and nothing else. */
export function deriveKeyPair(ikm: Uint8Array): { privateKey: KeyObject; publicKey: KeyObject } {
  const prk = labeledExtract(KEM_SUITE, new Uint8Array(0), "dkp_prk", ikm);
  const sk = labeledExpand(KEM_SUITE, prk, "sk", new Uint8Array(0), 32);
  const privateKey = x25519PrivateFromRaw(sk);
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

export function generateX25519(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicRaw: Uint8Array;
} {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  return { privateKey, publicKey, publicRaw: rawPublic(publicKey) };
}

export { rawPublic as x25519RawPublic };

function extractAndExpand(dhOut: Uint8Array, kemContext: Uint8Array): Uint8Array {
  const prk = labeledExtract(KEM_SUITE, new Uint8Array(0), "eae_prk", dhOut);
  return labeledExpand(KEM_SUITE, prk, "shared_secret", kemContext, NSECRET);
}

interface Context {
  key: Uint8Array;
  baseNonce: Uint8Array;
  exporterSecret: Uint8Array;
}

function keySchedule(aead: Aead, sharedSecret: Uint8Array, info: Uint8Array): Context {
  const suite = hpkeSuite(aead);
  const empty = new Uint8Array(0);
  const pskIdHash = labeledExtract(suite, empty, "psk_id_hash", empty);
  const infoHash = labeledExtract(suite, empty, "info_hash", info);
  const ctx = concat(new Uint8Array([0x00]), pskIdHash, infoHash);
  const secret = labeledExtract(suite, sharedSecret, "secret", empty);
  return {
    key: labeledExpand(suite, secret, "key", ctx, NK[aead]),
    baseNonce: labeledExpand(suite, secret, "base_nonce", ctx, NN),
    exporterSecret: labeledExpand(suite, secret, "exp", ctx, NH),
  };
}

function nonce(base: Uint8Array, seq: number): Uint8Array {
  const out = new Uint8Array(base);
  const s = i2osp(seq, NN);
  for (let i = 0; i < NN; i++) out[i]! ^= s[i]!;
  return out;
}

function aeadSeal(
  aead: Aead,
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  pt: Uint8Array,
): Uint8Array {
  const c = createCipheriv(aead, key, iv, { authTagLength: TAG });
  c.setAAD(aad);
  return concat(
    new Uint8Array(c.update(pt)),
    new Uint8Array(c.final()),
    new Uint8Array(c.getAuthTag()),
  );
}

function aeadOpen(
  aead: Aead,
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  ct: Uint8Array,
): Uint8Array | null {
  if (ct.length < TAG) return null;
  try {
    const d = createDecipheriv(aead, key, iv, { authTagLength: TAG });
    d.setAAD(aad);
    d.setAuthTag(ct.subarray(ct.length - TAG));
    return concat(
      new Uint8Array(d.update(ct.subarray(0, ct.length - TAG))),
      new Uint8Array(d.final()),
    );
  } catch {
    return null;
  }
}

export interface Sealed {
  /** The encapsulated key (the ephemeral X25519 public key), 32 bytes. */
  enc: Uint8Array;
  ct: Uint8Array;
}

export interface SealOptions {
  aead?: Aead;
  /** Test vectors only: a fixed ephemeral key pair instead of a fresh one. */
  ephemeral?: { privateKey: KeyObject; publicKey: KeyObject };
  /** Test vectors only: the sequence number of the message within the context. */
  seq?: number;
}

/** SealBase: encrypts `pt` to the recipient's X25519 public key. */
export function seal(
  recipient: Uint8Array,
  info: Uint8Array,
  aad: Uint8Array,
  pt: Uint8Array,
  opts: SealOptions = {},
): Sealed {
  const aead = opts.aead ?? "aes-256-gcm";
  const pkR = x25519PublicFromRaw(recipient);
  const eph = opts.ephemeral ?? generateKeyPairSync("x25519");
  const enc = rawPublic(eph.publicKey);
  const shared = extractAndExpand(dh(eph.privateKey, pkR), concat(enc, recipient));
  const ctx = keySchedule(aead, shared, info);
  return { enc, ct: aeadSeal(aead, ctx.key, nonce(ctx.baseNonce, opts.seq ?? 0), aad, pt) };
}

/** OpenBase: decrypts with the recipient's private key; null when anything does not match. */
export function open(
  recipientPrivate: KeyObject,
  enc: Uint8Array,
  info: Uint8Array,
  aad: Uint8Array,
  ct: Uint8Array,
  opts: { aead?: Aead; seq?: number } = {},
): Uint8Array | null {
  const aead = opts.aead ?? "aes-256-gcm";
  try {
    const pkE = x25519PublicFromRaw(enc);
    const pkRm = rawPublic(createPublicKey(recipientPrivate));
    const shared = extractAndExpand(dh(recipientPrivate, pkE), concat(enc, pkRm));
    const ctx = keySchedule(aead, shared, info);
    return aeadOpen(aead, ctx.key, nonce(ctx.baseNonce, opts.seq ?? 0), aad, ct);
  } catch {
    return null;
  }
}

/** Test vectors only: the key schedule outputs for a given shared secret. */
export function scheduleForTest(aead: Aead, sharedSecret: Uint8Array, info: Uint8Array): Context {
  return keySchedule(aead, sharedSecret, info);
}

/** Test vectors only: Encap's shared secret for a given ephemeral key and recipient. */
export function encapForTest(ephemeral: KeyObject, recipient: Uint8Array): Uint8Array {
  const enc = rawPublic(createPublicKey(ephemeral));
  return extractAndExpand(dh(ephemeral, x25519PublicFromRaw(recipient)), concat(enc, recipient));
}
