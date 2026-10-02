import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical.js";
import { parseSnapshot, SnapshotError, type Snapshot } from "./snapshot.js";

/**
 * Verifying a snapshot before anything reads it.
 *
 * A snapshot decides who is restricted. One that anybody between the server
 * and a product could edit would let them restrict an account or release one,
 * or move a date nobody announced, so a product only ever binds a snapshot
 * signed with a key this release pins (see keys.ts). The signature is Ed25519
 * over the canonical JSON bytes (see canonical.ts), made by the GPlatform Terms
 * service's signing key (key id `gpterms-snapshot`), which never leaves the
 * service's key store.
 */

/** Which key signed a snapshot, and the signature. Stored beside the snapshot
 *  as `snapshot.sig.json` and served at `/snapshot.sig`. */
export interface SnapshotSignature {
  readonly keyId: string;
  /** The signing key's version, which a rotation increments. */
  readonly keyVersion: number;
  /** The raw 64-byte Ed25519 signature, base64. */
  readonly signature: string;
}

/** One public key a release trusts. */
export interface PinnedKey {
  readonly keyId: string;
  readonly keyVersion: number;
  /** The public key as DER-encoded SubjectPublicKeyInfo, base64. */
  readonly publicKeySpkiDer: string;
}

/** A snapshot whose signature does not hold, or that could not be checked:
 *  signed by a key this release does not pin, not in canonical form, or
 *  altered after signing. */
export class SnapshotSignatureError extends SnapshotError {
  override readonly name: string = "SnapshotSignatureError";
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** Base64 read strictly. Buffer.from skips characters it does not know, so two
 *  different strings could otherwise decode to the same signature. */
function base64(value: unknown, what: string): Buffer {
  if (typeof value !== "string" || !BASE64.test(value)) {
    throw new SnapshotSignatureError(`${what} is not base64.`);
  }
  return Buffer.from(value, "base64");
}

/** Reads a signature as it arrives, from `snapshot.sig.json` or the API. */
export function parseSnapshotSignature(json: unknown): SnapshotSignature {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new SnapshotSignatureError("the snapshot signature should be an object.");
  }
  const { keyId, keyVersion, signature, ...rest } = json as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) {
    throw new SnapshotSignatureError(
      `the snapshot signature has fields it should not: ${extra.join(", ")}.`,
    );
  }
  if (typeof keyId !== "string" || keyId === "") {
    throw new SnapshotSignatureError("the snapshot signature names no key id.");
  }
  if (typeof keyVersion !== "number" || !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new SnapshotSignatureError(
      "the snapshot signature's key version is not a whole number from 1.",
    );
  }
  if (base64(signature, "the snapshot signature").byteLength !== 64) {
    throw new SnapshotSignatureError(
      "the snapshot signature is not 64 bytes, as an Ed25519 signature is.",
    );
  }
  return Object.freeze({ keyId, keyVersion, signature: signature as string });
}

function publicKeyOf(pinned: PinnedKey): KeyObject {
  const where = `pinned key ${pinned.keyId} version ${pinned.keyVersion}`;
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: base64(pinned.publicKeySpkiDer, where),
      format: "der",
      type: "spki",
    });
  } catch (error) {
    if (error instanceof SnapshotSignatureError) throw error;
    throw new SnapshotSignatureError(`${where} is not a public key in SPKI DER.`);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new SnapshotSignatureError(`${where} is ${String(key.asymmetricKeyType)}, not Ed25519.`);
  }
  return key;
}

/**
 * The snapshot in `json`, once its signature holds; refused with a
 * SnapshotSignatureError otherwise, and with a SnapshotError if it verifies
 * and is still malformed.
 *
 * The text has to be canonical already, byte for byte. Re-canonicalising
 * whatever arrived and verifying that instead would work, and would mean the
 * bytes stored and served are not the bytes signed: a reformatted file, a key
 * repeated (JSON.parse keeps the last), a value nudged by a lenient parser all
 * read as the same snapshot while differing from what the server signed. So
 * the text is parsed, written again canonically, and refused unless the two
 * are identical. Only then is the signature checked, over exactly those bytes,
 * with the pinned key whose id and version the signature names, and only a
 * verified snapshot is read by parseSnapshot.
 */
export function verifySnapshot(
  json: string,
  signature: SnapshotSignature,
  keys: readonly PinnedKey[],
): Snapshot {
  const named = parseSnapshotSignature(signature);
  const pinned = keys.find(
    (key) => key.keyId === named.keyId && key.keyVersion === named.keyVersion,
  );
  if (pinned === undefined) {
    throw new SnapshotSignatureError(
      `the snapshot is signed with key ${named.keyId} version ${named.keyVersion}, which this release does not pin. A key reaches a product with a release of @ghub/terms-rules, never with the snapshot it signs.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotSignatureError("the snapshot is not JSON.");
  }
  let canonical: string;
  try {
    canonical = canonicalJson(parsed);
  } catch (error) {
    throw new SnapshotSignatureError(`the snapshot is not plain JSON: ${(error as Error).message}`);
  }
  if (canonical !== json) {
    throw new SnapshotSignatureError(
      "the snapshot is not in canonical form, so it is not the text that was signed. It is stored and served exactly as the server wrote it; a reformatted copy does not verify.",
    );
  }
  const valid = verify(
    null,
    Buffer.from(canonical, "utf8"),
    publicKeyOf(pinned),
    Buffer.from(named.signature, "base64"),
  );
  if (!valid) {
    throw new SnapshotSignatureError(
      `the snapshot's signature does not hold for key ${named.keyId} version ${named.keyVersion}: it was altered after signing, or signed with another key.`,
    );
  }
  return parseSnapshot(parsed);
}
