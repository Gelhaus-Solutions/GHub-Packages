/**
 * The rollout of a new version, against a snapshot built for the purpose.
 *
 * The real archive holds one version of most documents, so it cannot show the
 * part of these rules that matters most: what happens between a version being
 * announced and it coming into force, and after. The snapshot below holds two
 * versions of the general terms and three of GControl's terms, each with its
 * own dates, and lists versions and rollouts out of order on purpose, so that
 * anything choosing a version by its place in an array gets these tests wrong.
 *
 * The fixture's new version ids end in `-fixture-N` so that nobody grepping
 * for a real version id lands here.
 *
 * Two surfaces are used. `gplatform-control` pins the general terms alone, so
 * it shows one document on its own. `gcontrol` pins its product terms and the
 * general terms, whose notices overlap, which is where comparing whole
 * identifiers rather than documents would go wrong.
 *
 * Moved from `@ghub/gctl-terms` 0.1.4 with the rules, where the same archive
 * was mocked in place of the real one. The tests of the deprecated
 * `currentConsentVersion` and `needsAgreement` did not move with them, because
 * the functions did not: one was versionToRecord under another name, and the
 * other asked whether consentStateAt restricts a free account, which every
 * test below already asks.
 */

import { describe, expect, it } from "vitest";
import { bind, UnknownDocumentError } from "./consent.js";
import type { ChangeSummary, Snapshot, SnapshotRollout, SnapshotVersion } from "./snapshot.js";

const SUMMARY: ChangeSummary = {
  en: "Paid accounts keep full use until the end of their term if they do not accept.",
  de: "Bezahlte Konten behalten die volle Nutzung bis zum Ende ihrer Laufzeit, wenn sie nicht zustimmen.",
};

const ORIGINAL = "2026-09-06T18:40:41Z";

const version = (document: string, versionId: string, frozenAt: string): SnapshotVersion => ({
  versionId,
  document,
  version: versionId.slice(-10),
  title: { en: `Fixture ${versionId}`, de: `Fixture ${versionId}` },
  contentHash: "0".repeat(64),
  archiveUrl: {
    en: `https://gplatform.org/legal/${versionId}`,
    de: `https://gplatform.org/de/legal/${versionId}`,
  },
  frozenAt,
});

const rollout = (
  versionId: string,
  announcedAt: string,
  inForceFrom: string,
  extra: { summary?: ChangeSummary } = {},
): SnapshotRollout => ({ versionId, surface: null, announcedAt, inForceFrom, ...extra });

const FIXTURE: Snapshot = {
  format: 1,
  serial: 7,
  generatedAt: "2026-11-19T12:00:00Z",
  documents: [
    {
      key: "page:gs:terms",
      product: "gs",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/live/page:gs:terms" },
    },
    {
      key: "project:gcontrol:terms",
      product: "gcontrol",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/live/project:gcontrol:terms" },
    },
    {
      key: "project:gplatform-control:terms",
      product: "gplatform-control",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gplatform-control/terms" },
    },
  ],
  versions: [
    version("project:gcontrol:terms", "gcontrol-terms-fixture-3", "2026-11-19T12:00:00Z"),
    version("page:gs:terms", "gs-terms-fixture-2", "2026-09-30T12:00:00Z"),
    version("project:gcontrol:terms", "gcontrol-terms-fixture-2", "2026-10-09T12:00:00Z"),
    version("page:gs:terms", "gs-terms-2026-09-06", ORIGINAL),
    version("project:gcontrol:terms", "gcontrol-terms-2026-09-06", ORIGINAL),
  ],
  surfaces: [
    {
      id: "gplatform-control",
      covers: ["project:gplatform-control:terms", "page:gs:terms"],
      liveLinks: {
        "project:gplatform-control:terms": "https://gplatform.org/apps/gplatform-control/terms",
      },
    },
    { id: "gcontrol", covers: ["project:gcontrol:terms", "page:gs:terms"], liveLinks: {} },
  ],
  rollouts: [
    rollout("gcontrol-terms-fixture-3", "2026-11-20T08:00:00Z", "2027-01-05T00:00:00Z"),
    rollout("gs-terms-fixture-2", "2026-10-01T08:00:00Z", "2026-11-15T00:00:00Z", {
      summary: SUMMARY,
    }),
    rollout("gcontrol-terms-fixture-2", "2026-10-10T08:00:00Z", "2026-11-25T00:00:00Z"),
    rollout("gs-terms-2026-09-06", ORIGINAL, ORIGINAL),
    rollout("gcontrol-terms-2026-09-06", ORIGINAL, ORIGINAL),
  ],
};

