/**
 * Products with several terms: a covered document that binds only the
 * accounts acting in one capacity (the design bundle's section 6, decided by
 * 2026-10-02: an admin declares a surface's capacities).
 *
 * The fixture is GOpenCSR as drawn: its own terms and the general terms bind
 * every account, the terms for mirror operators and for prefix operators bind
 * only the accounts acting as one. The version ids end in `-fixture-1` so
 * nobody grepping for a real one lands here.
 */

import { describe, expect, it } from "vitest";
import { bind, documentStandings, versionToRecord } from "./consent.js";
import { parseSnapshot, type Snapshot } from "./snapshot.js";

const CSR = "gopencsr";
const TERMS = "project:gopencsr:terms";
const MIRROR = "project:gopencsr:mirror-operator-terms";
const PREFIX = "project:gopencsr:prefix-operator-terms";
const GENERAL = "page:gs:terms";

const V = {
  terms: "gopencsr-terms-fixture-1",
  mirror: "gopencsr-mirror-operator-terms-fixture-1",
  mirror2: "gopencsr-mirror-operator-terms-fixture-2",
  prefix: "gopencsr-prefix-operator-terms-fixture-1",
  general: "gs-terms-fixture-1",
} as const;

const FIRST = "2026-10-02T10:00:00+02:00";
const MIRROR2_ANNOUNCED = "2026-12-01T00:00:00+01:00";
const MIRROR2_IN_FORCE = "2027-01-13T00:00:00+01:00";

function document(key: string) {
  return {
    key,
    product: key === GENERAL ? "gs" : CSR,
    kind: "consent" as const,
    liveUrl: { en: `https://gplatform.org/${key.replace(/:/gu, "/")}` },
  };
}

function version(documentKey: string, versionId: string) {
  return {
    versionId,
    document: documentKey,
    version: versionId.slice(-9),
    title: { en: versionId, de: versionId },
    contentHash: "a".repeat(64),
    archiveUrl: {
      en: `https://gplatform.org/legal/${versionId}`,
      de: `https://gplatform.org/de/legal/${versionId}`,
    },
    frozenAt: FIRST,
  };
}

function first(versionId: string) {
  return { versionId, surface: null, announcedAt: FIRST, inForceFrom: FIRST };
}

const SNAPSHOT: Snapshot = {
  format: 1,
  serial: 1,
  generatedAt: FIRST,
  documents: [document(GENERAL), document(TERMS), document(MIRROR), document(PREFIX)],
  versions: [
    version(GENERAL, V.general),
    version(TERMS, V.terms),
    version(MIRROR, V.mirror),
    version(MIRROR, V.mirror2),
    version(PREFIX, V.prefix),
  ],
  surfaces: [
    {
      id: CSR,
      covers: [TERMS, MIRROR, PREFIX, GENERAL],
      liveLinks: {},
      capacities: ["mirror-operator", "prefix-operator"],
      audiences: { [MIRROR]: "mirror-operator", [PREFIX]: "prefix-operator" },
    },
  ],
  rollouts: [
    first(V.general),
    first(V.terms),
    first(V.mirror),
    first(V.prefix),
    {
      versionId: V.mirror2,
      surface: null,
      announcedAt: MIRROR2_ANNOUNCED,
      inForceFrom: MIRROR2_IN_FORCE,
    },
  ],
};

const terms = bind(parseSnapshot(SNAPSHOT));
const NOV = new Date("2026-11-21T00:00:00+01:00");
const DEC = new Date("2026-12-10T00:00:00+01:00");
const plain = `${V.terms}+${V.general}`;
const mirrorAccepted = `${V.terms}+${V.mirror}+${V.general}`;

