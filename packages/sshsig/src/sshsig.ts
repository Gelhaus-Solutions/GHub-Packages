/**
 * SSHSIG verification (OpenSSH PROTOCOL.sshsig) for hardware-key signatures.
 *
 * GMint's policy bundles, lockdown statements and approvals, and GLockdown's directives, lifts
 * and trust documents, are signed with `ssh-keygen -Y sign` and a FIDO2 key
 * (`sk-ssh-ed25519@openssh.com`, or `sk-ecdsa-sha2-nistp256@openssh.com` for a P-256 key such as
 * a Secure Enclave one), so the private key never exists as a file and every signature needs a
 * touch. This module checks such a signature against a short list of allowed public keys.
 *
 * Strict on purpose: version 1 only, the namespace must match, the reserved field must be
 * empty, no trailing bytes anywhere, ECDSA's r and s must be minimal mpints, and the key inside
 * the signature must be byte-equal to an allowed key. An `sk-` signature, of either type, must
 * carry the user-presence flag unless the caller says otherwise. Plain `ssh-ed25519` is accepted
 * only when the caller opts in (tests, and keys that are not hardware-backed by the operator's
 * own choice).
 *
 * Verification returns a result instead of throwing: a bad signature is an expected input.
 */

import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { WireReader, concat, utf8, wireString } from "./wire";

const MAGIC = new TextEncoder().encode("SSHSIG");
const ARMOR_BEGIN = "-----BEGIN SSH SIGNATURE-----";
const ARMOR_END = "-----END SSH SIGNATURE-----";

export const SK_ED25519 = "sk-ssh-ed25519@openssh.com";
export const SK_ECDSA_P256 = "sk-ecdsa-sha2-nistp256@openssh.com";
export const ED25519 = "ssh-ed25519";

export type SshKeyType = typeof SK_ED25519 | typeof SK_ECDSA_P256 | typeof ED25519;

const KEY_TYPES: readonly string[] = [SK_ED25519, SK_ECDSA_P256, ED25519];
const P256_CURVE = "nistp256";

/** FIDO2 authenticator data flags (PROTOCOL.u2f). */
export const FLAG_USER_PRESENT = 0x01;
export const FLAG_USER_VERIFIED = 0x04;

export interface SshPublicKey {
  type: SshKeyType;
  /** The raw public key: 32 bytes for Ed25519, the uncompressed point 0x04 || X || Y for P-256. */
  key: Uint8Array;
  /** The FIDO application string, `sk-` keys only (usually `ssh:`). */
  application?: string;
  /** The full wire blob, for exact comparison. */
  blob: Uint8Array;
  comment?: string;
}

export type SshsigError =
  | "malformed_armor"
  | "malformed_signature"
  | "unsupported_version"
  | "unsupported_key_type"
  | "unsupported_hash"
  | "wrong_namespace"
  | "key_not_allowed"
  | "bad_signature"
  | "user_presence_required"
  | "user_verification_required"
  | "malformed_public_key";

export type Result<T> = { ok: true; value: T } | { ok: false; error: SshsigError };

export interface VerifyOptions {
  /** The armored signature as `ssh-keygen -Y sign` writes it. */
  signature: string;
  /** The exact bytes that were signed. */
  message: Uint8Array;
  /** The namespace the signer passed with `-n`. */
  namespace: string;
  /** The keys allowed to sign. */
  allowed: readonly SshPublicKey[];
  /** Require the user-presence flag on `sk-` signatures. Default true. */
  requireUserPresence?: boolean;
  /** Require the user-verification (PIN or biometric) flag on `sk-` signatures. Default false. */
  requireUserVerification?: boolean;
  /** Accept plain `ssh-ed25519` keys. Default false. */
  allowSoftwareKeys?: boolean;
}

export interface Verified {
  key: SshPublicKey;
  /** Authenticator flags; 0 for software keys. */
  flags: number;
  /** Authenticator signature counter; 0 for software keys. */
  counter: number;
}

function fail<T>(error: SshsigError): Result<T> {
  return { ok: false, error };
}

function strictBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? new Uint8Array(bytes) : null;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** A P-256 key from its 65-byte uncompressed point, or null when that is not on the curve. */
function p256Key(point: Uint8Array): KeyObject | null {
  if (point.length !== 65 || point[0] !== 0x04) return null;
  try {
    return createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: base64url(point.subarray(1, 33)),
        y: base64url(point.subarray(33)),
      },
      format: "jwk",
    });
  } catch {
    return null;
  }
}

/**
 * Parses a public-key wire blob (`ssh-ed25519`, `sk-ssh-ed25519@openssh.com` or
 * `sk-ecdsa-sha2-nistp256@openssh.com`).
 */
export function parsePublicKeyBlob(blob: Uint8Array, comment?: string): Result<SshPublicKey> {
  const r = new WireReader(blob);
  const typeBytes = r.string();
  const type = typeBytes && utf8(typeBytes);
  if (type === ED25519) {
    const key = r.string();
    if (!key || key.length !== 32 || !r.done()) return fail("malformed_public_key");
    return { ok: true, value: { type, key, blob, ...(comment ? { comment } : {}) } };
  }
  if (type === SK_ED25519) {
    const key = r.string();
    const app = r.string();
    const application = app && utf8(app);
    if (!key || key.length !== 32 || application == null || !r.done()) {
      return fail("malformed_public_key");
    }
    return { ok: true, value: { type, key, application, blob, ...(comment ? { comment } : {}) } };
  }
  if (type === SK_ECDSA_P256) {
    const curve = r.string();
    const point = r.string();
    const app = r.string();
    const application = app && utf8(app);
    if (
      !curve ||
      utf8(curve) !== P256_CURVE ||
      !point ||
      !p256Key(point) ||
      application == null ||
      !r.done()
    ) {
      return fail("malformed_public_key");
    }
    return {
      ok: true,
      value: { type, key: point, application, blob, ...(comment ? { comment } : {}) },
    };
  }
  return fail(type == null ? "malformed_public_key" : "unsupported_key_type");
}

/**
 * Parses an OpenSSH public key line (`<type> <base64> [comment]`). An allowed_signers line
 * (`<principal> [options] <type> <base64> [comment]`) parses too: the key is found by its type
 * token. Options are ignored; an allowed-signers list here is a list of keys, scoped by namespace
 * in the call to `verifySshsig`.
 */
export function parsePublicKey(line: string): Result<SshPublicKey> {
  const parts = line.trim().split(/\s+/);
  const i = parts.findIndex((p) => KEY_TYPES.includes(p));
  if (i < 0 || !parts[i + 1]) return fail("malformed_public_key");
  const blob = strictBase64(parts[i + 1]!);
  if (!blob) return fail("malformed_public_key");
  const parsed = parsePublicKeyBlob(blob, parts.slice(i + 2).join(" ") || undefined);
  if (!parsed.ok) return parsed;
  return parsed.value.type === parts[i] ? parsed : fail("malformed_public_key");
}

interface ParsedSignature {
  publicKey: Uint8Array;
  namespace: string;
  reserved: Uint8Array;
  hashAlgorithm: string;
  signature: Uint8Array;
}

function parseArmored(text: string): Result<ParsedSignature> {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== ARMOR_BEGIN || lines[lines.length - 1] !== ARMOR_END || lines.length < 3) {
    return fail("malformed_armor");
  }
  const blob = strictBase64(lines.slice(1, -1).join(""));
  if (!blob) return fail("malformed_armor");

  const r = new WireReader(blob);
  const magic = r.raw(6);
  if (!magic || !bytesEqual(magic, MAGIC)) return fail("malformed_signature");
  const version = r.uint32();
  if (version !== 1) return fail(version === null ? "malformed_signature" : "unsupported_version");
  const publicKey = r.string();
  const namespace = r.string();
  const reserved = r.string();
  const hashAlgorithm = r.string();
  const signature = r.string();
  if (!publicKey || !namespace || !reserved || !hashAlgorithm || !signature || !r.done()) {
    return fail("malformed_signature");
  }
  const ns = utf8(namespace);
  const alg = utf8(hashAlgorithm);
  if (ns == null || alg == null) return fail("malformed_signature");
  return { ok: true, value: { publicKey, namespace: ns, reserved, hashAlgorithm: alg, signature } };
}

