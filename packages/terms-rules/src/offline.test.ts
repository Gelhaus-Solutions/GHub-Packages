/**
 * offline(), and the reading of a bundled snapshot it rests on.
 *
 * offline() is asked of the snapshot this release carries, under the key it
 * pins. The reading underneath is asked of a directory made for each test,
 * with a key pair made here, so a broken file can be made without the real
 * signing key.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { bind } from "./consent.js";
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
  it("binds the snapshot this release carries, under the key it pins", () => {
    const terms = offline();
    expect(terms.snapshot.serial).toBe(203);
    expect(readdirSync(join(process.cwd(), "snapshot")).sort()).toEqual([
      "README.md",
      "snapshot.json",
      "snapshot.sig.json",
    ]);
    expect(PINNED_KEYS.map((key) => [key.keyId, key.keyVersion])).toEqual([
      ["gpterms-snapshot", 1],
    ]);
  });

  it("refuses the carried snapshot once a byte of it changes", () => {
    const text = readFileSync(join(process.cwd(), "snapshot", "snapshot.json"), "utf8");
    const signature = readFileSync(join(process.cwd(), "snapshot", "snapshot.sig.json"), "utf8");
    const changed = text.replace('"serial":203', '"serial":204');
    expect(changed).not.toBe(text);
    const directory = directoryWith({ "snapshot.json": changed, "snapshot.sig.json": signature });
    expect(() => bundledSnapshotIn(directory, PINNED_KEYS)).toThrow(SnapshotSignatureError);
  });

  /**
   * The registries' surfaces cover a document (D73) whose version is archived
   * and not yet dated (GPLATTERMS-40): until it has a rollout or the surface a
   * live link for it, the rules cannot say where an account stands there, and
   * say so rather than guess. Those three products are still on
   * @ghub/gctl-terms; they move once a carried snapshot answers for them, and
   * this test then fails and names them.
   */
  const UNDATED = ["gopencdr", "gopencnr", "gopencsr"];

  it("cannot decide the registries' surfaces yet, and says which document is undated", () => {
    const carried = offline();
    for (const surface of UNDATED) {
      expect(() =>
        carried.consentStateAt(surface, null, new Date("2026-10-08T12:00:00Z"), { paid: false }),
      ).toThrow(/is neither announced to it nor linked until it is/);
    }
  });

  /**
   * The products moving off @ghub/gctl-terms decide from this snapshot instead
   * of the archive that package carried, so on every other surface 0.1.4 knew
   * it has to say what 0.1.4 said: before the first rollout, while it is
   * announced, and once it binds.
   */
  it("decides every other surface of @ghub/gctl-terms 0.1.4 as 0.1.4 did, through the first rollout", () => {
    const carried = offline();
    const old = bind(GCTL_TERMS_0_1_4);
    const instants = [
      "2026-10-03T12:00:00Z",
      "2026-10-08T12:00:00Z",
      "2026-11-19T22:59:59Z",
      "2026-11-21T12:00:00Z",
    ].map((at) => new Date(at));
    const surfaces = old.snapshot.surfaces
      .map((surface) => surface.id)
      .filter((surface) => !UNDATED.includes(surface));
    expect([...surfaces].sort()).toEqual([
      "gadvisory",
      "gcontrol",
      "gplatform-billing",
      "gplatform-control",
      "gplatform-sso",
    ]);
    for (const surface of surfaces) {
      for (const at of instants) {
        expect(carried.versionToRecord(surface, at), `${surface} at ${at.toISOString()}`).toBe(
          old.versionToRecord(surface, at),
        );
        expect(
          carried.announcementsDue(surface, at).map((one) => one.versionId),
          `${surface} at ${at.toISOString()}`,
        ).toEqual(old.announcementsDue(surface, at).map((one) => one.versionId));
        for (const recorded of [
          null,
          old.versionToRecord(surface, new Date("2026-10-03T12:00:00Z")),
        ]) {
          expect(
            carried.consentStateAt(surface, recorded, at, { paid: false }),
            `${surface} at ${at.toISOString()} from ${String(recorded)}`,
          ).toEqual(old.consentStateAt(surface, recorded, at, { paid: false }));
        }
      }
    }
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
    expect(() => bundledSnapshotIn(directory, [])).toThrow(SnapshotSignatureError);
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
