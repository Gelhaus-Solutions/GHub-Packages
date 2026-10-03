/**
 * A version that binds at once (`atOnce`): an editorial fix, which carries
 * an acceptance of the version before it, and a version dated while nobody
 * had accepted anything, which binds like any other. Neither is owed six
 * weeks' notice, and the snapshot says which it is.
 *
 * The fixture's version ids end in `-fixture-N` so that nobody grepping for
 * a real version id lands here.
 */

import { describe, expect, it } from "vitest";
import { bind } from "./consent.js";
import {
  parseSnapshot,
  SnapshotError,
  type Snapshot,
  type SnapshotRollout,
  type SnapshotVersion,
} from "./snapshot.js";

const version = (document: string, versionId: string): SnapshotVersion => ({
  versionId,
  document,
  version: versionId.slice(-9),
  title: { en: `Fixture ${versionId}`, de: `Fixture ${versionId}` },
  contentHash: "0".repeat(64),
  archiveUrl: {
    en: `https://gplatform.org/legal/${versionId}`,
    de: `https://gplatform.org/de/legal/${versionId}`,
  },
  frozenAt: "2026-09-01T12:00:00Z",
});

const rollout = (
  versionId: string,
  announcedAt: string,
  inForceFrom: string,
  extra: Partial<SnapshotRollout> = {},
): SnapshotRollout => ({ versionId, surface: null, announcedAt, inForceFrom, ...extra });

const ORIGINAL = "2026-09-06T08:00:00Z";
const FIX = "2026-10-10T10:00:00Z";
const SECOND_FIX = "2026-10-12T10:00:00Z";
const NEXT_ANNOUNCED = "2026-10-20T08:00:00Z";
const NEXT_IN_FORCE = "2026-12-05T08:00:00Z";

const TERMS_1 = "terms-fixture-1";
const TERMS_2 = "terms-fixture-2";
const TERMS_3 = "terms-fixture-3";
const TERMS_4 = "terms-fixture-4";
const AUP_1 = "aup-fixture-1";
const AUP_2 = "aup-fixture-2";

function snapshot(rollouts: readonly SnapshotRollout[]): Snapshot {
  return {
    format: 1,
    serial: 3,
    generatedAt: "2026-10-12T12:00:00Z",
    documents: [
      {
        key: "page:gs:terms",
        product: "gs",
        kind: "consent",
        liveUrl: { en: "https://gplatform.org/terms" },
      },
      {
        key: "project:fixture:aup",
        product: "fixture",
        kind: "consent",
        liveUrl: { en: "https://gplatform.org/apps/fixture/aup" },
      },
    ],
    versions: [
      version("page:gs:terms", TERMS_4),
      version("page:gs:terms", TERMS_3),
      version("page:gs:terms", TERMS_2),
      version("page:gs:terms", TERMS_1),
      version("project:fixture:aup", AUP_2),
      version("project:fixture:aup", AUP_1),
    ],
    surfaces: [
      {
        id: "fixture",
        covers: ["project:fixture:aup", "page:gs:terms"],
        liveLinks: {},
      },
    ],
    rollouts: [...rollouts],
  };
}

const ROLLOUTS: readonly SnapshotRollout[] = [
  rollout(TERMS_1, ORIGINAL, ORIGINAL),
  rollout(TERMS_2, FIX, FIX, { atOnce: "editorial" }),
  rollout(TERMS_3, SECOND_FIX, SECOND_FIX, { atOnce: "editorial" }),
  rollout(TERMS_4, NEXT_ANNOUNCED, NEXT_IN_FORCE),
  rollout(AUP_1, ORIGINAL, ORIGINAL),
  rollout(AUP_2, FIX, FIX, { atOnce: "no-accounts" }),
];

const { announcementsDue, consentStateAt, documentStandings, versionToRecord } = bind(
  parseSnapshot(snapshot(ROLLOUTS)),
);

const at = (iso: string): Date => new Date(iso);
const FREE = { paid: false } as const;
const PAID = { paid: true } as const;
const SURFACE = "fixture";