/** The bytes an SSHSIG signature actually covers (PROTOCOL.sshsig, "Signed Data"). */
export function signedData(
  namespace: string,
  hashAlgorithm: string,
  message: Uint8Array,
): Uint8Array {
  const digest = createHash(hashAlgorithm).update(message).digest();
  return concat(
    MAGIC,
    wireString(namespace),
    wireString(new Uint8Array(0)),
    wireString(hashAlgorithm),
    wireString(new Uint8Array(digest)),
  );
}

function ed25519Verify(publicKey: Uint8Array, data: Uint8Array, sig: Uint8Array): boolean {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKey).toString("base64url") },
      format: "jwk",
    });
    return cryptoVerify(null, data, key, sig);
  } catch {
    return false;
  }
}

/**
 * An SSH ECDSA signature (mpint r, mpint s) as the 64 bytes r || s that node:crypto verifies as
 * `ieee-p1363`, or null when either is zero, longer than 32 bytes or not a minimal mpint.
 */
function p256Signature(blob: Uint8Array): Uint8Array | null {
  const r = new WireReader(blob);
  const out = new Uint8Array(64);
  for (const offset of [0, 32]) {
    const value = r.mpint();
    if (!value || value.length === 0 || value.length > 32) return null;
    out.set(value, offset + 32 - value.length);
  }
  return r.done() ? out : null;
}

function p256Verify(point: Uint8Array, data: Uint8Array, sig: Uint8Array): boolean {
  const key = p256Key(point);
  if (!key) return false;
  try {
    return cryptoVerify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, sig);
  } catch {
    return false;
  }
}

export function verifySshsig(opts: VerifyOptions): Result<Verified> {
  const parsed = parseArmored(opts.signature);
  if (!parsed.ok) return parsed;
  const sig = parsed.value;

  if (sig.namespace !== opts.namespace) return fail("wrong_namespace");
  if (sig.reserved.length !== 0) return fail("malformed_signature");
  if (sig.hashAlgorithm !== "sha256" && sig.hashAlgorithm !== "sha512") {
    return fail("unsupported_hash");
  }

  const allowed = opts.allowed.find((k) => bytesEqual(k.blob, sig.publicKey));
  if (!allowed) return fail("key_not_allowed");
  // Everything used for verification comes from the blob that matched, never from fields of
  // the caller's object, which could have been edited after parsing.
  const reparsed = parsePublicKeyBlob(allowed.blob, allowed.comment);
  if (!reparsed.ok) return reparsed;
  const key = reparsed.value;
  if (key.type === ED25519 && !opts.allowSoftwareKeys) return fail("unsupported_key_type");

  const data = signedData(sig.namespace, sig.hashAlgorithm, opts.message);

  const r = new WireReader(sig.signature);
  const typeBytes = r.string();
  if (!typeBytes || utf8(typeBytes) !== key.type) return fail("malformed_signature");
  const inner = r.string();
  if (!inner) return fail("malformed_signature");

  if (key.type === ED25519) {
    if (inner.length !== 64 || !r.done()) return fail("malformed_signature");
    return ed25519Verify(key.key, data, inner)
      ? { ok: true, value: { key, flags: 0, counter: 0 } }
      : fail("bad_signature");
  }

  // Both sk- types: the authenticator signs
  // SHA256(application) || flags || counter || SHA256(signed data),
  // with Ed25519, or with ECDSA P-256 over the SHA-256 of those bytes.
  const raw = key.type === SK_ED25519 ? (inner.length === 64 ? inner : null) : p256Signature(inner);
  const flags = r.byte();
  const counter = r.uint32();
  if (!raw || flags === null || counter === null || !r.done()) return fail("malformed_signature");
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, counter);
  const covered = concat(
    sha256(new TextEncoder().encode(key.application ?? "")),
    new Uint8Array([flags]),
    counterBytes,
    sha256(data),
  );
  const good =
    key.type === SK_ED25519
      ? ed25519Verify(key.key, covered, raw)
      : p256Verify(key.key, covered, raw);
  if (!good) return fail("bad_signature");
  if ((opts.requireUserPresence ?? true) && !(flags & FLAG_USER_PRESENT)) {
    return fail("user_presence_required");
  }
  if (opts.requireUserVerification && !(flags & FLAG_USER_VERIFIED)) {
    return fail("user_verification_required");
  }
  return { ok: true, value: { key, flags, counter } };
}
