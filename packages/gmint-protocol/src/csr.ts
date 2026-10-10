/**
 * PKCS #10 certificate requests (RFC 2986) for Ed25519 keys, the only kind GMint issues
 * certificates for. Node can sign and verify Ed25519 but cannot write or read a CSR, so this is
 * the few DER structures a renewal needs, written out: a CSR proves possession of the TLS key and
 * names the identity in one URI subjectAltName.
 *
 * The parser is strict on purpose. It accepts DER only (definite, minimal lengths), an Ed25519 key
 * and signature only, and returns the key and the URI names after checking the signature, or null.
 */

import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { concat, utf8Decode, utf8Encode } from "./encoding";

/** A CSR larger than this is refused unread; a GMint CSR is about 250 bytes. */
export const MAX_CSR_BYTES = 1024;

const OID_ED25519 = [0x06, 0x03, 0x2b, 0x65, 0x70];
const OID_CN = [0x06, 0x03, 0x55, 0x04, 0x03];
const OID_EXTENSION_REQUEST = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x0e];
const OID_SUBJECT_ALT_NAME = [0x06, 0x03, 0x55, 0x1d, 0x11];
/** The DER prefix of an Ed25519 SubjectPublicKeyInfo; 32 key bytes follow. */
const ED25519_SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, ...OID_ED25519, 0x03, 0x21, 0x00];

const TAG = {
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  oid: 0x06,
  utf8String: 0x0c,
  sequence: 0x30,
  set: 0x31,
  attributes: 0xa0, // [0] IMPLICIT SET OF Attribute
  uri: 0x86, // GeneralName [6] IMPLICIT IA5String
} as const;

// ---------------------------------------------------------------- writing

function tlv(tag: number, body: Uint8Array): Uint8Array {
  const n = body.length;
  const len =
    n < 0x80
      ? [n]
      : n < 0x100
        ? [0x81, n]
        : n < 0x10000
          ? [0x82, n >> 8, n & 0xff]
          : (() => {
              throw new RangeError("DER value too long");
            })();
  return concat(new Uint8Array([tag, ...len]), body);
}

const bytes = (b: number[]) => new Uint8Array(b);

/** The CN GMint puts on a certificate: the identity with anything but [A-Za-z0-9._-] dashed, at most 64. */
export function commonNameFor(identity: string): string {
  return identity.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64);
}

/** A DER CSR for this Ed25519 key, CN from the identity and the identity as its only URI name. */
export function buildCsr(privateKey: KeyObject, identity: string): Uint8Array {
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new TypeError("GMint certificates are for Ed25519 keys only");
  if (!/^[\x21-\x7e]{1,255}$/.test(identity)) throw new TypeError("identity is not a URI");
  const spki = new Uint8Array(createPublicKey(privateKey).export({ type: "spki", format: "der" }));
  const subject = tlv(
    TAG.sequence,
    tlv(
      TAG.set,
      tlv(
        TAG.sequence,
        concat(bytes(OID_CN), tlv(TAG.utf8String, utf8Encode(commonNameFor(identity)))),
      ),
    ),
  );
  const san = tlv(TAG.sequence, tlv(TAG.uri, utf8Encode(identity)));
  const extensions = tlv(
    TAG.sequence,
    tlv(TAG.sequence, concat(bytes(OID_SUBJECT_ALT_NAME), tlv(TAG.octetString, san))),
  );
  const attributes = tlv(
    TAG.attributes,
    tlv(TAG.sequence, concat(bytes(OID_EXTENSION_REQUEST), tlv(TAG.set, extensions))),
  );
  const info = tlv(
    TAG.sequence,
    concat(bytes([TAG.integer, 0x01, 0x00]), subject, spki, attributes),
  );
  const signature = new Uint8Array(sign(null, info, privateKey));
  return tlv(
    TAG.sequence,
    concat(
      info,
      tlv(TAG.sequence, bytes(OID_ED25519)),
      tlv(TAG.bitString, concat(bytes([0x00]), signature)),
    ),
  );
}

/** PEM armour for a DER CSR (what OpenBao's PKI expects). */
export function csrPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString("base64");
  return `-----BEGIN CERTIFICATE REQUEST-----\n${b64.replace(/.{1,64}/g, "$&\n")}-----END CERTIFICATE REQUEST-----\n`;
}

// ---------------------------------------------------------------- reading

interface Tlv {
  tag: number;
  /** The whole element, header included. */
  raw: Uint8Array;
  body: Uint8Array;
}

