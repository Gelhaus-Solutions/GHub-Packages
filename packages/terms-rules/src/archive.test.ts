/**
 * The rules asked of the archive `@ghub/gctl-terms` 0.1.4 shipped, converted
 * into a snapshot (see fixtures/gctl-terms-0.1.4.ts).
 *
 * These are that package's archive tests, moved with the rules. Two kinds of
 * test there did not move, because what they checked is no longer in this
 * package: that `src/manifest.ts` quoted `archive/manifest.json` exactly, and
 * that each archived `.md` file hashed to what the manifest recorded. A
 * snapshot carries metadata and hashes, not texts; the texts and their hashes
 * are checked where they are kept, by the server that keeps them.
 *
 * The deprecated `currentConsentVersion` and `needsAgreement` were not
 * ported. Where a test here asked them, it asks what they were defined as:
 * `versionToRecord`, and whether `consentStateAt` restricts a free account.
 */

import { describe, expect, it } from "vitest";
import { bind } from "./consent.js";
import { GCTL_TERMS_0_1_4 } from "./fixtures/gctl-terms-0.1.4.js";
import { earliestInForceAt } from "./notice.js";
import { instantOf, parseSnapshot, placementsOn } from "./snapshot.js";

const SNAPSHOT = parseSnapshot(GCTL_TERMS_0_1_4);
const {
  announcementsDue,
  archivedVersion,
  consentLinks,
  consentStateAt,
  documentsFor,
  documentsOfConsent,
  versionToRecord,
} = bind(SNAPSHOT);

/**
 * The instant the tests of the archive as it stood before its first rollout
 * are asked at. Fixed, never the clock: these tests describe what the archive
 * says before the notice of 2026-10-08, and on the clock they would start
 * failing on that date without anything having gone wrong.
 */
const BEFORE = new Date("2026-10-01T12:00:00Z");

const FREE = { paid: false } as const;
const PAID = { paid: true } as const;

/** What gctl-terms' needsAgreement answered: whether a free account is
 *  restricted. */
const restricted = (surface: string, recorded: string | null, now: Date): boolean =>
  consentStateAt(surface, recorded, now, FREE).kind === "restricted";

const SURFACES = [
  "gcontrol",
  "gadvisory",
  "gopencdr",
  "gopencnr",
  "gopencsr",
  "gplatform-control",
  "gplatform-billing",
  "gplatform-sso",
] as const;

