/**
 * Signed snapshots for the tests: a key pair made per run, the way the
 * service's signing key signs, and an archive small enough to read.
 *
 * One surface, `example`, covering its product's terms and the general terms.
 * Serial 1 has the first version of each in force since 1 Jan 2026. Serial 2
 * adds a second version of the product's terms, announced 3 Mar 2036 09:00
 * CET and in force at the earliest that allows, 15 Apr 2036 10:00 CEST: six
 * weeks and a day across the spring clock change.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import {
  bind,
  canonicalJson,
  verifySnapshot,
  type PinnedKey,
  type Snapshot,
  type SnapshotSignature,
  type Terms,
} from "@ghub/terms-rules";

export const SURFACE = "example";
export const V1 = "example-terms-2026-01-01";
export const V2 = "example-terms-2036-03-03";
export const GENERAL = "gs-terms-2026-01-01";
export const RECORDED_V1 = `${V1}+${GENERAL}`;
export const RECORDED_V2 = `${V2}+${GENERAL}`;
export const V2_ANNOUNCED = new Date("2036-03-03T09:00:00+01:00");
export const V2_IN_FORCE = new Date("2036-04-15T10:00:00+02:00");

export interface Signer {
  readonly pinned: PinnedKey;
  readonly sign: (text: string) => SnapshotSignature;
}

export function signer(keyId = "gpterms-snapshot", keyVersion = 1): Signer {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pinned: {
      keyId,
      keyVersion,
      publicKeySpkiDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    },
    sign: (text) => ({
      keyId,
      keyVersion,
      signature: sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64"),
    }),
  };
}

function version(versionId: string, document: string, label: string, hash: string) {
  return {
    versionId,
    document,
    version: label,
    title: { en: `Terms ${label}`, de: `Bedingungen ${label}` },
    contentHash: hash.repeat(64),
    archiveUrl: {
      en: `https://example.org/legal/${versionId}`,
      de: `https://example.org/de/legal/${versionId}`,
    },
    frozenAt: "2025-10-01T12:00:00Z",
  };
}

export function snapshot(serial: 1 | 2): Snapshot {
  return {
    format: 1,
    serial,
    generatedAt: serial === 1 ? "2026-01-01T00:00:00+01:00" : "2036-03-01T00:00:00+01:00",
    documents: [
      {
        key: "project:example:terms",
        product: "example",
        kind: "consent",
        liveUrl: { en: "https://example.org/terms" },
      },
      {
        key: "page:gs:terms",
        product: "gs",
        kind: "consent",
        liveUrl: { en: "https://example.org/general-terms" },
      },
    ],
    versions: [
      version(V1, "project:example:terms", "2026-01-01", "a"),
      version(GENERAL, "page:gs:terms", "2026-01-01", "b"),
      ...(serial === 2 ? [version(V2, "project:example:terms", "2036-03-03", "c")] : []),
    ],
    surfaces: [{ id: SURFACE, covers: ["project:example:terms", "page:gs:terms"], liveLinks: {} }],
    rollouts: [
      {
        versionId: V1,
        surface: null,
        announcedAt: "2025-11-01T00:00:00+01:00",
        inForceFrom: "2026-01-01T00:00:00+01:00",
      },
      {
        versionId: GENERAL,
        surface: null,
        announcedAt: "2025-11-01T00:00:00+01:00",
        inForceFrom: "2026-01-01T00:00:00+01:00",
      },
      ...(serial === 2
        ? [
            {
              versionId: V2,
              surface: null,
              announcedAt: "2036-03-03T09:00:00+01:00",
              inForceFrom: "2036-04-15T10:00:00+02:00",
              summary: { en: "What changes.", de: "Was sich ändert." },
            },
          ]
        : []),
    ],
  };
}

export interface Signed {
  readonly text: string;
  readonly signature: SnapshotSignature;
}

export function signed(by: Signer, serial: 1 | 2): Signed {
  const text = canonicalJson(snapshot(serial));
  return { text, signature: by.sign(text) };
}

/** The rules bound to a signed snapshot, as a release's bundled one would be. */
export function bundledAs(by: Signer, serial: 1 | 2): () => Terms {
  const { text, signature } = signed(by, serial);
  const terms = bind(verifySnapshot(text, signature, [by.pinned]));
  return () => terms;
}
