/**
 * Test support only: software stand-ins for FIDO2 authenticators that produce exactly the bytes
 * an sk-ssh-ed25519 or sk-ecdsa-sha2-nistp256 key would sign, plain Ed25519 keys, and
 * certificates (all checked against `ssh-keygen -Y verify` in this package's tests). Never use
 * them for anything that is not a test.
 */

import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  CERT_FOREVER,
  CERT_TYPE_USER,
  ED25519,
  ED25519_CERT,
  FLAG_USER_PRESENT,
  SK_ECDSA_P256,
  SK_ECDSA_P256_CERT,
  SK_ED25519,
  SK_ED25519_CERT,
  parsePublicKey,
  signedData,
  type SshKeyType,
  type SshPublicKey,
} from "./sshsig";
import { concat, wireMpint, wireString, wireUint32, wireUint64 } from "./wire";

export interface SignOptions {
  /** Authenticator flags, `sk-` keys only. Default user presence. */
  flags?: number;
  /** Authenticator counter, `sk-` keys only. Default 1. */
  counter?: number;
}

export interface SoftwareSigner {
  /** The OpenSSH public key line (for a certificate, the `-cert.pub` line). */
  line: string;
  /** The key that signs; for a certificate, the certified key. */
  key: SshPublicKey;
  /** The public-key blob an SSHSIG signature carries: the key's, or the certificate's. */
  blob: Uint8Array;
  /** An armored SSHSIG signature, as `ssh-keygen -Y sign` writes it. */
  sign(message: Uint8Array, namespace: string, opts?: SignOptions): string;
  /** The SSH signature blob over `data`, as the key's agent or authenticator returns it. */
  signRaw(data: Uint8Array, opts?: SignOptions): Uint8Array;
}

/** @deprecated The name from before plain keys and certificates: `SoftwareSigner`. */
export type SoftwareSkSigner = SoftwareSigner;

function fromBase64url(text: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(text as string, "base64url"));
}

function rawPublic(key: KeyObject): Uint8Array {
  return fromBase64url(key.export({ format: "jwk" }).x);
}

const sha = (d: Uint8Array) => new Uint8Array(createHash("sha256").update(d).digest());

function armor(blob: Uint8Array, namespace: string, sig: Uint8Array): string {
  const outer = concat(
    new TextEncoder().encode("SSHSIG"),
    wireUint32(1),
    wireString(blob),
    wireString(namespace),
    wireString(new Uint8Array(0)),
    wireString("sha512"),
    wireString(sig),
  );
  const b64 = Buffer.from(outer)
    .toString("base64")
    .replace(/(.{70})/g, "$1\n");
  return `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----\n`;
}

function signer(
  type: SshKeyType,
  blob: Uint8Array,
  comment: string,
  signRaw: (data: Uint8Array, opts?: SignOptions) => Uint8Array,
): SoftwareSigner {
  const line = `${type} ${Buffer.from(blob).toString("base64")} ${comment}`;
  const parsed = parsePublicKey(line);
  if (!parsed.ok) throw new Error(parsed.error);
  return {
    line,
    key: parsed.value,
    blob,
    signRaw,
    sign(message, namespace, opts) {
      return armor(blob, namespace, signRaw(signedData(namespace, "sha512", message), opts));
    },
  };
}

/** The authenticator's signature blob: the inner signature over what it covers, flags, counter. */
function skSignRaw(
  type: typeof SK_ED25519 | typeof SK_ECDSA_P256,
  application: string,
  signCovered: (covered: Uint8Array) => Uint8Array,
) {
  return (data: Uint8Array, opts: SignOptions = {}) => {
    const flags = opts.flags ?? FLAG_USER_PRESENT;
    const counter = wireUint32(opts.counter ?? 1);
    const covered = concat(
      sha(new TextEncoder().encode(application)),
      new Uint8Array([flags]),
      counter,
      sha(data),
    );
    return concat(
      wireString(type),
      wireString(signCovered(covered)),
      new Uint8Array([flags]),
      counter,
    );
  };
}

/** An sk-ssh-ed25519 stand-in, the key a YubiKey makes. */
export function softwareSkSigner(comment = "test-yk", application = "ssh:"): SoftwareSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = concat(
    wireString(SK_ED25519),
    wireString(rawPublic(publicKey)),
    wireString(application),
  );
  return signer(
    SK_ED25519,
    blob,
    comment,
    skSignRaw(SK_ED25519, application, (c) => new Uint8Array(sign(null, c, privateKey))),
  );
}

