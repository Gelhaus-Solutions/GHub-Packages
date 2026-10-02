/**
 * What parseSnapshot refuses, and that it refuses the whole snapshot with the
 * field named rather than using the rest of it.
 *
 * Each case starts from one valid snapshot and breaks one thing, so a refusal
 * here is about that thing and nothing else.
 */

import { describe, expect, it } from "vitest";
import { bind } from "./consent.js";
import { GCTL_TERMS_0_1_4 } from "./fixtures/gctl-terms-0.1.4.js";
import { parseSnapshot, SnapshotError, type Snapshot } from "./snapshot.js";

const version = (document: string, versionId: string) => ({
  versionId,
  document,
  version: versionId.slice(-10),
  title: { en: "Terms", de: "Nutzungsbedingungen" },
  contentHash: "a".repeat(64),
  archiveUrl: {
    en: `https://gplatform.org/legal/${versionId}`,
    de: `https://gplatform.org/de/legal/${versionId}`,
  },
  frozenAt: "2026-09-06T18:40:41Z",
});

/** Announced 8 October and in force 20 November, Berlin: six weeks and a day
 *  and an hour, as the first rollout was. */
const ANNOUNCED = "2026-10-08T00:00:00+02:00";
const IN_FORCE = "2026-11-20T00:00:00+01:00";

const BASE: Snapshot = {
  format: 1,
  serial: 3,
  generatedAt: "2026-10-01T16:01:29Z",
  documents: [
    {
      key: "page:gs:terms",
      product: "gs",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/terms", de: "https://gplatform.org/de/terms" },
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
    version("page:gs:terms", "gs-terms-2026-09-06"),
    version("page:gs:terms", "gs-terms-2026-10-01"),
    version("project:x:privacy", "x-privacy-2026-10-01"),
  ],
  surfaces: [
    {
      id: "x",
      covers: ["project:x:terms", "page:gs:terms"],
      liveLinks: { "project:x:terms": "https://gplatform.org/apps/x/terms" },
    },
    { id: "y", covers: ["page:gs:terms"], liveLinks: {} },
  ],
  rollouts: [
    {
      versionId: "gs-terms-2026-09-06",
      surface: null,
      announcedAt: "2026-09-06T18:40:41Z",
      inForceFrom: "2026-09-06T18:40:41Z",
    },
    {
      versionId: "gs-terms-2026-10-01",
      surface: null,
      announcedAt: ANNOUNCED,
      inForceFrom: IN_FORCE,
      summary: { en: "What changes.", de: "Was sich ändert." },
    },
    {
      versionId: "x-privacy-2026-10-01",
      surface: null,
      announcedAt: ANNOUNCED,
      inForceFrom: ANNOUNCED,
    },
  ],
};

/** BASE with one thing changed. Typed loosely on purpose: the point is to
 *  build what the types would not allow. */
function broken(change: (snapshot: any) => void): unknown {
  const copy: any = structuredClone(BASE);
  change(copy);
  return copy;
}

function refusal(json: unknown): string {
  try {
    parseSnapshot(json);
  } catch (error) {
    expect(error).toBeInstanceOf(SnapshotError);
    return (error as Error).message;
  }
  throw new Error("parseSnapshot accepted it");
}

describe("parseSnapshot accepts", () => {
  it("a valid snapshot, as a frozen copy equal to what it was given", () => {
    const parsed = parseSnapshot(BASE);
    expect(parsed).toEqual(BASE);
    expect(parsed).not.toBe(BASE);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.rollouts[1])).toBe(true);
    expect(Object.isFrozen(parsed.rollouts[1]?.summary)).toBe(true);
    expect(Object.isFrozen(parsed.surfaces[0]?.liveLinks)).toBe(true);
  });

  it("the same snapshot after a trip through JSON", () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(GCTL_TERMS_0_1_4)))).toEqual(GCTL_TERMS_0_1_4);
  });

  it("the first version of a document with no notice period", () => {
    // The first version on a surface supersedes nothing, so it binds when it
    // is announced, as the versions archived before notice existed did.
    expect(BASE.rollouts[0]?.announcedAt).toBe(BASE.rollouts[0]?.inForceFrom);
    expect(() => parseSnapshot(BASE)).not.toThrow();
  });

  it("exactly six weeks and a day of notice, at the same Berlin clock time", () => {
    // 8 October, 00:00 CEST to 20 November, 00:00 CET: 43 days and an hour,
    // because the clocks go back in between, and the later of the two
    // readings of six weeks and a day.
    expect(() => parseSnapshot(BASE)).not.toThrow();
    expect(IN_FORCE).toBe("2026-11-20T00:00:00+01:00");
  });

  it("instants with an offset, with Z, without seconds and with fractions", () => {
    for (const value of [
      "2026-10-08T00:00:00+02:00",
      "2026-10-07T22:00:00Z",
      "2026-10-08T00:00+02:00",
      "2026-10-07T22:00:00.000Z",
      "2026-10-07T22:00:00.000000001Z",
    ]) {
      expect(() =>
        parseSnapshot(
          broken((s) => {
            s.generatedAt = value;
          }),
        ),
      ).not.toThrow();
    }
  });

  it("a rollout for a surface that does not cover the document, which it ignores", () => {
    // What a surface covers can change between snapshots; a rollout is history
    // that outlives it, so it is kept and used nowhere.
    const snapshot = parseSnapshot(
      broken((s) => {
        s.rollouts.push({
          versionId: "gs-terms-2026-10-01",
          surface: "x",
          announcedAt: ANNOUNCED,
          inForceFrom: IN_FORCE,
        });
        s.surfaces[0].covers = ["project:x:terms"];
      }),
    );
    expect(bind(snapshot).versionToRecord("y", new Date("2026-12-01T00:00:00Z"))).toBe(
      "gs-terms-2026-10-01",
    );
  });
});

