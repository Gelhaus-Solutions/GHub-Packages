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
 * A signature by a certified key (OpenSSH PROTOCOL.certkeys, `ssh-keygen -s`) counts only where
 * the caller names certificate authorities: the authority's signature over the certificate must
 * hold, with the touch proven when the authority is an `sk-` key; the certificate must be a user
 * certificate with no critical options, name a principal the authority may sign for, and be valid
 * at the time the caller gives. The certified key may be a plain software key: the trust is the
 * authority's.
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

export const ED25519_CERT = "ssh-ed25519-cert-v01@openssh.com";
export const SK_ED25519_CERT = "sk-ssh-ed25519-cert-v01@openssh.com";
export const SK_ECDSA_P256_CERT = "sk-ecdsa-sha2-nistp256-cert-v01@openssh.com";

export type SshCertificateType =
  typeof ED25519_CERT | typeof SK_ED25519_CERT | typeof SK_ECDSA_P256_CERT;

/** Each certificate type and the plain key type it certifies. */
const CERT_TYPES = new Map<string, SshKeyType>([
  [ED25519_CERT, ED25519],
  [SK_ED25519_CERT, SK_ED25519],
  [SK_ECDSA_P256_CERT, SK_ECDSA_P256],
]);

/** A certificate's type field (PROTOCOL.certkeys). */
export const CERT_TYPE_USER = 1;
export const CERT_TYPE_HOST = 2;
/** The `valid before` of a certificate that never expires. */
export const CERT_FOREVER = 0xffffffffffffffffn;

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
  | "malformed_public_key"
  | "malformed_certificate"
  | "authority_not_allowed"
  | "bad_certificate_signature"
  | "certificate_not_user"
  | "certificate_critical_options"
  | "principal_not_allowed"
  | "certificate_not_yet_valid"
  | "certificate_expired"
  | "malformed_allowed_signer"
  | "unsupported_option";

export type Result<T> = { ok: true; value: T } | { ok: false; error: SshsigError };

/** An OpenSSH certificate as `parseCertificateBlob` reads it; nothing in it is checked yet. */
export interface SshCertificate {
  type: SshCertificateType;
  /** The certified key: the one that makes the signatures the certificate vouches for. */
  key: SshPublicKey;
  serial: bigint;
  /** `CERT_TYPE_USER` or `CERT_TYPE_HOST`, or whatever else the certificate says. */
  certType: number;
  keyId: string;
  principals: string[];
  /** Seconds since the epoch, as the certificate states them; `CERT_FOREVER` never expires. */
  validAfter: bigint;
  validBefore: bigint;
  /** The names of its critical options; `verifySshsig` refuses a certificate with any. */
  criticalOptions: string[];
  extensions: string[];
  /** The authority's key as the certificate names it. */
  authority: SshPublicKey;
  /** What the authority signed: the certificate up to and including the authority's key. */
  signed: Uint8Array;
  /** The authority's signature over `signed`. */
  signature: Uint8Array;
  blob: Uint8Array;
}

/** A key whose certificates count, and the principals they may name. */
export interface CertificateAuthority {
  key: SshPublicKey;
  /**
   * A certificate must name at least one of these. Compared exactly: an allowed_signers pattern
   * such as `*@example.com` is not expanded.
   */
  principals: readonly string[];
}

/** One allowed_signers line (ssh-keygen(1), ALLOWED SIGNERS). */
export interface AllowedSigner {
  principals: string[];
  /** `cert-authority`: the key vouches for certificates instead of signing itself. */
  certAuthority: boolean;
  /** The namespaces the line limits the key to, or null when it names none. */
  namespaces: string[] | null;
  key: SshPublicKey;
}

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
  /**
   * Accept plain `ssh-ed25519` keys, in `allowed` and as certificate authorities. Default false.
   * A certified key needs no such leave: its authority vouches for it.
   */
  allowSoftwareKeys?: boolean;
  /**
   * The authorities whose certificates count. Default none: a signature by a certified key is
   * then refused as `key_not_allowed`, as before certificates were read at all.
   */
  authorities?: readonly CertificateAuthority[];
  /** When a certificate must be valid. Default now. */
  at?: Date;
  /**
   * How many seconds after its expiry a certificate still counts, for a verifier that sees a
   * signature only some time after it was made. Default 0.
   */
  graceSeconds?: number;
}

