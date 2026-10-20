/**
 * What the snapshot added to the rules: a version's dates per surface.
 *
 * gctl-terms gave each version one pair of dates, so every surface announced
 * it together and bound it together. Contribution Checker's notice of the new
 * general terms goes out later than the other products' (its six weeks run from
 * its own mail), so on Contribution Checker the same version has to be asked
 * about later and bind later, while every other surface keeps 8 October and 20
 * November. A rollout of the version for that surface alone does that, and
 * these tests hold the rules to it.
 *
 * Contribution Checker's own terms here are a fictional first version, ending
 * in `-fixture-1` like the rollout tests' fixtures, so that nobody grepping
 * for a real version id lands here.
 */

import { describe, expect, it } from "vitest";
import {
  announcementsDue as announcementsDueOf,
  bind,
  consentStateAt as consentStateAtOf,
  UnknownDocumentError,
  UnknownSurfaceError,
  versionToRecord as versionToRecordOf,
} from "./consent.js";
import { GCTL_TERMS_0_1_4 } from "./fixtures/gctl-terms-0.1.4.js";
import type { ChangeSummary, Snapshot } from "./snapshot.js";

const CC = "contribution-checker";
const CC_TERMS = "contribution-checker-terms-fixture-1";

/** The later objection date is the reason the summary lives on the rollout. */
const CC_SUMMARY: ChangeSummary = {
  en: "This version replaces the general terms of 6 September 2026. You may object to this change by email to contact@gplatform.org before 26 November 2026.",
  de: "Diese Fassung ersetzt die allgemeinen Nutzungsbedingungen vom 6. September 2026. Sie können dieser Änderung vor dem 26. November 2026 per E-Mail an contact@gplatform.org widersprechen.",
};

/** The 0.1.4 archive, plus Contribution Checker with its own terms and its own
 *  rollout of the general terms of 2026-10-01. */
const SNAPSHOT: Snapshot = {
  ...GCTL_TERMS_0_1_4,
  serial: GCTL_TERMS_0_1_4.serial + 1,
  documents: [
    ...GCTL_TERMS_0_1_4.documents,
    {
      key: "project:contribution-checker:terms",
      product: CC,
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/contribution-checker/terms" },
    },
  ],
  versions: [
    ...GCTL_TERMS_0_1_4.versions,
    {
      versionId: CC_TERMS,
      document: "project:contribution-checker:terms",
      version: "fixture-1",
      title: { en: "Contribution Checker terms", de: "Contribution-Checker-Nutzungsbedingungen" },
      contentHash: "c".repeat(64),
      archiveUrl: {
        en: `https://gplatform.org/legal/${CC_TERMS}`,
        de: `https://gplatform.org/de/legal/${CC_TERMS}`,
      },
      frozenAt: "2026-09-20T10:00:00Z",
    },
  ],
  surfaces: [
    ...GCTL_TERMS_0_1_4.surfaces,
    { id: CC, covers: ["project:contribution-checker:terms", "page:gs:terms"], liveLinks: {} },
  ],
  rollouts: [
    ...GCTL_TERMS_0_1_4.rollouts,
    // The first version of a document supersedes nothing and is owed no notice.
    {
      versionId: CC_TERMS,
      surface: null,
      announcedAt: "2026-09-20T10:00:00Z",
      inForceFrom: "2026-09-20T10:00:00Z",
    },
    {
      versionId: "gs-terms-2026-10-01",
      surface: CC,
      announcedAt: "2026-10-14T09:00:00+02:00",
      inForceFrom: "2026-11-26T09:00:00+01:00",
      summary: CC_SUMMARY,
    },
  ],
};

const terms = bind(SNAPSHOT);
const { announcementsDue, archivedVersion, consentLinks, consentStateAt, versionToRecord } = terms;

const FREE = { paid: false } as const;
const PAID = { paid: true } as const;