describe("a snapshot that says a version binds at once", () => {
  it("reads both reasons, and leaves an ordinary rollout without one", () => {
    const read = parseSnapshot(snapshot(ROLLOUTS));
    expect(read.rollouts.find((one) => one.versionId === TERMS_2)?.atOnce).toBe("editorial");
    expect(read.rollouts.find((one) => one.versionId === AUP_2)?.atOnce).toBe("no-accounts");
    expect(read.rollouts.find((one) => one.versionId === TERMS_4)).not.toHaveProperty("atOnce");
  });

  it("refuses any other reason", () => {
    const odd = ROLLOUTS.map((one) =>
      one.versionId === TERMS_2
        ? ({ ...one, atOnce: "urgent" } as unknown as SnapshotRollout)
        : one,
    );
    expect(() => parseSnapshot(snapshot(odd))).toThrow(SnapshotError);
    expect(() => parseSnapshot(snapshot(odd))).toThrow(/"editorial" or "no-accounts"/u);
  });

  it("still refuses a superseding version without six weeks' notice that gives no reason", () => {
    const silent = ROLLOUTS.map((one) =>
      one.versionId === TERMS_2 ? rollout(TERMS_2, FIX, FIX) : one,
    );
    expect(() => parseSnapshot(snapshot(silent))).toThrow(/six weeks and a day/u);
  });
});

describe("an editorial fix", () => {
  it("leaves an account that accepted the version before it agreed, and asks nobody", () => {
    for (const now of [at(FIX), at(SECOND_FIX), at("2026-10-15T00:00:00Z")]) {
      expect(consentStateAt(SURFACE, `${AUP_2}+${TERMS_1}`, now, FREE)).toEqual({
        kind: "agreed",
      });
    }
    expect(announcementsDue(SURFACE, at(FIX))).toEqual([]);
  });

  it("is what a new acceptance records from the instant it binds", () => {
    expect(versionToRecord(SURFACE, at(FIX))).toBe(`${AUP_2}+${TERMS_2}`);
    expect(versionToRecord(SURFACE, at(SECOND_FIX))).toBe(`${AUP_2}+${TERMS_3}`);
  });

  it("says the account is current, with what it accepted and what is in force", () => {
    const terms = documentStandings(SURFACE, `${AUP_2}+${TERMS_1}`, at(SECOND_FIX)).find(
      (one) => one.document === "page:gs:terms",
    );
    expect(terms?.kind).toBe("current");
    expect(terms?.accepted?.versionId).toBe(TERMS_1);
    expect(terms?.inForce?.versionId).toBe(TERMS_3);
  });

  it("carries nothing past an ordinary version: that one is announced and asked as usual", () => {
    expect(consentStateAt(SURFACE, `${AUP_2}+${TERMS_1}`, at(NEXT_ANNOUNCED), FREE)).toEqual({
      kind: "asked",
      inForceFrom: at(NEXT_IN_FORCE),
    });
    expect(consentStateAt(SURFACE, `${AUP_2}+${TERMS_1}`, at(NEXT_IN_FORCE), FREE)).toEqual({
      kind: "restricted",
    });
    expect(consentStateAt(SURFACE, `${AUP_2}+${TERMS_4}`, at(NEXT_IN_FORCE), FREE)).toEqual({
      kind: "agreed",
    });
  });

  it("carries nothing before it binds", () => {
    expect(
      consentStateAt(SURFACE, `${AUP_1}+${TERMS_1}`, at("2026-10-01T00:00:00Z"), FREE),
    ).toEqual({ kind: "agreed" });
  });
});

describe("a version dated while nobody had accepted anything", () => {
  it("binds at once like any version: an earlier acceptance is behind", () => {
    expect(consentStateAt(SURFACE, `${AUP_1}+${TERMS_1}`, at(FIX), FREE)).toEqual({
      kind: "restricted",
    });
    expect(consentStateAt(SURFACE, `${AUP_1}+${TERMS_1}`, at(FIX), PAID)).toEqual({
      kind: "owed-paid",
    });
    expect(consentStateAt(SURFACE, `${AUP_2}+${TERMS_1}`, at(FIX), FREE)).toEqual({
      kind: "agreed",
    });
  });
});
