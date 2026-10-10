/**
 * Test support only: a software stand-in for a FIDO2 authenticator that produces exactly the
 * bytes an sk-ssh-ed25519 key would sign (checked against `ssh-keygen -Y verify` in this
 * package's tests). Never use it for anything that is not a test.
 */

import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  FLAG_USER_PRESENT,
  SK_ED25519,
  parsePublicKey,
  signedData,
  type SshPublicKey,
} from "./sshsig";
import { concat, wireString } from "./wire";

export interface SoftwareSkSigner {
  /** The OpenSSH public key line. */
  line: string;
  key: SshPublicKey;
  sign(message: Uint8Array, namespace: string, opts?: { flags?: number; counter?: number }): string;
}

function rawPublic(key: KeyObject): Uint8Array {
  return new Uint8Array(Buffer.from(key.export({ format: "jwk" }).x as string, "base64url"));
}

export function softwareSkSigner(comment = "test-yk", application = "ssh:"): SoftwareSkSigner {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = concat(
    wireString(SK_ED25519),
    wireString(rawPublic(publicKey)),
    wireString(application),
  );
  const line = `${SK_ED25519} ${Buffer.from(blob).toString("base64")} ${comment}`;
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
      const raw = new Uint8Array(sign(null, covered, privateKey));
      const sig = concat(wireString(SK_ED25519), wireString(raw), new Uint8Array([flags]), counter);
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