/** Every other surface: announced 8 October, in force 20 November, Berlin. */
const ANNOUNCED = new Date("2026-10-07T22:00:00Z");
const IN_FORCE = new Date("2026-11-19T23:00:00Z");
/** Contribution Checker: 14 October 09:00 and 26 November 09:00, Berlin. */
const CC_ANNOUNCED = new Date("2026-10-14T07:00:00Z");
const CC_IN_FORCE = new Date("2026-11-26T08:00:00Z");
const before = (instant: Date): Date => new Date(instant.getTime() - 1);

/** 21 November 2026, noon in Berlin: in force everywhere but Contribution Checker. */
const NOV_21 = new Date("2026-11-21T11:00:00Z");

/** One person with an account on each product, who accepted everything up to
 *  the new general terms and not those. */
const CC_OLD = `${CC_TERMS}+gs-terms-2026-09-06`;
const GADVISORY_OLD = "gadvisory-terms-2026-10-01+gs-terms-2026-09-06";

describe("a rollout for one surface", () => {
  it("dates the version on that surface alone, and every other surface keeps the default", () => {
    const onCc = archivedVersion("gs-terms-2026-10-01", CC);
    expect(onCc?.rollout.surface).toBe(CC);
    expect(new Date(onCc?.rollout.announcedAt ?? "").toISOString()).toBe(
      CC_ANNOUNCED.toISOString(),
    );
    expect(new Date(onCc?.rollout.inForceFrom ?? "").toISOString()).toBe(CC_IN_FORCE.toISOString());
    for (const surface of terms.surfaces().filter((id) => id !== CC)) {
      const elsewhere = archivedVersion("gs-terms-2026-10-01", surface);
      expect(elsewhere?.rollout.surface, surface).toBeNull();
      expect(new Date(elsewhere?.rollout.inForceFrom ?? "").toISOString(), surface).toBe(
        IN_FORCE.toISOString(),
      );
    }
  });

  it("leaves every other surface answering exactly as it did without it", () => {
    const without = bind(GCTL_TERMS_0_1_4);
    const instants = [before(ANNOUNCED), ANNOUNCED, CC_ANNOUNCED, IN_FORCE, NOV_21, CC_IN_FORCE];
    const values = [
      null,
      "gs-terms-2026-09-06",
      GADVISORY_OLD,
      "gadvisory-terms-2026-10-01+gs-terms-2026-10-01",
    ];
    for (const surface of without.surfaces()) {
      for (const now of instants) {
        const where = `${surface} at ${now.toISOString()}`;
        expect(versionToRecord(surface, now), where).toBe(without.versionToRecord(surface, now));
        expect(announcementsDue(surface, now), where).toEqual(
          without.announcementsDue(surface, now),
        );
        expect(consentLinks(surface, now), where).toEqual(without.consentLinks(surface, now));
        for (const value of values) {
          for (const who of [FREE, PAID]) {
            expect(consentStateAt(surface, value, now, who), where).toEqual(
              without.consentStateAt(surface, value, now, who),
            );
          }
        }
      }
    }
  });
});