/** An sk-ecdsa-sha2-nistp256 stand-in, the key a Secure Enclave makes. */
export function softwareSkEcdsaSigner(comment = "test-se", application = "ssh:"): SoftwareSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const point = concat(new Uint8Array([0x04]), fromBase64url(jwk.x), fromBase64url(jwk.y));
  const blob = concat(
    wireString(SK_ECDSA_P256),
    wireString("nistp256"),
    wireString(point),
    wireString(application),
  );
  return signer(
    SK_ECDSA_P256,
    blob,
    comment,
    skSignRaw(SK_ECDSA_P256, application, (covered) => {
      const rs = new Uint8Array(
        sign("sha256", covered, { key: privateKey, dsaEncoding: "ieee-p1363" }),
      );
      return concat(wireMpint(rs.subarray(0, 32)), wireMpint(rs.subarray(32)));
    }),
  );
}

/** A plain ssh-ed25519 key, such as a signing session's key or a software authority. */
export function softwareEd25519Signer(comment = "test-soft"): SoftwareSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = concat(wireString(ED25519), wireString(rawPublic(publicKey)));
  return signer(ED25519, blob, comment, (data) =>
    concat(wireString(ED25519), wireString(new Uint8Array(sign(null, data, privateKey)))),
  );
}

export interface CertificateOptions {
  principals?: readonly string[];
  keyId?: string;
  serial?: bigint;
  /** Default `CERT_TYPE_USER`. */
  certType?: number;
  /** Seconds since the epoch. Default 0, valid from always. */
  validAfter?: bigint;
  /** Seconds since the epoch. Default `CERT_FOREVER`. */
  validBefore?: bigint;
  /** Name and data pairs, in the order given. Default none, as `-O clear` makes. */
  criticalOptions?: readonly [string, string][];
  extensions?: readonly [string, string][];
  /** The authority's authenticator flags and counter, for an `sk-` authority. */
  authority?: SignOptions;
}

const CERT_OF: Record<SshKeyType, string> = {
  [ED25519]: ED25519_CERT,
  [SK_ED25519]: SK_ED25519_CERT,
  [SK_ECDSA_P256]: SK_ECDSA_P256_CERT,
};

function optionSection(pairs: readonly [string, string][]): Uint8Array {
  return concat(
    ...pairs.map(([name, data]) =>
      concat(wireString(name), wireString(data ? wireString(data) : new Uint8Array(0))),
    ),
  );
}

/**
 * `subject` certified by `authority`, as `ssh-keygen -s` makes it: signing with the result signs
 * with the subject's key and carries the certificate, as `ssh-keygen -Y sign` does with one.
 */
export function softwareCertificate(
  authority: SoftwareSigner,
  subject: SoftwareSigner,
  opts: CertificateOptions = {},
): SoftwareSigner & { certificate: Uint8Array } {
  const type = CERT_OF[subject.key.type];
  // The subject's blob after its type string: its own key fields, in certificate order.
  const fields = subject.key.blob.subarray(4 + new TextEncoder().encode(subject.key.type).length);
  const body = concat(
    wireString(type),
    wireString(sha(new TextEncoder().encode(`nonce ${Math.random()}`))),
    fields,
    wireUint64(opts.serial ?? 0n),
    wireUint32(opts.certType ?? CERT_TYPE_USER),
    wireString(opts.keyId ?? "test session"),
    wireString(concat(...(opts.principals ?? ["operator@yubikey-git"]).map((p) => wireString(p)))),
    wireUint64(opts.validAfter ?? 0n),
    wireUint64(opts.validBefore ?? CERT_FOREVER),
    wireString(optionSection(opts.criticalOptions ?? [])),
    wireString(optionSection(opts.extensions ?? [])),
    wireString(new Uint8Array(0)),
    wireString(authority.key.blob),
  );
  const certificate = concat(body, wireString(authority.signRaw(body, opts.authority)));
  return {
    line: `${type} ${Buffer.from(certificate).toString("base64")} ${subject.key.comment ?? ""}`.trim(),
    key: subject.key,
    blob: certificate,
    certificate,
    signRaw: subject.signRaw,
    sign(message, namespace, signOpts) {
      const data = signedData(namespace, "sha512", message);
      return armor(certificate, namespace, subject.signRaw(data, signOpts));
    },
  };
}