export interface VerifiedCertificate {
  /** The authority that signed the certificate, as the caller listed it. */
  authority: SshPublicKey;
  keyId: string;
  serial: bigint;
  principals: string[];
  validAfter: bigint;
  validBefore: bigint;
  /** The authority's authenticator flags and counter; 0 for a software authority. */
  flags: number;
  counter: number;
}

export interface Verified {
  /** The key that signed; for a certificate, the certified key. */
  key: SshPublicKey;
  /** Authenticator flags; 0 for software keys. */
  flags: number;
  /** Authenticator signature counter; 0 for software keys. */
  counter: number;
  /** Present when the signature was made by a certified key. */
  certificate?: VerifiedCertificate;
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

/** Splits on whitespace outside double quotes; null when a quote is left open. */
function splitUnquoted(text: string, separator: RegExp): string[] | null {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && separator.test(ch)) {
      if (current) out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (quoted) return null;
  if (current) out.push(current);
  return out;
}

function unquote(text: string): string {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

/**
 * Parses one allowed_signers line: `<principals> [options] <type> <base64> [comment]`. Takes the
 * options `cert-authority` and `namespaces="..."`; a line with any other (`valid-after`,
 * `valid-before`) is refused rather than read without its limit.
 */
export function parseAllowedSigner(line: string): Result<AllowedSigner> {
  const tokens = splitUnquoted(line.trim(), /\s/);
  if (!tokens || tokens.length < 3) return fail("malformed_allowed_signer");
  const principals = unquote(tokens[0]!).split(",");
  if (principals.some((p) => !p) || KEY_TYPES.includes(tokens[0]!)) {
    return fail("malformed_allowed_signer");
  }
  const keyAt = KEY_TYPES.includes(tokens[1]!) ? 1 : 2;
  if (!KEY_TYPES.includes(tokens[keyAt] ?? "")) return fail("malformed_allowed_signer");
  const key = parsePublicKey(tokens.slice(keyAt).join(" "));
  if (!key.ok) return key;

  let certAuthority = false;
  let namespaces: string[] | null = null;
  const options = keyAt === 2 ? splitUnquoted(tokens[1]!, /,/) : [];
  if (!options) return fail("malformed_allowed_signer");
  for (const option of options) {
    const eq = option.indexOf("=");
    const name = (eq < 0 ? option : option.slice(0, eq)).toLowerCase();
    const value = eq < 0 ? null : option.slice(eq + 1);
    if (name === "cert-authority" && value === null && !certAuthority) {
      certAuthority = true;
    } else if (name === "namespaces" && value !== null && namespaces === null) {
      namespaces = unquote(value)
        .split(",")
        .filter((n) => n);
    } else {
      return fail(
        name === "cert-authority" || name === "namespaces"
          ? "malformed_allowed_signer"
          : "unsupported_option",
      );
    }
  }
  return { ok: true, value: { principals, certAuthority, namespaces, key: key.value } };
}

/**
 * What allowed_signers lines let sign in one namespace: the keys that sign themselves, for
 * `allowed`, and the authorities whose certificates count, for `authorities`. Lines limited to
 * other namespaces are left out.
 */
export function signersFor(
  signers: readonly AllowedSigner[],
  namespace: string,
): { allowed: SshPublicKey[]; authorities: CertificateAuthority[] } {
  const here = signers.filter((s) => s.namespaces === null || s.namespaces.includes(namespace));
  return {
    allowed: here.filter((s) => !s.certAuthority).map((s) => s.key),
    authorities: here
      .filter((s) => s.certAuthority)
      .map((s) => ({ key: s.key, principals: [...s.principals] })),
  };
}

/** A sequence of strings filling `bytes` exactly, each UTF-8; null otherwise. */
function stringList(bytes: Uint8Array): string[] | null {
  const r = new WireReader(bytes);
  const out: string[] = [];
  while (!r.done()) {
    const s = r.string();
    const text = s && utf8(s);
    if (text == null) return null;
    out.push(text);
  }
  return out;
}

/** The names in a critical options or extensions section: pairs of name and data strings. */
function optionNames(bytes: Uint8Array): string[] | null {
  const r = new WireReader(bytes);
  const out: string[] = [];
  while (!r.done()) {
    const name = r.string();
    const text = name && utf8(name);
    if (text == null || !r.string()) return null;
    out.push(text);
  }
  return out;
}

/** Whether a public-key blob is a certificate of a type this module reads. */
function isCertificateBlob(blob: Uint8Array): boolean {
  const type = new WireReader(blob).string();
  const name = type && utf8(type);
  return name != null && CERT_TYPES.has(name);
}

/**
 * Parses an OpenSSH certificate blob (`ssh-ed25519-cert-v01@openssh.com` and the `sk-` types).
 * Only the format is checked here; `verifySshsig` checks the authority, its signature and the
 * certificate's limits.
 */
export function parseCertificateBlob(blob: Uint8Array): Result<SshCertificate> {
  const r = new WireReader(blob);
  const typeBytes = r.string();
  const type = typeBytes && utf8(typeBytes);
  const plain = type == null ? undefined : CERT_TYPES.get(type);
  if (!plain) return fail(type == null ? "malformed_certificate" : "unsupported_key_type");
  if (!r.string()) return fail("malformed_certificate"); // nonce
  // The certified key's own fields, rebuilt into its plain blob for the plain key's parser.
  const count = plain === ED25519 ? 1 : plain === SK_ED25519 ? 2 : 3;
  const fields: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const field = r.string();
    if (!field) return fail("malformed_certificate");
    fields.push(field);
  }
  const key = parsePublicKeyBlob(concat(wireString(plain), ...fields.map((f) => wireString(f))));
  if (!key.ok) return fail("malformed_certificate");

  const serial = r.uint64();
  const certType = r.uint32();
  const keyId = r.string();
  const principals = r.string();
  const validAfter = r.uint64();
  const validBefore = r.uint64();
  const critical = r.string();
  const extensions = r.string();
  const reserved = r.string();
  const authorityBlob = r.string();
  const signedLength = r.position();
  const signature = r.string();
  if (
    serial === null ||
    certType === null ||
    !keyId ||
    !principals ||
    validAfter === null ||
    validBefore === null ||
    !critical ||
    !extensions ||
    !reserved ||
    !authorityBlob ||
    !signature ||
    !r.done()
  ) {
    return fail("malformed_certificate");
  }
  const id = utf8(keyId);
  const names = stringList(principals);
  const criticalOptions = optionNames(critical);
  const extensionNames = optionNames(extensions);
  if (id == null || !names || !criticalOptions || !extensionNames || reserved.length !== 0) {
    return fail("malformed_certificate");
  }
  // A certificate as authority is refused here too: its type is no plain key type.
  const authority = parsePublicKeyBlob(authorityBlob);
  if (!authority.ok) {
    return fail(
      authority.error === "unsupported_key_type" ? "unsupported_key_type" : "malformed_certificate",
    );
  }
  return {
    ok: true,
    value: {
      type: type as SshCertificateType,
      key: key.value,
      serial,
      certType,
      keyId: id,
      principals: names,
      validAfter,
      validBefore,
      criticalOptions,
      extensions: extensionNames,
      authority: authority.value,
      signed: blob.subarray(0, signedLength),
      signature,
      blob,
    },
  };
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

/**
 * Checks an SSH signature blob (`string type, string signature` and, for `sk-` keys,
 * `byte flags, uint32 counter`) made by `key` over `data`.
 */
function verifyKeySignature(
  key: SshPublicKey,
  data: Uint8Array,
  blob: Uint8Array,
): Result<{ flags: number; counter: number }> {
  const r = new WireReader(blob);
  const typeBytes = r.string();
  if (!typeBytes || utf8(typeBytes) !== key.type) return fail("malformed_signature");
  const inner = r.string();
  if (!inner) return fail("malformed_signature");

  if (key.type === ED25519) {
    if (inner.length !== 64 || !r.done()) return fail("malformed_signature");
    return ed25519Verify(key.key, data, inner)
      ? { ok: true, value: { flags: 0, counter: 0 } }
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
  return good ? { ok: true, value: { flags, counter } } : fail("bad_signature");
}

/** What an `sk-` key's flags lack of what the caller requires, or null. */
function missingFlag(key: SshPublicKey, flags: number, opts: VerifyOptions): SshsigError | null {
  if (key.type === ED25519) return null;
  if ((opts.requireUserPresence ?? true) && !(flags & FLAG_USER_PRESENT)) {
    return "user_presence_required";
  }
  if (opts.requireUserVerification && !(flags & FLAG_USER_VERIFIED)) {
    return "user_verification_required";
  }
  return null;
}

function verifyCertified(opts: VerifyOptions, sig: ParsedSignature): Result<Verified> {
  const at = (opts.at ?? new Date()).getTime();
  if (!Number.isFinite(at)) throw new TypeError("verifySshsig: `at` is not a valid date");
  const grace = opts.graceSeconds ?? 0;
  if (!Number.isSafeInteger(grace) || grace < 0) {
    throw new TypeError(
      "verifySshsig: `graceSeconds` must be a whole number of seconds, 0 or more",
    );
  }
  const authorities = opts.authorities ?? [];
  if (authorities.length === 0) return fail("key_not_allowed");
  const parsed = parseCertificateBlob(sig.publicKey);
  if (!parsed.ok) return parsed;
  const cert = parsed.value;

  const authority = authorities.find((a) => bytesEqual(a.key.blob, cert.authority.blob));
  if (!authority) return fail("authority_not_allowed");
  // As for allowed keys: verify with what the matching blob says, not the caller's fields.
  const reparsed = parsePublicKeyBlob(authority.key.blob, authority.key.comment);
  if (!reparsed.ok) return reparsed;
  const ca = reparsed.value;
  if (ca.type === ED25519 && !opts.allowSoftwareKeys) return fail("unsupported_key_type");
  const vouched = verifyKeySignature(ca, cert.signed, cert.signature);
  if (!vouched.ok) {
    return fail(
      vouched.error === "bad_signature" ? "bad_certificate_signature" : "malformed_certificate",
    );
  }
  const caFlag = missingFlag(ca, vouched.value.flags, opts);
  if (caFlag) return fail(caFlag);

  if (cert.certType !== CERT_TYPE_USER) return fail("certificate_not_user");
  if (cert.criticalOptions.length > 0) return fail("certificate_critical_options");
  if (!cert.principals.some((p) => authority.principals.includes(p))) {
    return fail("principal_not_allowed");
  }
  const now = BigInt(Math.floor(at / 1000));
  if (now < cert.validAfter) return fail("certificate_not_yet_valid");
  if (now >= cert.validBefore + BigInt(grace)) return fail("certificate_expired");

  const data = signedData(sig.namespace, sig.hashAlgorithm, opts.message);
  const own = verifyKeySignature(cert.key, data, sig.signature);
  if (!own.ok) return own;
  const ownFlag = missingFlag(cert.key, own.value.flags, opts);
  if (ownFlag) return fail(ownFlag);
  return {
    ok: true,
    value: {
      key: cert.key,
      flags: own.value.flags,
      counter: own.value.counter,
      certificate: {
        authority: ca,
        keyId: cert.keyId,
        serial: cert.serial,
        principals: cert.principals,
        validAfter: cert.validAfter,
        validBefore: cert.validBefore,
        flags: vouched.value.flags,
        counter: vouched.value.counter,
      },
    },
  };
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
  if (isCertificateBlob(sig.publicKey)) return verifyCertified(opts, sig);

  const allowed = opts.allowed.find((k) => bytesEqual(k.blob, sig.publicKey));
  if (!allowed) return fail("key_not_allowed");
  // Everything used for verification comes from the blob that matched, never from fields of
  // the caller's object, which could have been edited after parsing.
  const reparsed = parsePublicKeyBlob(allowed.blob, allowed.comment);
  if (!reparsed.ok) return reparsed;
  const key = reparsed.value;
  if (key.type === ED25519 && !opts.allowSoftwareKeys) return fail("unsupported_key_type");

  const data = signedData(sig.namespace, sig.hashAlgorithm, opts.message);
  const checked = verifyKeySignature(key, data, sig.signature);
  if (!checked.ok) return checked;
  const flag = missingFlag(key, checked.value.flags, opts);
  if (flag) return fail(flag);
  return { ok: true, value: { key, ...checked.value } };
}