describe("Contribution Checker running later than the others", () => {
  it("asks a free account on 21 November, to accept by 26 November, where GAdvisory restricts it", () => {
    expect(consentStateAt(CC, CC_OLD, NOV_21, FREE)).toEqual({
      kind: "asked",
      inForceFrom: CC_IN_FORCE,
    });
    expect(consentStateAt("gadvisory", GADVISORY_OLD, NOV_21, FREE)).toEqual({
      kind: "restricted",
    });
    expect(consentStateAt("gadvisory", GADVISORY_OLD, NOV_21, PAID)).toEqual({ kind: "owed-paid" });
  });

  it("asks until the instant it is in force there, and restricts from that instant", () => {
    expect(consentStateAt(CC, CC_OLD, before(CC_IN_FORCE), FREE)).toEqual({
      kind: "asked",
      inForceFrom: CC_IN_FORCE,
    });
    expect(consentStateAt(CC, CC_OLD, CC_IN_FORCE, FREE)).toEqual({ kind: "restricted" });
    expect(consentStateAt(CC, CC_OLD, CC_IN_FORCE, PAID)).toEqual({ kind: "owed-paid" });
    expect(consentStateAt(CC, `${CC_TERMS}+gs-terms-2026-10-01`, CC_IN_FORCE, FREE)).toEqual({
      kind: "agreed",
    });
  });

  it("does not ask before its own notice, though the others have been asking for a week", () => {
    const now = before(CC_ANNOUNCED);
    expect(consentStateAt(CC, CC_OLD, now, FREE)).toEqual({ kind: "agreed" });
    expect(versionToRecord(CC, now)).toBe(CC_OLD);
    expect(
      consentStateAt("gadvisory", "gadvisory-terms-2026-09-06+gs-terms-2026-09-06", now, FREE),
    ).toEqual({
      kind: "asked",
      inForceFrom: IN_FORCE,
    });
  });

  it("owes notice on its own dates, with its own summary", () => {
    const tenth = new Date("2026-10-10T10:00:00Z");
    expect(announcementsDue("gadvisory", tenth).map((a) => a.versionId)).toEqual([
      "gadvisory-terms-2026-10-01",
      "gs-terms-2026-10-01",
    ]);
    expect(announcementsDue(CC, tenth)).toEqual([]);

    const due = [
      { versionId: "gs-terms-2026-10-01", inForceFrom: CC_IN_FORCE, summary: CC_SUMMARY },
    ];
    expect(announcementsDue(CC, CC_ANNOUNCED)).toEqual(due);
    expect(announcementsDue(CC, NOV_21)).toEqual(due);
    expect(announcementsDue("gadvisory", NOV_21)).toEqual([]);
    expect(announcementsDue(CC, CC_IN_FORCE)).toEqual([]);

    // The summary everywhere else names 20 November as the date to object by.
    const [, general] = announcementsDue("gadvisory", tenth);
    expect(general?.summary?.en).toContain("before 20 November 2026");
    expect(general?.summary).not.toEqual(CC_SUMMARY);
  });

  it("records the same general terms as every other surface once it has announced them", () => {
    for (const now of [CC_ANNOUNCED, NOV_21, CC_IN_FORCE]) {
      expect(versionToRecord(CC, now)).toBe(`${CC_TERMS}+gs-terms-2026-10-01`);
      expect(versionToRecord("gadvisory", now)).toBe(
        "gadvisory-terms-2026-10-01+gs-terms-2026-10-01",
      );
    }
    // Before it has, it records what it is showing, which is the old text.
    expect(versionToRecord(CC, new Date("2026-10-10T10:00:00Z"))).toBe(CC_OLD);
  });

  it("puts the date it binds on Contribution Checker on its consent line", () => {
    const links = consentLinks(CC, NOV_21);
    expect(links.product?.versionId).toBe(CC_TERMS);
    expect(links.general.versionId).toBe("gs-terms-2026-10-01");
    expect(links.general.surface).toBe(CC);
    expect(links.general.rollout.inForceFrom).toBe("2026-11-26T09:00:00+01:00");
    expect(consentLinks("gadvisory", ANNOUNCED).general.rollout.inForceFrom).toBe(
      "2026-11-20T00:00:00+01:00",
    );
  });

  it("answers the same through the functions that take the snapshot", () => {
    expect(consentStateAtOf(SNAPSHOT, CC, CC_OLD, NOV_21, FREE)).toEqual(
      consentStateAt(CC, CC_OLD, NOV_21, FREE),
    );
    expect(versionToRecordOf(SNAPSHOT, CC, NOV_21)).toBe(versionToRecord(CC, NOV_21));
    expect(announcementsDueOf(SNAPSHOT, CC, NOV_21)).toEqual(announcementsDue(CC, NOV_21));
  });
});