describe("the archive as a snapshot", () => {
  it("is read by parseSnapshot without a refusal, and is the same data", () => {
    expect(SNAPSHOT).toEqual(GCTL_TERMS_0_1_4);
    expect(SNAPSHOT.surfaces.map((surface) => surface.id)).toEqual(SURFACES);
  });

  it("gives every version a distinct identifier", () => {
    const ids = SNAPSHOT.versions.map((version) => version.versionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(15);
  });

  it("records a full sha256 for each version", () => {
    for (const version of SNAPSHOT.versions) {
      expect(version.contentHash, version.versionId).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("when each version binds", () => {
  it("names the zone of every date-time, as the instant 0.1.4 meant", () => {
    // 0.1.4 wrote the publisher's freeze times without a zone and read them as
    // UTC. The snapshot says so, with Z, and a value without one is refused.
    const instants = [
      SNAPSHOT.generatedAt,
      ...SNAPSHOT.versions.map((version) => version.frozenAt),
      ...SNAPSHOT.rollouts.flatMap((rollout) => [rollout.announcedAt, rollout.inForceFrom]),
    ];
    for (const value of instants) {
      expect(value).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
      expect(instantOf(value), value).not.toBeNull();
    }
    expect(archivedVersion("gs-terms-2026-09-06")?.frozenAt).toBe("2026-09-06T18:40:41Z");
    expect(new Date(instantOf("2026-09-06T18:40:41Z") ?? Number.NaN).toISOString()).toBe(
      "2026-09-06T18:40:41.000Z",
    );
    expect(new Date(instantOf("2026-11-15T00:00:00+01:00") ?? Number.NaN).toISOString()).toBe(
      "2026-11-14T23:00:00.000Z",
    );
    expect(instantOf("2026-09-06 18:40:41")).toBeNull();
    expect(instantOf("6 September 2026")).toBeNull();
  });

  it("binds the versions archived before notice existed from their freeze time, as before", () => {
    // These were in force the moment they were frozen, and agreements were
    // recorded against them on that footing. Moving either date now would
    // restrict or release people retroactively.
    const original = [
      ["gcontrol-terms-2026-09-06", "gcontrol"],
      ["gadvisory-terms-2026-09-06", "gadvisory"],
      ["gs-terms-2026-09-06", "gcontrol"],
      ["gopencdr-terms-2026-09-27", "gopencdr"],
      ["gopencdr-acceptable-use-2026-09-27", "gopencdr"],
    ] as const;
    for (const [id, surface] of original) {
      const version = archivedVersion(id, surface);
      expect(version?.rollout.announcedAt, id).toBe(version?.frozenAt);
      expect(version?.rollout.inForceFrom, id).toBe(version?.frozenAt);
    }
  });

  it("announces every version no later than it comes into force", () => {
    for (const rollout of SNAPSHOT.rollouts) {
      expect(instantOf(rollout.announcedAt), rollout.versionId).toBeLessThanOrEqual(
        instantOf(rollout.inForceFrom) ?? Number.NaN,
      );
    }
  });

  it("never brings two versions of one document into force at the same instant on a surface", () => {
    // Which one is in force would otherwise come down to where each sits in
    // the array, which is exactly what the dates are there to replace.
    for (const surface of SNAPSHOT.surfaces) {
      for (const [document, placed] of placementsOn(SNAPSHOT, surface)) {
        const instants = placed.map((entry) => entry.inForce);
        expect(new Set(instants).size, `${surface.id} ${document}`).toBe(instants.length);
      }
    }
  });

  it("gives six weeks and a day of notice of every version that supersedes another", () => {
    for (const surface of SNAPSHOT.surfaces) {
      for (const placed of placementsOn(SNAPSHOT, surface).values()) {
        for (const entry of placed.slice(1)) {
          expect(entry.inForce, entry.version.versionId).toBeGreaterThanOrEqual(
            earliestInForceAt(entry.announced),
          );
        }
      }
    }
  });

  it("states a summary in both languages wherever it states one", () => {
    for (const rollout of SNAPSHOT.rollouts) {
      if (rollout.summary === undefined) continue;
      expect(rollout.summary.en.trim(), rollout.versionId).not.toBe("");
      expect(rollout.summary.de.trim(), rollout.versionId).not.toBe("");
    }
  });
});

describe("what an agreement covers", () => {
  it("names the product terms and the general terms, product first", () => {
    expect(documentsFor("gcontrol", BEFORE).map((d) => d.document)).toEqual([
      "project:gcontrol:terms",
      "page:gs:terms",
    ]);
    expect(documentsFor("gadvisory", BEFORE).map((d) => d.document)).toEqual([
      "project:gadvisory:terms",
      "page:gs:terms",
    ]);
  });

  it("records both versions in the stored identifier", () => {
    // The liability clause lives in the general terms and is incorporated by
    // reference. A stored value naming only the product document could not tell
    // you which liability text somebody accepted.
    expect(versionToRecord("gcontrol", BEFORE)).toBe(
      "gcontrol-terms-2026-09-06+gs-terms-2026-09-06",
    );
    expect(versionToRecord("gadvisory", BEFORE)).toBe(
      "gadvisory-terms-2026-09-06+gs-terms-2026-09-06",
    );
  });

  it("asks again when nothing was recorded", () => {
    expect(restricted("gcontrol", null, BEFORE)).toBe(true);
  });

  it("does not ask again for the current version", () => {
    expect(consentStateAt("gcontrol", versionToRecord("gcontrol", BEFORE), BEFORE, FREE)).toEqual({
      kind: "agreed",
    });
  });

  it("covers the general terms alone where the product terms are not archived", () => {
    // Not a claim that no product terms govern GPlatform Control. They exist
    // and are live; they are simply not archived, so there is nothing to hash.
    expect(documentsFor("gplatform-control", BEFORE).map((d) => d.document)).toEqual([
      "page:gs:terms",
    ]);
    expect(versionToRecord("gplatform-control", BEFORE)).toBe("gs-terms-2026-09-06");
  });

  it("still offers the unpinned product terms as a link", () => {
    // Shown but not pinned. Hiding a document because its text cannot be proved
    // would be the worse half of the tradeoff: the person agreeing would not
    // see something that governs them.
    const control = consentLinks("gplatform-control", BEFORE);
    expect(control.product).toBeNull();
    expect(control.unpinnedProductUrl).toBe("https://gplatform.org/apps/gplatform-control/terms");
    expect(control.general.versionId).toBe("gs-terms-2026-09-06");
  });

  it("pins the product terms where they are archived, with nothing unpinned", () => {
    const gcontrol = consentLinks("gcontrol", BEFORE);
    expect(gcontrol.product?.document).toBe("project:gcontrol:terms");
    expect(gcontrol.policies).toEqual([]);
    expect(gcontrol.unpinnedProductUrl).toBeNull();
  });

  it("covers GOpenCDR's acceptable use policy with its terms, in the recorded order", () => {
    // Its terms are read together with the policy, which defines the DNS abuse
    // a name is suspended for. Pinning the terms alone would let that definition
    // move under somebody who agreed to the old one.
    expect(documentsFor("gopencdr", BEFORE).map((d) => d.document)).toEqual([
      "project:gopencdr:terms",
      "project:gopencdr:acceptable-use",
      "page:gs:terms",
    ]);
    expect(versionToRecord("gopencdr", BEFORE)).toBe(
      "gopencdr-terms-2026-09-27+gopencdr-acceptable-use-2026-09-27+gs-terms-2026-09-06",
    );
  });

  it("hands a consent line the policy to show beside the terms", () => {
    const gopencdr = consentLinks("gopencdr", BEFORE);
    expect(gopencdr.product?.versionId).toBe("gopencdr-terms-2026-09-27");
    expect(gopencdr.policies.map((d) => d.versionId)).toEqual([
      "gopencdr-acceptable-use-2026-09-27",
    ]);
    expect(gopencdr.general.versionId).toBe("gs-terms-2026-09-06");
    expect(gopencdr.unpinnedProductUrl).toBeNull();
  });

  it("asks again when only the policy has moved on", () => {
    expect(
      restricted(
        "gopencdr",
        "gopencdr-terms-2026-09-27+gopencdr-acceptable-use-2020-01-01+gs-terms-2026-09-06",
        BEFORE,
      ),
    ).toBe(true);
    // An agreement to the terms and the general terms alone, as a two-document
    // identifier would have recorded it, is not an agreement to the policy.
    expect(restricted("gopencdr", "gopencdr-terms-2026-09-27+gs-terms-2026-09-06", BEFORE)).toBe(
      true,
    );
    expect(restricted("gopencdr", versionToRecord("gopencdr", BEFORE), BEFORE)).toBe(false);
  });

  it("links GOpenCSR's terms and acceptable use policy and pins only the general terms", () => {
    // Both GOpenCSR documents are live and govern a sign-up, but neither is
    // archived yet, so they are shown and not recorded, as the GPlatform
    // product terms are.
    expect(documentsFor("gopencsr", BEFORE).map((d) => d.document)).toEqual(["page:gs:terms"]);
    expect(versionToRecord("gopencsr", BEFORE)).toBe("gs-terms-2026-09-06");
    const gopencsr = consentLinks("gopencsr", BEFORE);
    expect(gopencsr.product).toBeNull();
    expect(gopencsr.unpinnedProductUrl).toBe("https://gplatform.org/apps/gopencsr/terms");
    expect(gopencsr.policies).toEqual([]);
    expect(gopencsr.unpinnedPolicyUrls).toEqual([
      "https://gplatform.org/apps/gopencsr/acceptable-use",
    ]);
    expect(gopencsr.general.versionId).toBe("gs-terms-2026-09-06");
  });

  it("links GOpenCNR's terms and acceptable use policy and pins only the general terms", () => {
    // Shown and not recorded until a version of them is archived,
    // exactly as GOpenCSR's.
    expect(documentsFor("gopencnr", BEFORE).map((d) => d.document)).toEqual(["page:gs:terms"]);
    expect(versionToRecord("gopencnr", BEFORE)).toBe("gs-terms-2026-09-06");
    const gopencnr = consentLinks("gopencnr", BEFORE);
    expect(gopencnr.product).toBeNull();
    expect(gopencnr.unpinnedProductUrl).toBe("https://gplatform.org/apps/gopencnr/terms");
    expect(gopencnr.policies).toEqual([]);
    expect(gopencnr.unpinnedPolicyUrls).toEqual([
      "https://gplatform.org/apps/gopencnr/acceptable-use",
    ]);
    expect(gopencnr.general.versionId).toBe("gs-terms-2026-09-06");
    // An agreement recorded against GOpenCDR's documents is not one to these.
    const now = BEFORE;
    expect(consentStateAt("gopencnr", "gs-terms-2026-09-06", now, FREE)).toEqual({
      kind: "agreed",
    });
    expect(consentStateAt("gopencnr", versionToRecord("gopencdr", BEFORE), now, FREE)).toEqual({
      kind: "restricted",
    });
  });

  it("links GPlatform SSO's terms and pins only the general terms", () => {
    expect(documentsFor("gplatform-sso", BEFORE).map((d) => d.document)).toEqual(["page:gs:terms"]);
    expect(versionToRecord("gplatform-sso", BEFORE)).toBe("gs-terms-2026-09-06");
    const sso = consentLinks("gplatform-sso", BEFORE);
    expect(sso.product).toBeNull();
    expect(sso.unpinnedProductUrl).toBe("https://gplatform.org/apps/gplatform-sso/terms");
    expect(sso.unpinnedPolicyUrls).toEqual([]);
  });

  it("resolves every surface, with the general terms pinned on each", () => {
    for (const surface of SURFACES) {
      expect(consentLinks(surface, BEFORE).general.document, surface).toBe("page:gs:terms");
      expect(versionToRecord(surface, BEFORE).endsWith("gs-terms-2026-09-06"), surface).toBe(true);
    }
    // The surfaces that existed before keep exactly the links they had.
    expect(consentLinks("gopencdr", BEFORE).unpinnedPolicyUrls).toEqual([]);
    expect(consentLinks("gplatform-billing", BEFORE).unpinnedPolicyUrls).toEqual([]);
  });

  it("asks again when either document has moved on", () => {
    // Superseded product document, current general terms.
    expect(restricted("gcontrol", "gcontrol-terms-2020-01-01+gs-terms-2026-09-06", BEFORE)).toBe(
      true,
    );
    // Current product document, superseded general terms. This is the case a
    // product-only identifier would have missed.
    expect(restricted("gcontrol", "gcontrol-terms-2026-09-06+gs-terms-2020-01-01", BEFORE)).toBe(
      true,
    );
  });
});

describe("resolving what somebody previously agreed to", () => {
  it("resolves a current consent back into both its documents", () => {
    const resolved = documentsOfConsent(versionToRecord("gcontrol", BEFORE));
    expect(resolved?.map((d) => d.document)).toEqual(["project:gcontrol:terms", "page:gs:terms"]);
  });

  it("hands back the frozen copy, which is the whole point of keeping one", () => {
    const [product] = documentsOfConsent(versionToRecord("gcontrol", BEFORE)) ?? [];
    expect(product?.archiveUrl.en).toBe("https://gplatform.org/legal/gcontrol-terms-2026-09-06");
    expect(product?.archiveUrl.de).toBe("https://gplatform.org/de/legal/gcontrol-terms-2026-09-06");
    // Not the live URL: what somebody agreed to is the version that cannot
    // change, and linking the mutable page here would answer the wrong
    // question with something that looks like an answer.
    expect(product?.archiveUrl.en).not.toBe(product?.liveUrl.en);
    expect(product?.liveUrl.en).toBe("https://gplatform.org/apps/gcontrol/terms");
  });

  it("resolves a three-document consent, as GOpenCDR records", () => {
    const resolved = documentsOfConsent(versionToRecord("gopencdr", BEFORE));
    expect(resolved?.map((d) => d.archiveUrl.en)).toEqual([
      "https://gplatform.org/legal/gopencdr-terms-2026-09-27",
      "https://gplatform.org/legal/gopencdr-acceptable-use-2026-09-27",
      "https://gplatform.org/legal/gs-terms-2026-09-06",
    ]);
  });

  it("resolves a single-document consent, as the GPlatform surfaces record", () => {
    const resolved = documentsOfConsent(versionToRecord("gplatform-billing", BEFORE));
    expect(resolved?.map((d) => d.versionId)).toEqual(["gs-terms-2026-09-06"]);
  });

  it("returns null for an agreement made before the column existed", () => {
    expect(documentsOfConsent(null)).toBeNull();
  });

  it("returns null for a version this archive does not hold", () => {
    // Not an error. An agreement to text published before the archive began is
    // a real state, and the screen shows nothing rather than guessing.
    expect(documentsOfConsent("gcontrol-terms-2020-01-01+gs-terms-2020-01-01")).toBeNull();
  });

  it("returns null when only part of a consent can be resolved", () => {
    // Half of what somebody agreed to, presented as the whole, is worse than
    // none of it.
    expect(documentsOfConsent("gcontrol-terms-2026-09-06+gs-terms-2020-01-01")).toBeNull();
  });

  it("looks a single version up by id", () => {
    expect(archivedVersion("gs-terms-2026-09-06")?.document).toBe("page:gs:terms");
    expect(archivedVersion("nothing-like-this")).toBeNull();
  });

  it("gives the dates a version has on a surface only when asked for that surface", () => {
    // A version's dates are its rollout's, and a rollout belongs to a surface.
    expect(archivedVersion("gs-terms-2026-10-01")).not.toHaveProperty("rollout");
    expect(archivedVersion("gs-terms-2026-10-01", "gadvisory")?.rollout.inForceFrom).toBe(
      "2026-11-20T00:00:00+01:00",
    );
    const resolved = documentsOfConsent(
      "gadvisory-terms-2026-10-01+gs-terms-2026-10-01",
      "gadvisory",
    );
    expect(resolved?.map((d) => [d.surface, d.rollout.announcedAt])).toEqual([
      ["gadvisory", "2026-10-08T00:00:00+02:00"],
      ["gadvisory", "2026-10-08T00:00:00+02:00"],
    ]);
    // GControl's terms have no place on GAdvisory, so there is no date to give.
    expect(archivedVersion("gcontrol-terms-2026-10-01", "gadvisory")).toBeNull();
    expect(
      documentsOfConsent("gcontrol-terms-2026-10-01+gs-terms-2026-10-01", "gadvisory"),
    ).toBeNull();
  });
});

describe("the first rollout, replacing the general terms of 2026-09-06", () => {
  /** 8 October 2026, 00:00 in Berlin: the day before the first notice mails. */
  const ANNOUNCED = new Date("2026-10-07T22:00:00Z");
  /** 20 November 2026, 00:00 in Berlin. */
  const IN_FORCE = new Date("2026-11-19T23:00:00Z");
  const before = (instant: Date): Date => new Date(instant.getTime() - 1);

  const ROLLOUT = [
    "gs-terms-2026-10-01",
    "gcontrol-terms-2026-10-01",
    "gadvisory-terms-2026-10-01",
    "gopencdr-terms-2026-10-01",
    "gopencsr-terms-2026-10-01.2",
    "gopencsr-acceptable-use-2026-10-01.2",
    "gopencnr-terms-2026-10-01",
    "gopencnr-acceptable-use-2026-10-01",
    "gplatform-control-terms-2026-10-01",
    "gplatform-sso-terms-2026-10-01",
  ];

  /** Every surface each version is placed on, with the version as placed there. */
  const placed = (id: string) =>
    SURFACES.flatMap((surface) => {
      const version = archivedVersion(id, surface);
      return version === null ? [] : [version];
    });

  it("announces every version on 8 October and brings it into force on 20 November", () => {
    // A day more than six weeks, because the daily notice job may send a day
    // after the announcement and the six weeks run from the mail.
    for (const id of ROLLOUT) {
      expect(archivedVersion(id), id).not.toBeNull();
      const onSurfaces = placed(id);
      expect(onSurfaces.length, id).toBeGreaterThan(0);
      for (const version of onSurfaces) {
        const where = `${id} on ${version.surface}`;
        expect(new Date(version.rollout.announcedAt).toISOString(), where).toBe(
          ANNOUNCED.toISOString(),
        );
        expect(new Date(version.rollout.inForceFrom).toISOString(), where).toBe(
          IN_FORCE.toISOString(),
        );
      }
    }
    expect(IN_FORCE.getTime()).toBeGreaterThanOrEqual(earliestInForceAt(ANNOUNCED.getTime()));
  });

  it("says what changes in every notice, and that the person may object", () => {
    // The version it replaces promised both, so every document announced in
    // this rollout carries them, not only the general terms.
    for (const id of ROLLOUT) {
      for (const version of placed(id)) {
        const summary = version.rollout.summary;
        expect(summary, id).toBeDefined();
        expect(summary?.en, id).toContain("contact@gplatform.org");
        expect(summary?.de, id).toContain("contact@gplatform.org");
      }
    }
  });

  it("changes nothing before the notice", () => {
    const now = before(ANNOUNCED);
    expect(versionToRecord("gcontrol", now)).toBe("gcontrol-terms-2026-09-06+gs-terms-2026-09-06");
    expect(versionToRecord("gplatform-control", now)).toBe("gs-terms-2026-09-06");
    expect(versionToRecord("gopencsr", now)).toBe("gs-terms-2026-09-06");
    expect(consentLinks("gplatform-control", now).unpinnedProductUrl).toBe(
      "https://gplatform.org/apps/gplatform-control/terms",
    );
    for (const surface of ["gcontrol", "gadvisory", "gopencdr", "gplatform-control"] as const) {
      expect(announcementsDue(surface, now), surface).toEqual([]);
    }
  });

  it("asks an account on the old versions from the notice, with full use until 20 November", () => {
    const old = "gcontrol-terms-2026-09-06+gs-terms-2026-09-06";
    expect(versionToRecord("gcontrol", ANNOUNCED)).toBe(
      "gcontrol-terms-2026-10-01+gs-terms-2026-10-01",
    );
    expect(consentStateAt("gcontrol", old, ANNOUNCED, FREE)).toEqual({
      kind: "asked",
      inForceFrom: IN_FORCE,
    });
    expect(consentStateAt("gcontrol", old, IN_FORCE, FREE)).toEqual({ kind: "restricted" });
    expect(consentStateAt("gcontrol", old, IN_FORCE, PAID)).toEqual({ kind: "owed-paid" });
    // GOpenCDR's acceptable use policy did not change, so its old version stays.
    expect(versionToRecord("gopencdr", ANNOUNCED)).toBe(
      "gopencdr-terms-2026-10-01+gopencdr-acceptable-use-2026-09-27+gs-terms-2026-10-01",
    );
  });

  it("gives notice of each new version, product first, and none once in force", () => {
    expect(announcementsDue("gcontrol", ANNOUNCED).map((a) => a.versionId)).toEqual([
      "gcontrol-terms-2026-10-01",
      "gs-terms-2026-10-01",
    ]);
    expect(announcementsDue("gcontrol", IN_FORCE)).toEqual([]);
  });

  it("pins a product document from the notice of its first archived version, and asks first", () => {
    const control = consentLinks("gplatform-control", ANNOUNCED);
    expect(control.product?.versionId).toBe("gplatform-control-terms-2026-10-01");
    expect(control.unpinnedProductUrl).toBeNull();
    expect(versionToRecord("gplatform-control", ANNOUNCED)).toBe(
      "gplatform-control-terms-2026-10-01+gs-terms-2026-10-01",
    );
    // An account that agreed when only the general terms were pinned is asked
    // for the six weeks, never restricted on the day its product terms are
    // first pinned.
    const old = "gs-terms-2026-09-06";
    expect(consentStateAt("gplatform-control", old, ANNOUNCED, FREE)).toEqual({
      kind: "asked",
      inForceFrom: IN_FORCE,
    });
    expect(consentStateAt("gplatform-control", old, IN_FORCE, FREE)).toEqual({
      kind: "restricted",
    });
    expect(consentStateAt("gplatform-control", old, IN_FORCE, PAID)).toEqual({
      kind: "owed-paid",
    });
  });

  it("pins GOpenCSR's and GOpenCNR's terms and policies, and GPlatform SSO's terms", () => {
    expect(versionToRecord("gopencsr", ANNOUNCED)).toBe(
      "gopencsr-terms-2026-10-01.2+gopencsr-acceptable-use-2026-10-01.2+gs-terms-2026-10-01",
    );
    expect(versionToRecord("gopencnr", ANNOUNCED)).toBe(
      "gopencnr-terms-2026-10-01+gopencnr-acceptable-use-2026-10-01+gs-terms-2026-10-01",
    );
    expect(versionToRecord("gplatform-sso", ANNOUNCED)).toBe(
      "gplatform-sso-terms-2026-10-01+gs-terms-2026-10-01",
    );
    for (const surface of ["gopencsr", "gopencnr", "gplatform-sso"] as const) {
      const links = consentLinks(surface, ANNOUNCED);
      expect(links.unpinnedProductUrl, surface).toBeNull();
      expect(links.unpinnedPolicyUrls, surface).toEqual([]);
    }
  });

  it("leaves GPlatform Billing's terms linked and unpinned, with the new general terms", () => {
    expect(versionToRecord("gplatform-billing", IN_FORCE)).toBe("gs-terms-2026-10-01");
    expect(consentLinks("gplatform-billing", IN_FORCE).unpinnedProductUrl).toBe(
      "https://gplatform.org/apps/gplatform-billing/terms",
    );
  });
});