/** Reads one DER element at `offset`; null on anything but a definite, minimal length that fits. */
function readTlv(buf: Uint8Array, offset: number): Tlv | null {
  if (offset + 2 > buf.length) return null;
  const tag = buf[offset]!;
  if ((tag & 0x1f) === 0x1f) return null; // high tag numbers never occur here
  let len = buf[offset + 1]!;
  let head = 2;
  if (len === 0x80) return null; // indefinite length is BER, not DER
  if (len > 0x80) {
    const n = len & 0x7f;
    if (n > 2 || offset + 2 + n > buf.length) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[offset + 2 + i]!;
    // Minimal: a long form only for 128 and up, and no leading zero byte.
    if (len < 0x80 || (n === 2 && len < 0x100)) return null;
    head += n;
  }
  const end = offset + head + len;
  if (end > buf.length) return null;
  return { tag, raw: buf.subarray(offset, end), body: buf.subarray(offset + head, end) };
}

/** All elements of a constructed body, which they must fill exactly. */
function children(body: Uint8Array): Tlv[] | null {
  const out: Tlv[] = [];
  let offset = 0;
  while (offset < body.length) {
    const t = readTlv(body, offset);
    if (!t) return null;
    out.push(t);
    offset += t.raw.length;
  }
  return out;
}

function equalBytes(a: Uint8Array, b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export interface ParsedCsr {
  /** The DER SubjectPublicKeyInfo of the key that signed the request. */
  spki: Uint8Array;
  /** The URI subjectAltNames, in order. */
  uris: string[];
}

function uriNames(attributes: Tlv): string[] | null {
  const attrs = children(attributes.body);
  if (!attrs) return null;
  const uris: string[] = [];
  for (const attr of attrs) {
    const parts = attr.tag === TAG.sequence ? children(attr.body) : null;
    if (!parts || parts.length !== 2 || parts[0]!.tag !== TAG.oid || parts[1]!.tag !== TAG.set)
      return null;
    if (!equalBytes(parts[0]!.raw, OID_EXTENSION_REQUEST)) continue;
    const values = children(parts[1]!.body);
    if (!values || values.length !== 1 || values[0]!.tag !== TAG.sequence) return null;
    for (const ext of children(values[0]!.body) ?? [null]) {
      const e = ext && ext.tag === TAG.sequence ? children(ext.body) : null;
      if (!e || e.length < 2 || e[0]!.tag !== TAG.oid) return null;
      if (!equalBytes(e[0]!.raw, OID_SUBJECT_ALT_NAME)) continue;
      const value = e[e.length - 1]!;
      if (value.tag !== TAG.octetString) return null;
      const names = readTlv(value.body, 0);
      if (!names || names.raw.length !== value.body.length || names.tag !== TAG.sequence)
        return null;
      for (const n of children(names.body) ?? [null]) {
        if (!n) return null;
        if (n.tag !== TAG.uri) continue;
        const uri = utf8Decode(n.body);
        if (uri === null || !/^[\x21-\x7e]{1,255}$/.test(uri)) return null;
        uris.push(uri);
      }
    }
  }
  return uris;
}

/** The key and URI names of a DER CSR whose Ed25519 self-signature verifies; null otherwise. */
export function parseCsr(der: Uint8Array): ParsedCsr | null {
  if (der.length > MAX_CSR_BYTES) return null;
  const top = readTlv(der, 0);
  if (!top || top.tag !== TAG.sequence || top.raw.length !== der.length) return null;
  const parts = children(top.body);
  if (!parts || parts.length !== 3) return null;
  const [info, alg, sig] = parts as [Tlv, Tlv, Tlv];
  if (info.tag !== TAG.sequence || alg.tag !== TAG.sequence || sig.tag !== TAG.bitString)
    return null;
  if (!equalBytes(alg.body, OID_ED25519)) return null;
  if (sig.body.length !== 65 || sig.body[0] !== 0x00) return null;

  const fields = children(info.body);
  if (!fields || fields.length !== 4) return null;
  const [version, subject, spki, attributes] = fields as [Tlv, Tlv, Tlv, Tlv];
  if (version.tag !== TAG.integer || !equalBytes(version.body, [0x00])) return null;
  if (subject.tag !== TAG.sequence || !children(subject.body)) return null;
  if (
    spki.tag !== TAG.sequence ||
    spki.raw.length !== ED25519_SPKI_PREFIX.length + 32 ||
    !equalBytes(spki.raw.subarray(0, ED25519_SPKI_PREFIX.length), ED25519_SPKI_PREFIX)
  )
    return null;
  if (attributes.tag !== TAG.attributes) return null;
  const uris = uriNames(attributes);
  if (!uris) return null;

  const key = createPublicKey({ key: Buffer.from(spki.raw), format: "der", type: "spki" });
  if (!verify(null, info.raw, key, sig.body.subarray(1))) return null;
  return { spki: new Uint8Array(spki.raw), uris };
}