describe("pinned per surface", () => {
  /**
   * Two surfaces covering one product document, whose first version is
   * announced by default on 1 October and on `late` only on 14 October. Pinned
   * means announced on that surface: on `late` the document is a live link
   * until its own announcement, whatever the other surface does.
   */
  const PINNING: Snapshot = {
    format: 1,
    serial: 1,
    generatedAt: "2026-10-01T00:00:00Z",
    documents: [
      {
        key: "page:gs:terms",
        product: "gs",
        kind: "consent",
        liveUrl: { en: "https://gplatform.org/terms" },
      },
      {
        key: "project:x:terms",
        product: "x",
        kind: "consent",
        liveUrl: { en: "https://gplatform.org/apps/x/terms" },
      },
      {
        key: "project:x:privacy",
        product: "x",
        kind: "notice",
        liveUrl: { en: "https://gplatform.org/apps/x/privacy" },
      },
    ],
    versions: [
      ["page:gs:terms", "gs-terms-fixture-1"],
      ["project:x:terms", "x-terms-fixture-1"],
      ["project:x:terms", "x-terms-fixture-unscheduled"],
      ["project:x:privacy", "x-privacy-fixture-1"],
    ].map(([document, versionId]) => ({
      versionId: versionId as string,
      document: document as string,
      version: "fixture",
      title: { en: "Fixture", de: "Fixture" },
      contentHash: "0".repeat(64),
      archiveUrl: {
        en: `https://gplatform.org/legal/${versionId as string}`,
        de: `https://gplatform.org/de/legal/${versionId as string}`,
      },
      frozenAt: "2026-09-01T00:00:00Z",
    })),
    surfaces: ["early", "late"].map((id) => ({
      id,
      covers: ["project:x:terms", "page:gs:terms"],
      liveLinks: { "project:x:terms": "https://gplatform.org/apps/x/terms" },
    })),
    rollouts: [
      {
        versionId: "gs-terms-fixture-1",
        surface: null,
        announcedAt: "2026-09-01T00:00:00Z",
        inForceFrom: "2026-09-01T00:00:00Z",
      },
      {
        versionId: "x-terms-fixture-1",
        surface: null,
        announcedAt: "2026-10-01T00:00:00Z",
        inForceFrom: "2026-11-13T00:00:00Z",
      },
      {
        versionId: "x-terms-fixture-1",
        surface: "late",
        announcedAt: "2026-10-14T00:00:00Z",
        inForceFrom: "2026-11-26T00:00:00Z",
      },
      {
        versionId: "x-privacy-fixture-1",
        surface: null,
        announcedAt: "2026-10-01T00:00:00Z",
        inForceFrom: "2026-11-13T00:00:00Z",
      },
    ],
  };
  const pinning = bind(PINNING);
  const BETWEEN = new Date("2026-10-07T00:00:00Z");

  it("pins a document from its first announcement on the surface, not from one elsewhere", () => {
    expect(pinning.versionToRecord("early", BETWEEN)).toBe("x-terms-fixture-1+gs-terms-fixture-1");
    expect(pinning.consentLinks("early", BETWEEN).product?.versionId).toBe("x-terms-fixture-1");

    expect(pinning.versionToRecord("late", BETWEEN)).toBe("gs-terms-fixture-1");
    const late = pinning.consentLinks("late", BETWEEN);
    expect(late.product).toBeNull();
    expect(late.unpinnedProductUrl).toBe("https://gplatform.org/apps/x/terms");
    expect(pinning.consentStateAt("late", "gs-terms-fixture-1", BETWEEN, FREE)).toEqual({
      kind: "agreed",
    });
    expect(pinning.announcementsDue("late", BETWEEN)).toEqual([]);
  });

  it("asks first on the late surface from its own announcement, and only then binds", () => {
    const announced = new Date("2026-10-14T00:00:00Z");
    expect(pinning.versionToRecord("late", announced)).toBe("x-terms-fixture-1+gs-terms-fixture-1");
    expect(pinning.consentStateAt("late", "gs-terms-fixture-1", announced, FREE)).toEqual({
      kind: "asked",
      inForceFrom: new Date("2026-11-26T00:00:00Z"),
    });
    expect(
      pinning.consentStateAt("late", "gs-terms-fixture-1", new Date("2026-11-26T00:00:00Z"), FREE),
    ).toEqual({ kind: "restricted" });
  });

  it("does not place a version that has no rollout, though the archive holds it", () => {
    // Archived and not yet scheduled anywhere: nobody has been told when it
    // binds, so it is on no surface, and an agreement naming it is to text no
    // surface asked anybody to accept.
    expect(pinning.archivedVersion("x-terms-fixture-unscheduled")?.document).toBe(
      "project:x:terms",
    );
    expect(pinning.archivedVersion("x-terms-fixture-unscheduled", "early")).toBeNull();
    const now = new Date("2027-01-01T00:00:00Z");
    expect(pinning.versionToRecord("early", now)).toBe("x-terms-fixture-1+gs-terms-fixture-1");
    expect(
      pinning.consentStateAt("early", "x-terms-fixture-unscheduled+gs-terms-fixture-1", now, FREE),
    ).toEqual({ kind: "restricted" });
    expect(pinning.documentsOfConsent("x-terms-fixture-unscheduled")).not.toBeNull();
    expect(pinning.documentsOfConsent("x-terms-fixture-unscheduled", "early")).toBeNull();
    // The whole value, not only that part: as with a version the archive does
    // not hold, a value that names one cannot be read, so the general terms in
    // it are not taken as accepted either. Asked about on `late` while its
    // product terms are only announced, that is restricted and not asked.
    const announcedOnLate = new Date("2026-10-14T00:00:00Z");
    expect(
      pinning.consentStateAt(
        "late",
        "x-terms-fixture-unscheduled+gs-terms-fixture-1",
        announcedOnLate,
        FREE,
      ),
    ).toEqual({ kind: "restricted" });
    expect(pinning.consentStateAt("late", "gs-terms-fixture-1", announcedOnLate, FREE)).toEqual({
      kind: "asked",
      inForceFrom: new Date("2026-11-26T00:00:00Z"),
    });
  });

  it("never pins a notice, which is read and not accepted", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(pinning.versionToRecord("early", now)).not.toContain("privacy");
    expect(pinning.archivedVersion("x-privacy-fixture-1")?.liveUrl.en).toBe(
      "https://gplatform.org/apps/x/privacy",
    );
    expect(pinning.archivedVersion("x-privacy-fixture-1", "early")).toBeNull();
  });
});