const {
  announcementsDue,
  consentLinks,
  consentStateAt,
  documentsFor,
  documentsOfConsent,
  versionToRecord,
} = bind(FIXTURE);

const at = (iso: string): Date => new Date(iso);
const before = (iso: string): Date => new Date(new Date(iso).getTime() - 1);

const GS_ANNOUNCED = "2026-10-01T08:00:00.000Z";
const GS_IN_FORCE = "2026-11-15T00:00:00.000Z";
const GCONTROL_IN_FORCE = "2026-11-25T00:00:00.000Z";
const GCONTROL_3_IN_FORCE = "2027-01-05T00:00:00.000Z";

const GS_1 = "gs-terms-2026-09-06";
const GS_2 = "gs-terms-fixture-2";

const FREE = { paid: false } as const;
const PAID = { paid: true } as const;
const STAFF = { paid: false, staff: true } as const;

describe("the fixture", () => {
  it("lists a newer version before an older one, so array order cannot pass", () => {
    const ids = FIXTURE.versions.map((entry) => entry.versionId);
    expect(ids.indexOf(GS_2)).toBeLessThan(ids.indexOf(GS_1));
    expect(ids.indexOf("gcontrol-terms-fixture-3")).toBeLessThan(
      ids.indexOf("gcontrol-terms-2026-09-06"),
    );
    const rollouts = FIXTURE.rollouts.map((entry) => entry.versionId);
    expect(rollouts.indexOf(GS_2)).toBeLessThan(rollouts.indexOf(GS_1));
  });
});

describe("one document with two versions", () => {
  const surface = "gplatform-control";

  it("records the version in force until the new one is announced", () => {
    const now = before(GS_ANNOUNCED);
    expect(versionToRecord(surface, now)).toBe(GS_1);
    expect(documentsFor(surface, now).map((d) => d.versionId)).toEqual([GS_1]);
    expect(consentStateAt(surface, GS_1, now, FREE)).toEqual({ kind: "agreed" });
    expect(announcementsDue(surface, now)).toEqual([]);
  });

  it("asks from the instant of notice, with full use and the date to accept by", () => {
    const now = at(GS_ANNOUNCED);
    expect(versionToRecord(surface, now)).toBe(GS_2);
    const asked = { kind: "asked", inForceFrom: at(GS_IN_FORCE) };
    expect(consentStateAt(surface, GS_1, now, FREE)).toEqual(asked);
    // Paying changes nothing while the old version is still the one in force.
    expect(consentStateAt(surface, GS_1, now, PAID)).toEqual(asked);
    expect(consentStateAt(surface, GS_2, now, FREE)).toEqual({ kind: "agreed" });
  });

  it("still only asks one millisecond before the new version is in force", () => {
    expect(consentStateAt(surface, GS_1, before(GS_IN_FORCE), FREE)).toEqual({
      kind: "asked",
      inForceFrom: at(GS_IN_FORCE),
    });
  });

  it("puts the old version behind from the instant the new one is in force", () => {
    const now = at(GS_IN_FORCE);
    expect(consentStateAt(surface, GS_1, now, FREE)).toEqual({ kind: "restricted" });
    expect(consentStateAt(surface, GS_1, now, PAID)).toEqual({ kind: "owed-paid" });
    expect(consentStateAt(surface, GS_1, now, STAFF)).toEqual({ kind: "exempt" });
    expect(consentStateAt(surface, GS_2, now, FREE)).toEqual({ kind: "agreed" });
    expect(versionToRecord(surface, now)).toBe(GS_2);
    // In force, so no longer something to give notice of.
    expect(announcementsDue(surface, now)).toEqual([]);
  });

  it("refuses an instant before any version was announced, rather than guessing", () => {
    expect(() => versionToRecord(surface, at("2026-01-01T00:00:00Z"))).toThrow(
      UnknownDocumentError,
    );
    expect(() => consentStateAt(surface, GS_1, new Date(Number.NaN), FREE)).toThrow(RangeError);
  });
});