describe("what an account records", () => {
  it("names only the documents that bind it, in the covers' order", () => {
    expect(terms.versionToRecord(CSR, NOV)).toBe(plain);
    expect(terms.versionToRecord(CSR, NOV, ["mirror-operator"])).toBe(mirrorAccepted);
    expect(terms.versionToRecord(CSR, NOV, ["prefix-operator", "mirror-operator"])).toBe(
      `${V.terms}+${V.mirror}+${V.prefix}+${V.general}`,
    );
    expect(versionToRecord(SNAPSHOT, CSR, NOV, ["mirror-operator"])).toBe(mirrorAccepted);
  });

  it("treats a capacity the surface does not declare as binding nothing", () => {
    expect(terms.versionToRecord(CSR, NOV, ["mirror-operatr"])).toBe(plain);
  });

  it("records the announced version of a capacity's document during its notice period", () => {
    expect(terms.versionToRecord(CSR, DEC, ["mirror-operator"])).toBe(
      `${V.terms}+${V.mirror2}+${V.general}`,
    );
  });
});

describe("where an account stands", () => {
  const free = { paid: false };

  it("holds a plain account to the documents everybody accepts, and nothing else", () => {
    expect(terms.consentStateAt(CSR, plain, NOV, free)).toEqual({ kind: "agreed" });
  });

  it("puts an account behind at once when it gains a capacity whose terms it never accepted", () => {
    const operator = { capacities: ["prefix-operator"] };
    expect(terms.consentStateAt(CSR, plain, NOV, { ...free, ...operator })).toEqual({
      kind: "restricted",
    });
    expect(terms.consentStateAt(CSR, plain, NOV, { paid: true, ...operator })).toEqual({
      kind: "owed-paid",
    });
    expect(
      terms.consentStateAt(CSR, plain, NOV, { paid: false, staff: true, ...operator }),
    ).toEqual({ kind: "exempt" });
  });

  it("keeps an agreement that names a capacity's terms after the capacity is gone", () => {
    expect(terms.consentStateAt(CSR, mirrorAccepted, NOV, free)).toEqual({ kind: "agreed" });
    expect(
      terms.consentStateAt(CSR, mirrorAccepted, NOV, { ...free, capacities: ["mirror-operator"] }),
    ).toEqual({ kind: "agreed" });
  });

  it("asks only the capacity's accounts about a new version of its terms", () => {
    const mirror = { ...free, capacities: ["mirror-operator"] };
    expect(terms.consentStateAt(CSR, mirrorAccepted, DEC, mirror)).toEqual({
      kind: "asked",
      inForceFrom: new Date(MIRROR2_IN_FORCE),
    });
    expect(terms.consentStateAt(CSR, mirrorAccepted, DEC, free)).toEqual({ kind: "agreed" });
    expect(terms.consentStateAt(CSR, mirrorAccepted, new Date(MIRROR2_IN_FORCE), mirror)).toEqual({
      kind: "restricted",
    });
  });
});

describe("standings per document", () => {
  it("says which document an account is behind on, and which do not bind it", () => {
    const standings = terms.documentStandings(CSR, mirrorAccepted, NOV, [
      "mirror-operator",
      "prefix-operator",
    ]);
    expect(
      standings.map(({ document, audience, kind, accepted, toRecord }) => ({
        document,
        audience,
        kind,
        accepted: accepted?.versionId ?? null,
        toRecord: toRecord?.versionId ?? null,
      })),
    ).toEqual([
      { document: TERMS, audience: null, kind: "current", accepted: V.terms, toRecord: V.terms },
      {
        document: MIRROR,
        audience: "mirror-operator",
        kind: "current",
        accepted: V.mirror,
        toRecord: V.mirror,
      },
      {
        document: PREFIX,
        audience: "prefix-operator",
        kind: "behind",
        accepted: null,
        toRecord: V.prefix,
      },
      {
        document: GENERAL,
        audience: null,
        kind: "current",
        accepted: V.general,
        toRecord: V.general,
      },
    ]);
    expect(documentStandings(SNAPSHOT, CSR, plain, NOV).map((one) => one.kind)).toEqual([
      "current",
      "not-binding",
      "not-binding",
      "current",
    ]);
  });

  it("gives the date to accept by for a document that is asked", () => {
    const mirror = terms
      .documentStandings(CSR, mirrorAccepted, DEC, ["mirror-operator"])
      .find((one) => one.document === MIRROR);
    expect(mirror).toMatchObject({ kind: "asked", acceptBy: new Date(MIRROR2_IN_FORCE) });
    expect(mirror?.inForce?.versionId).toBe(V.mirror);
  });
});