describe("parseSnapshot refuses", () => {
  it("an instant without a zone, rather than reading it as UTC", () => {
    for (const value of ["2026-10-08 00:00:00", "2026-10-08T00:00:00", "2026-10-08"]) {
      expect(
        refusal(
          broken((s) => {
            s.rollouts[1].announcedAt = value;
          }),
        ),
      ).toMatch(/^snapshot\.rollouts\[1\]\.announcedAt .*has no zone/);
    }
    expect(
      refusal(
        broken((s) => {
          s.versions[0].frozenAt = "2026-09-06 18:40:41";
        }),
      ),
    ).toMatch(/snapshot\.versions\[0\]\.frozenAt .*has no zone/);
    expect(
      refusal(
        broken((s) => {
          s.generatedAt = "2026-10-01T16:01:29";
        }),
      ),
    ).toMatch(/has no zone/);
  });

  it("a date-time that does not exist, rather than moving it to one that does", () => {
    for (const value of [
      "2026-02-29T00:00:00Z",
      "2026-04-31T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2026-10-08T24:00:00Z",
      "2026-10-08T23:60:00Z",
      "2026-10-08T23:59:60Z",
      "2026-10-08T00:00:00+24:00",
      "2026-10-08T00:00:00z",
      "8 October 2026",
    ]) {
      expect(
        refusal(
          broken((s) => {
            s.rollouts[1].announcedAt = value;
          }),
        ),
        value,
      ).toMatch(/is not a real date-time with a zone/);
    }
    // A leap day that exists is a date like any other.
    expect(() =>
      parseSnapshot(
        broken((s) => {
          s.generatedAt = "2028-02-29T00:00:00Z";
        }),
      ),
    ).not.toThrow();
  });

  it("two versions with one id", () => {
    expect(
      refusal(
        broken((s) => {
          s.versions[1].versionId = "gs-terms-2026-09-06";
        }),
      ),
    ).toMatch(/^snapshot\.versions\[1\]\.versionId repeats "gs-terms-2026-09-06"/);
  });

  it("a version of a document the snapshot does not hold", () => {
    expect(
      refusal(
        broken((s) => {
          s.versions[0].document = "page:gs:nothing";
        }),
      ),
    ).toMatch(/^snapshot\.versions\[0\]\.document names "page:gs:nothing"/);
  });

  it("a rollout of a version the snapshot does not hold", () => {
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].versionId = "gs-terms-2099-01-01";
        }),
      ),
    ).toMatch(/^snapshot\.rollouts\[1\]\.versionId names "gs-terms-2099-01-01"/);
  });

  it("a rollout for a surface the snapshot does not define", () => {
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].surface = "gnothing";
        }),
      ),
    ).toMatch(/^snapshot\.rollouts\[1\]\.surface names "gnothing"/);
  });

  it("two rollouts of one version on one surface, or two defaults", () => {
    const second = {
      versionId: "gs-terms-2026-10-01",
      surface: "y",
      announcedAt: ANNOUNCED,
      inForceFrom: IN_FORCE,
    };
    expect(
      refusal(
        broken((s) => {
          s.rollouts.push(second, { ...second });
        }),
      ),
    ).toMatch(/^snapshot\.rollouts\[4\] is a second rollout of "gs-terms-2026-10-01" on "y"/);
    expect(
      refusal(
        broken((s) => {
          s.rollouts.push({ ...second, surface: null });
        }),
      ),
    ).toMatch(/is a second rollout of "gs-terms-2026-10-01" by default/);
  });

  it("a surface covering a document the snapshot does not hold", () => {
    expect(
      refusal(
        broken((s) => {
          s.surfaces[1].covers = ["project:y:terms", "page:gs:terms"];
        }),
      ),
    ).toMatch(/^snapshot\.surfaces\[1\]\.covers\[0\] names "project:y:terms"/);
  });

  it("a surface covering a notice, which is read and never accepted", () => {
    expect(
      refusal(
        broken((s) => {
          s.surfaces[0].covers = ["project:x:terms", "project:x:privacy", "page:gs:terms"];
        }),
      ),
    ).toMatch(/^snapshot\.surfaces\[0\]\.covers\[1\] names "project:x:privacy", a notice/);
  });

  it("a surface covering one document twice, or nothing", () => {
    expect(
      refusal(
        broken((s) => {
          s.surfaces[1].covers = ["page:gs:terms", "page:gs:terms"];
        }),
      ),
    ).toMatch(/covers\[1\] names "page:gs:terms" a second time/);
    expect(
      refusal(
        broken((s) => {
          s.surfaces[1].covers = [];
        }),
      ),
    ).toMatch(/^snapshot\.surfaces\[1\]\.covers is empty/);
  });

  it("two versions of one document coming into force at the same instant on a surface", () => {
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].announcedAt = "2026-09-06T18:40:41Z";
          s.rollouts[1].inForceFrom = "2026-09-06T20:40:41+02:00";
        }),
      ),
    ).toMatch(
      /"gs-terms-2026-10-01" on "x" comes into force at the same instant as "gs-terms-2026-09-06"/,
    );
    // The same through a rollout for one surface alone: refused there.
    expect(
      refusal(
        broken((s) => {
          s.rollouts.push({
            versionId: "gs-terms-2026-10-01",
            surface: "y",
            announcedAt: "2026-09-06T18:40:41Z",
            inForceFrom: "2026-09-06T18:40:41Z",
          });
        }),
      ),
    ).toMatch(/"gs-terms-2026-10-01" on "y" comes into force at the same instant/);
  });

  it("a superseding version with less than six weeks and a day of notice", () => {
    // 42 days, which gctl-terms' archive test allowed and its rollout did not.
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].inForceFrom = "2026-11-18T23:00:00+01:00";
        }),
      ),
    ).toMatch(
      /"gs-terms-2026-10-01" on "x" supersedes "gs-terms-2026-09-06" .*six weeks and a day/,
    );
    // One minute short of 43 days.
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].inForceFrom = "2026-11-19T22:59:00+01:00";
        }),
      ),
    ).toMatch(/six weeks and a day/);
    // 43 full days, and an hour early on the clock: across the autumn change
    // the clock reading is the later one, so it decides.
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].inForceFrom = "2026-11-19T23:00:00+01:00";
        }),
      ),
    ).toMatch(/the earliest is 2026-11-19T23:00:00\.000Z/);
    // On one surface only, through that surface's own rollout.
    expect(
      refusal(
        broken((s) => {
          s.rollouts.push({
            versionId: "gs-terms-2026-10-01",
            surface: "y",
            announcedAt: "2026-10-14T09:00:00+02:00",
            inForceFrom: "2026-11-20T00:00:00+01:00",
          });
        }),
      ),
    ).toMatch(/"gs-terms-2026-10-01" on "y" supersedes/);
  });

  it("a rollout in force before it is announced", () => {
    expect(
      refusal(
        broken((s) => {
          s.rollouts[0].inForceFrom = "2026-09-06T18:40:40Z";
        }),
      ),
    ).toMatch(/^snapshot\.rollouts\[0\]\.inForceFrom is before announcedAt/);
  });

  it("a field format 1 does not define, so a misspelt one cannot vanish", () => {
    expect(
      refusal(
        broken((s) => {
          s.rollouts[1].sumary = s.rollouts[1].summary;
          delete s.rollouts[1].summary;
        }),
      ),
    ).toMatch(/^snapshot\.rollouts\[1\]\.sumary is not a field of snapshot format 1/);
    expect(
      refusal(
        broken((s) => {
          s.extra = true;
        }),
      ),
    ).toMatch(/^snapshot\.extra is not a field/);
  });

  it("a missing field", () => {
    expect(
      refusal(
        broken((s) => {
          delete s.versions[0].title;
        }),
      ),
    ).toMatch(/^snapshot\.versions\[0\]\.title is missing/);
    expect(
      refusal(
        broken((s) => {
          delete s.versions[0].title.de;
        }),
      ),
    ).toMatch(/^snapshot\.versions\[0\]\.title\.de is missing/);
  });

  it("a format this release does not read", () => {
    expect(
      refusal(
        broken((s) => {
          s.format = 2;
        }),
      ),
    ).toMatch(/^snapshot\.format is number 2\. This release reads format 1 only/);
  });

  it("malformed fields, each named", () => {
    const cases: [string, (s: any) => void, RegExp][] = [
      ["serial", (s) => (s.serial = -1), /^snapshot\.serial should be a whole number/],
      ["serial", (s) => (s.serial = 1.5), /^snapshot\.serial should be a whole number/],
      [
        "kind",
        (s) => (s.documents[0].kind = "policy"),
        /documents\[0\]\.kind should be "consent" or "notice"/,
      ],
      [
        "liveUrl",
        (s) => (s.documents[0].liveUrl.en = "terms"),
        /documents\[0\]\.liveUrl\.en should be an absolute URL/,
      ],
      [
        "archiveUrl",
        (s) => (s.versions[0].archiveUrl.de = "ftp://x/y"),
        /archiveUrl\.de should be a web address/,
      ],
      [
        "contentHash",
        (s) => (s.versions[0].contentHash = "A".repeat(64)),
        /contentHash should be a sha256/,
      ],
      [
        "contentHash",
        (s) => (s.versions[0].contentHash = "a".repeat(63)),
        /contentHash should be a sha256/,
      ],
      ["versionId", (s) => (s.versions[0].versionId = "gs+terms"), /versionId contains "\+"/],
      [
        "versionId",
        (s) => (s.versions[0].versionId = "gs terms"),
        /versionId should be printable ASCII without spaces/,
      ],
      ["title", (s) => (s.versions[0].title.en = "  "), /title\.en is empty/],
      ["summary", (s) => (s.rollouts[1].summary.de = ""), /summary\.de is empty/],
      [
        "surface",
        (s) => (s.rollouts[1].surface = 3),
        /rollouts\[1\]\.surface should be a surface id or null/,
      ],
      ["covers", (s) => (s.surfaces[0].covers = "page:gs:terms"), /covers should be an array/],
      ["liveLinks", (s) => (s.surfaces[0].liveLinks = []), /liveLinks should be an object/],
      [
        "liveLinks",
        (s) => (s.surfaces[0].liveLinks["project:x:terms"] = 1),
        /liveLinks\["project:x:terms"\] should be a string/,
      ],
      ["documents", (s) => (s.documents = {}), /^snapshot\.documents should be an array/],
    ];
    for (const [what, change, message] of cases) {
      expect(refusal(broken(change)), what).toMatch(message);
    }
  });

  it("anything that is not a snapshot object at all", () => {
    for (const value of [null, [], "snapshot", 1, undefined]) {
      expect(refusal(value)).toMatch(/^snapshot should be an object/);
    }
  });

  it("a malformed snapshot handed straight to bind", () => {
    expect(() =>
      bind(
        broken((s) => {
          s.rollouts[1].announcedAt = "2026-10-08 00:00:00";
        }) as Snapshot,
      ),
    ).toThrow(SnapshotError);
  });
});