describe("who is asked", () => {
  const surface = "gplatform-control";
  const nows = [
    before(GS_ANNOUNCED),
    at(GS_ANNOUNCED),
    at(GS_IN_FORCE),
    at("2027-06-01T00:00:00Z"),
  ];
  const recorded = [null, "", GS_1, GS_2, "gs-terms-2020-01-01"];

  it("exempts staff whatever they recorded, and whether or not they pay", () => {
    for (const now of nows) {
      for (const value of recorded) {
        expect(consentStateAt(surface, value, now, STAFF)).toEqual({ kind: "exempt" });
        expect(consentStateAt(surface, value, now, { paid: true, staff: true })).toEqual({
          kind: "exempt",
        });
      }
    }
  });

  it("never restricts a paid account", () => {
    for (const now of nows) {
      for (const value of recorded) {
        expect(consentStateAt(surface, value, now, PAID).kind).not.toBe("restricted");
      }
    }
  });

  it("treats a free and a paid account alike until something in force is missing", () => {
    for (const now of nows) {
      for (const value of [GS_1, GS_2]) {
        const free = consentStateAt(surface, value, now, FREE);
        if (free.kind === "restricted") continue;
        expect(consentStateAt(surface, value, now, PAID)).toEqual(free);
      }
    }
  });
});