describe("notices and consent lines", () => {
  it("owes notice of a capacity's new terms only to the accounts acting in it", () => {
    expect(
      terms.announcementsDue(CSR, DEC, ["mirror-operator"]).map((one) => one.versionId),
    ).toEqual([V.mirror2]);
    expect(terms.announcementsDue(CSR, DEC)).toEqual([]);
  });

  it("puts a capacity's terms on the consent line of the accounts acting in it", () => {
    expect(
      terms.consentLinks(CSR, NOV, ["mirror-operator"]).policies.map((one) => one.versionId),
    ).toEqual([V.mirror]);
    expect(terms.consentLinks(CSR, NOV).policies).toEqual([]);
    expect(terms.consentLinks(CSR, NOV).product?.versionId).toBe(V.terms);
  });

  it("lists a surface's covers with whom each binds, and its capacities", () => {
    expect(terms.coversOf(CSR)).toEqual({
      covers: [
        { document: TERMS, audience: null },
        { document: MIRROR, audience: "mirror-operator" },
        { document: PREFIX, audience: "prefix-operator" },
        { document: GENERAL, audience: null },
      ],
      capacities: ["mirror-operator", "prefix-operator"],
    });
  });
});

describe("a snapshot's capacities, checked", () => {
  const refusal = (change: (surface: Record<string, unknown>) => void): string => {
    const copy = structuredClone(SNAPSHOT) as unknown as { surfaces: Record<string, unknown>[] };
    change(copy.surfaces[0] as Record<string, unknown>);
    try {
      parseSnapshot(copy);
    } catch (error) {
      return (error as Error).message;
    }
    return "accepted";
  };

  it("refuses an audience for a document the surface does not cover", () => {
    expect(
      refusal((surface) => {
        surface["covers"] = [TERMS, MIRROR, GENERAL];
      }),
    ).toMatch(/audiences\["project:gopencsr:prefix-operator-terms"\] is for .* does not cover/u);
  });

  it("refuses a capacity the surface does not declare", () => {
    expect(
      refusal((surface) => {
        surface["capacities"] = ["mirror-operator"];
      }),
    ).toMatch(/names the capacity "prefix-operator", which the surface does not declare/u);
  });

  it("refuses binding the general terms to one capacity", () => {
    expect(
      refusal((surface) => {
        surface["audiences"] = { [GENERAL]: "mirror-operator" };
      }),
    ).toMatch(/bind every account/u);
  });

  it("refuses a capacity named twice, or spelt as a capacity is not", () => {
    expect(
      refusal((surface) => {
        surface["capacities"] = ["mirror-operator", "prefix-operator", "mirror-operator"];
      }),
    ).toMatch(/capacities\[2\] names "mirror-operator" a second time/u);
    expect(
      refusal((surface) => {
        surface["capacities"] = ["Mirror Operator"];
        surface["audiences"] = {};
      }),
    ).toMatch(/lower case letters, digits and dashes/u);
  });

  it("reads a surface with neither field exactly as before", () => {
    const copy = structuredClone(SNAPSHOT) as unknown as { surfaces: Record<string, unknown>[] };
    const surface = copy.surfaces[0] as Record<string, unknown>;
    delete surface["capacities"];
    delete surface["audiences"];
    const parsed = parseSnapshot(copy);
    expect(parsed.surfaces[0]).not.toHaveProperty("capacities");
    expect(bind(parsed).versionToRecord(CSR, NOV)).toBe(
      `${V.terms}+${V.mirror}+${V.prefix}+${V.general}`,
    );
  });
});