describe("asking the rules", () => {
  it("lists the surfaces the snapshot defines, in its order", () => {
    expect(terms.surfaces()).toEqual([
      "gcontrol",
      "gadvisory",
      "gopencdr",
      "gopencnr",
      "gopencsr",
      "gplatform-control",
      "gplatform-billing",
      "gplatform-sso",
      CC,
    ]);
    expect(terms.snapshot.serial).toBe(2);
  });

  it("refuses a surface the snapshot does not define, for staff too", () => {
    expect(() => versionToRecord("gnothing", NOV_21)).toThrow(UnknownSurfaceError);
    expect(() => consentStateAt("gnothing", null, NOV_21, FREE)).toThrow(UnknownSurfaceError);
    expect(() => consentStateAt("gnothing", null, NOV_21, { paid: false, staff: true })).toThrow(
      UnknownSurfaceError,
    );
    expect(() => consentLinks("gnothing", NOV_21)).toThrow(UnknownSurfaceError);
    expect(() => announcementsDue("gnothing", NOV_21)).toThrow(UnknownSurfaceError);
    expect(() => archivedVersion("gs-terms-2026-10-01", "gnothing")).toThrow(UnknownSurfaceError);
  });

  it("refuses a question asked without an instant, rather than reading the clock", () => {
    // gctl-terms defaulted `now` to the present in three places. A caller
    // written against those, still passing nothing, is told so.
    const call = versionToRecord as (surface: string, now?: Date) => string;
    expect(() => call(CC)).toThrow(TypeError);
    expect(() => versionToRecord(CC, "2026-11-21" as unknown as Date)).toThrow(TypeError);
  });

  it("refuses a surface whose general terms are not covered, as a consent line", () => {
    const missing = bind({
      ...GCTL_TERMS_0_1_4,
      surfaces: [{ id: "gcontrol", covers: ["project:gcontrol:terms"], liveLinks: {} }],
    });
    expect(missing.versionToRecord("gcontrol", NOV_21)).toBe("gcontrol-terms-2026-10-01");
    expect(() => missing.consentLinks("gcontrol", NOV_21)).toThrow(UnknownDocumentError);
  });
});