describe("what was recorded", () => {
  const surface = "gplatform-control";

  it("restricts a free account that never recorded anything, even before any notice", () => {
    // Nothing accepted means the version in force is not accepted either.
    for (const now of [before(GS_ANNOUNCED), at(GS_ANNOUNCED), at(GS_IN_FORCE)]) {
      expect(consentStateAt(surface, null, now, FREE)).toEqual({ kind: "restricted" });
      expect(consentStateAt(surface, null, now, PAID)).toEqual({ kind: "owed-paid" });
      expect(consentStateAt(surface, "", now, FREE)).toEqual({ kind: "restricted" });
    }
  });

  it("counts a version this archive does not hold as nothing accepted", () => {
    // Text from before the archive began, or from a newer archive than this
    // one: in neither case can the person be shown what they agreed to.
    for (const value of ["gs-terms-2020-01-01", "gs-terms-2099-01-01"]) {
      expect(consentStateAt(surface, value, at(GS_ANNOUNCED), FREE)).toEqual({
        kind: "restricted",
      });
      expect(consentStateAt(surface, value, at(GS_ANNOUNCED), PAID)).toEqual({
        kind: "owed-paid",
      });
    }
  });

  it("counts an older archived version as behind once its successor is in force", () => {
    expect(consentStateAt(surface, GS_1, at("2027-06-01T00:00:00Z"), FREE)).toEqual({
      kind: "restricted",
    });
  });

  it("does not take an agreement made on another surface as one made here", () => {
    // gcontrol's identifier names GControl's terms, which this surface does
    // not pin, so it is not an agreement to this surface's documents.
    const gcontrol = "gcontrol-terms-2026-09-06+gs-terms-2026-09-06";
    expect(consentStateAt(surface, gcontrol, before(GS_ANNOUNCED), FREE)).toEqual({
      kind: "restricted",
    });
  });

  it("does not take a value naming one document twice", () => {
    expect(consentStateAt(surface, `${GS_1}+${GS_2}`, at(GS_ANNOUNCED), FREE)).toEqual({
      kind: "restricted",
    });
  });

  it("tells documents apart by their keys, not by where they sit in the value", () => {
    expect(
      consentStateAt(
        "gcontrol",
        "gs-terms-2026-09-06+gcontrol-terms-2026-09-06",
        before(GS_ANNOUNCED),
        FREE,
      ),
    ).toEqual({ kind: "agreed" });
  });

  it("reads the value strictly, as ids joined by single plus signs and nothing else", () => {
    // Nothing versionToRecord writes looks like these, so something else wrote
    // them, and reading past the stray part would be a guess at what it meant.
    const now = before(GS_ANNOUNCED);
    const current = "gcontrol-terms-2026-09-06+gs-terms-2026-09-06";
    expect(consentStateAt("gcontrol", current, now, FREE)).toEqual({ kind: "agreed" });
    for (const value of [
      `${current}+`,
      `+${current}`,
      current.replace("+", "++"),
      current.replace("+", " + "),
      ` ${current}`,
      `${current}\n`,
    ]) {
      expect(consentStateAt("gcontrol", value, now, FREE), JSON.stringify(value)).toEqual({
        kind: "restricted",
      });
      expect(documentsOfConsent(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("several documents, each with its own dates", () => {
  const surface = "gcontrol";
  const ORIGINAL_CONSENT = "gcontrol-terms-2026-09-06+gs-terms-2026-09-06";

  it("asks by the earliest date anything not accepted comes into force", () => {
    const now = at("2026-10-12T00:00:00Z");
    expect(versionToRecord(surface, now)).toBe("gcontrol-terms-fixture-2+gs-terms-fixture-2");
    // The general terms bind on 15 November, the product terms on the 25th.
    expect(consentStateAt(surface, ORIGINAL_CONSENT, now, FREE)).toEqual({
      kind: "asked",
      inForceFrom: at(GS_IN_FORCE),
    });
  });

  it("does not restrict an account ahead on one document and current on the other", () => {
    // Accepted on 12 October. On 22 November the general terms it accepted
    // are in force, the product terms it accepted are not yet, and a third
    // product version has been announced. It has accepted everything in
    // force. Compared as whole identifiers with the version in force,
    // gcontrol-terms-2026-09-06+gs-terms-fixture-2, it would read as behind.
    const now = at("2026-11-22T00:00:00Z");
    expect(versionToRecord(surface, now)).toBe("gcontrol-terms-fixture-3+gs-terms-fixture-2");
    expect(
      consentStateAt(surface, "gcontrol-terms-fixture-2+gs-terms-fixture-2", now, FREE),
    ).toEqual({ kind: "asked", inForceFrom: at(GCONTROL_3_IN_FORCE) });
  });

  it("gives the next version after the accepted one as the date, not the newest", () => {
    // Accepted on 5 October, before GControl's second version was announced.
    // Its second version binds on 25 November and is what puts this account
    // behind, even though a third is announced by now.
    const recorded = "gcontrol-terms-2026-09-06+gs-terms-fixture-2";
    expect(consentStateAt(surface, recorded, at("2026-11-22T00:00:00Z"), FREE)).toEqual({
      kind: "asked",
      inForceFrom: at(GCONTROL_IN_FORCE),
    });
    expect(consentStateAt(surface, recorded, at(GCONTROL_IN_FORCE), FREE)).toEqual({
      kind: "restricted",
    });
  });

  it("is behind as soon as any one document in force is not accepted", () => {
    const now = at("2026-11-22T00:00:00Z");
    expect(consentStateAt(surface, ORIGINAL_CONSENT, now, FREE)).toEqual({ kind: "restricted" });
    expect(consentStateAt(surface, ORIGINAL_CONSENT, now, PAID)).toEqual({ kind: "owed-paid" });
  });

  it("gives notice of each pending version, product first, and none once in force", () => {
    expect(announcementsDue(surface, at("2026-10-12T00:00:00Z"))).toEqual([
      { versionId: "gcontrol-terms-fixture-2", inForceFrom: at(GCONTROL_IN_FORCE) },
      { versionId: GS_2, inForceFrom: at(GS_IN_FORCE), summary: SUMMARY },
    ]);
    expect(announcementsDue(surface, at("2026-11-22T00:00:00Z"))).toEqual([
      { versionId: "gcontrol-terms-fixture-2", inForceFrom: at(GCONTROL_IN_FORCE) },
      { versionId: "gcontrol-terms-fixture-3", inForceFrom: at(GCONTROL_3_IN_FORCE) },
    ]);
    expect(announcementsDue(surface, at(GCONTROL_3_IN_FORCE))).toEqual([]);
  });
});

describe("the summary", () => {
  it("is carried with the announcement that states one, in both languages", () => {
    const [general] = announcementsDue("gplatform-control", at(GS_ANNOUNCED));
    expect(general?.summary).toEqual(SUMMARY);
    expect(general?.summary?.en).toContain("Paid accounts");
    expect(general?.summary?.de).toContain("Bezahlte Konten");
  });

  it("is absent from an announcement that does not, rather than empty", () => {
    const [product] = announcementsDue("gcontrol", at("2026-10-12T00:00:00Z"));
    expect(product?.versionId).toBe("gcontrol-terms-fixture-2");
    expect(product !== undefined && "summary" in product).toBe(false);
  });
});

describe("links and what was agreed, at any version", () => {
  it("links the version an acceptance records, with the date it binds", () => {
    const links = consentLinks("gcontrol", at("2026-10-12T00:00:00Z"));
    expect(links.product?.versionId).toBe("gcontrol-terms-fixture-2");
    expect(links.general.versionId).toBe(GS_2);
    expect(links.general.rollout.inForceFrom).toBe("2026-11-15T00:00:00Z");
    expect(consentLinks("gcontrol", before(GS_ANNOUNCED)).general.versionId).toBe(GS_1);
  });

  it("still resolves what somebody agreed to, whichever version it was", () => {
    expect(
      documentsOfConsent("gcontrol-terms-fixture-2+gs-terms-fixture-2")?.map(
        (d) => d.archiveUrl.en,
      ),
    ).toEqual([
      "https://gplatform.org/legal/gcontrol-terms-fixture-2",
      "https://gplatform.org/legal/gs-terms-fixture-2",
    ]);
  });
});
