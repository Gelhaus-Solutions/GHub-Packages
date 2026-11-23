/**
 * Test support only: software stand-ins for FIDO2 authenticators that produce exactly the bytes
 * an sk-ssh-ed25519 or sk-ecdsa-sha2-nistp256 key would sign (checked against
 * `ssh-keygen -Y verify` in this package's tests). Never use them for anything that is not a test.
 */

import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  FLAG_USER_PRESENT,
  SK_ECDSA_P256,
  SK_ED25519,
  parsePublicKey,
  signedData,
  type SshPublicKey,
} from "./sshsig";
import { concat, wireMpint, wireString } from "./wire";

export interface SoftwareSkSigner {
  /** The OpenSSH public key line. */
  line: string;
  key: SshPublicKey;
  sign(message: Uint8Array, namespace: string, opts?: { flags?: number; counter?: number }): string;
}

function fromBase64url(text: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(text as string, "base64url"));
}

function rawPublic(key: KeyObject): Uint8Array {
  return fromBase64url(key.export({ format: "jwk" }).x);
}

function softwareSigner(
  type: typeof SK_ED25519 | typeof SK_ECDSA_P256,
  blob: Uint8Array,
  comment: string,
  application: string,
  /** The inner signature for the bytes the authenticator covers. */
  signCovered: (covered: Uint8Array) => Uint8Array,
): SoftwareSkSigner {
  const line = `${type} ${Buffer.from(blob).toString("base64")} ${comment}`;
  const parsed = parsePublicKey(line);
  if (!parsed.ok) throw new Error(parsed.error);
  const sha = (d: Uint8Array) => new Uint8Array(createHash("sha256").update(d).digest());
  return {
    line,
    key: parsed.value,
    sign(message, namespace, opts = {}) {
      const flags = opts.flags ?? FLAG_USER_PRESENT;
      const counter = new Uint8Array(4);
      new DataView(counter.buffer).setUint32(0, opts.counter ?? 1);
      const data = signedData(namespace, "sha512", message);
      const covered = concat(
        sha(new TextEncoder().encode(application)),
        new Uint8Array([flags]),
        counter,
        sha(data),
      );
      const sig = concat(
        wireString(type),
        wireString(signCovered(covered)),
        new Uint8Array([flags]),
        counter,
      );
      const outer = concat(
        new TextEncoder().encode("SSHSIG"),
        new Uint8Array([0, 0, 0, 1]),
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
    },
  };
}

/** An sk-ssh-ed25519 stand-in, the key a YubiKey makes. */
export function softwareSkSigner(comment = "test-yk", application = "ssh:"): SoftwareSkSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = concat(
    wireString(SK_ED25519),
    wireString(rawPublic(publicKey)),
    wireString(application),
  );
  return softwareSigner(
    SK_ED25519,
    blob,
    comment,
    application,
    (covered) => new Uint8Array(sign(null, covered, privateKey)),
  );
}

/** An sk-ecdsa-sha2-nistp256 stand-in, the key a Secure Enclave makes. */
export function softwareSkEcdsaSigner(comment = "test-se", application = "ssh:"): SoftwareSkSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const point = concat(new Uint8Array([0x04]), fromBase64url(jwk.x), fromBase64url(jwk.y));
  const blob = concat(
    wireString(SK_ECDSA_P256),
    wireString("nistp256"),
    wireString(point),
    wireString(application),
  );
  return softwareSigner(SK_ECDSA_P256, blob, comment, application, (covered) => {
    const rs = new Uint8Array(
      sign("sha256", covered, { key: privateKey, dsaEncoding: "ieee-p1363" }),
    );
    return concat(wireMpint(rs.subarray(0, 32)), wireMpint(rs.subarray(32)));
  });
}
