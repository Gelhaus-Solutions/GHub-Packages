/**
 * offline(), and the reading of a bundled snapshot it rests on.
 *
 * No release carries a snapshot yet, so offline() itself can only be asked
 * what it says until one does. The reading underneath is asked of a directory
 * made for each test, with a key pair made here, because the real signing key
 * is not pinned until the release that first carries a snapshot.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { GCTL_TERMS_0_1_4 } from "./fixtures/gctl-terms-0.1.4.js";
import { PINNED_KEYS } from "./keys.js";
import { bundledSnapshotIn, NoBundledSnapshotError, offline } from "./offline.js";
import { SnapshotError } from "./snapshot.js";
import { SnapshotSignatureError, type PinnedKey } from "./verify.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEYS: readonly PinnedKey[] = [
  {
    keyId: "gpterms-snapshot",
    keyVersion: 1,
    publicKeySpkiDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  },
];
const TEXT = canonicalJson(GCTL_TERMS_0_1_4);
const SIGNATURE = JSON.stringify({
  keyId: "gpterms-snapshot",
  keyVersion: 1,
  signature: sign(null, Buffer.from(TEXT, "utf8"), privateKey).toString("base64"),
});

const made: string[] = [];
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directoryWith(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "terms-rules-"));
  made.push(directory);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, name), content, "utf8");
  }
  return directory;
}

describe("offline()", () => {
  it("says plainly that no release has carried a snapshot yet", () => {
    expect(() => offline()).toThrow(NoBundledSnapshotError);
    expect(() => offline()).toThrow(
      /No snapshot is bundled with this release of @ghub\/terms-rules yet\. It arrives with the first release that carries one;/,
    );
  });

  it("finds the package's snapshot directory, which holds only the README for now", () => {
    expect(readdirSync(join(process.cwd(), "snapshot"))).toEqual(["README.md"]);
    expect(PINNED_KEYS).toEqual([]);
  });
});

describe("reading a bundled snapshot", () => {
  it("verifies it against the pinned keys and returns it", () => {
    const directory = directoryWith({ "snapshot.json": TEXT, "snapshot.sig.json": SIGNATURE });
    expect(bundledSnapshotIn(directory, KEYS)).toEqual(GCTL_TERMS_0_1_4);
  });

  it("calls a directory with neither file a release without a snapshot", () => {
    expect(() => bundledSnapshotIn(directoryWith({ "README.md": "none" }), KEYS)).toThrow(
      NoBundledSnapshotError,
    );
  });

  it("calls one file without the other a broken release, not a missing snapshot", () => {
    const halves: Record<string, string>[] = [
      { "snapshot.json": TEXT },
      { "snapshot.sig.json": SIGNATURE },
    ];
    for (const files of halves) {
      const call = () => bundledSnapshotIn(directoryWith(files), KEYS);
      expect(call).toThrow(SnapshotError);
      expect(call).not.toThrow(NoBundledSnapshotError);
      expect(call).toThrow(/without .* A snapshot is only ever used with its signature/);
    }
  });

  it("refuses a snapshot this release has no key for", () => {
    const directory = directoryWith({ "snapshot.json": TEXT, "snapshot.sig.json": SIGNATURE });
    expect(() => bundledSnapshotIn(directory, PINNED_KEYS)).toThrow(SnapshotSignatureError);
  });

  it("refuses a snapshot file that was reformatted after signing", () => {
    const directory = directoryWith({
      "snapshot.json": `${JSON.stringify(JSON.parse(TEXT), null, 2)}\n`,
      "snapshot.sig.json": SIGNATURE,
    });
    expect(() => bundledSnapshotIn(directory, KEYS)).toThrow(/not in canonical form/);
  });

  it("refuses a signature file that is not JSON", () => {
    const directory = directoryWith({ "snapshot.json": TEXT, "snapshot.sig.json": "{" });
    expect(() => bundledSnapshotIn(directory, KEYS)).toThrow(/snapshot\.sig\.json is not JSON/);
  });
});
