import {
  checked,
  placementsOn,
  type ChangeSummary,
  type Placement,
  type Snapshot,
  type SnapshotDocument,
  type SnapshotRollout,
  type SnapshotSurface,
  type SnapshotVersion,
} from "./snapshot.js";

/**
 * What one act of agreement covers, and the identifier it is recorded against.
 *
 * A person agreeing to a product's terms is agreeing to two documents, not one.
 * Every product page says so in its own words and then relies on it: the
 * liability limits, the governing law and the twelve-month cap for business
 * customers are in the general terms and are deliberately not restated per
 * product. That is incorporation by reference, and it only holds if the thing
 * somebody agreed to actually included it.
 *
 * Some products ask for a third. GOpenCDR's terms are read together with its
 * acceptable use policy, which a registrant accepts with them, and the policy
 * is where the DNS abuse that the terms suspend names for is defined. Pinning
 * the terms and not the policy would let that definition be rewritten under
 * somebody who agreed to the old one: the same failure, one document over.
 *
 * So the recorded version names every document. If any of them changes, the
 * identifier changes, and the gate asks again. Pinning only the product
 * document would let the liability clause be rewritten under somebody who
 * agreed to the old one, with the stored value still reading as current, which
 * is the failure this whole column exists to prevent.
 *
 * Which documents a surface covers, and in what order, is the snapshot's
 * `covers` (see SnapshotSurface). When each version binds on a surface is its
 * rollout there, or its default rollout where the surface has none of its own,
 * so one surface can run later than the others without moving their dates.
 *
 * Not every covered document is pinned at every instant. One with a version
 * announced on the surface by `now` is pinned: its version is part of the
 * recorded identifier. One without is shown by the surface's live link and
 * pinned by nothing. Announcing the first version of a document on a surface
 * is what pins it there, not archiving it and not announcing it somewhere
 * else. A version reaches the archive weeks before its notice goes out, and a
 * document pinned before anything of it was announced would have no version
 * anybody could agree to: every consent line and every gate on the surface
 * would throw until the date came. From the announcement on, the surface's
 * identifier names it, an agreement recorded without it is asked, and once it
 * is in force such an agreement is behind.
 *
 * Not every covered document binds every account. A surface can bind a
 * document to one capacity (GOpenCSR's terms for mirror operators bind only
 * the accounts that operate a mirror), and an account acting in no capacity
 * records, is asked about and is held to only the documents that bind
 * everybody. So every question that depends on which documents apply takes
 * the capacities the account holds, as its product says, and an account that
 * gains a capacity whose document is in force and that it has not accepted is
 * behind on it at once: products ask before granting one, and the rules
 * report what is true either way.
 */

/** The general terms, incorporated by reference into every product's. */
const GENERAL_TERMS = "page:gs:terms";

/** Joins the covered versions into the one string a database column holds.
 *  Readable on purpose: an auditor reading the row should be able to see which
 *  documents it means without running anything. */
const SEPARATOR = "+";

export class UnknownDocumentError extends Error {
  override readonly name: string = "UnknownDocumentError";
}

/** A surface the snapshot does not define. Thrown rather than answered as
 *  "nothing covered", because a gate that asks about a surface nobody set up
 *  is misconfigured, and an empty answer would let everybody through it. */
export class UnknownSurfaceError extends Error {
  override readonly name: string = "UnknownSurfaceError";
}

/** One archived version, with the live page of its document beside the frozen
 *  copy, which is what a screen or a notice links. */
export interface ArchivedVersion extends SnapshotVersion {
  /** The live page of the document: mutable, and the reason the frozen copy
   *  exists. */
  readonly liveUrl: SnapshotDocument["liveUrl"];
}

/**
 * One archived version as it stands on one surface.
 *
 * A version's dates are not the version's: they belong to its rollout on a
 * surface, and two surfaces can bind the same text on different days. So
 * wherever this package hands back dates it hands back the surface they are
 * for and the rollout they come from, and never a date without them.
 */
export interface ScheduledVersion extends ArchivedVersion {
  /** The surface the rollout below places this version on. */
  readonly surface: string;
  /**
   * The rollout that dates it there: the surface's own where it has one, the
   * version's default (`surface: null`) otherwise. Its `inForceFrom` is when
   * the version binds on this surface, which is what a consent line says, and
   * its `summary` is what the notice for this surface says changes.
   */
  readonly rollout: SnapshotRollout;
}

/**
 * Where an account stands with a surface's documents at one instant, and so
 * what the product does with it.
 *
 * - `agreed`: it has accepted the newest version announced or in force. Full
 *   use, nothing to ask.
 * - `asked`: it has accepted the version in force, and a newer one is announced
 *   and not in force yet. Full use; ask at sign-in and allow "not now".
 *   `inForceFrom` is when the first version it has not accepted comes into
 *   force on this surface, which is the date to accept by.
 * - `owed-paid`: it has not accepted the version in force, and it pays. Full use
 *   on the version it did accept, never restricted, asked at every sign-in.
 * - `restricted`: it has not accepted the version in force, and it does not pay.
 *   It may sign in, read, sign out, see and accept the terms, close its account
 *   and reach the data-protection contact, and nothing else.
 * - `exempt`: staff, who are not gated at all.
 */
export type ConsentState =
  | { readonly kind: "agreed" }
  | { readonly kind: "asked"; readonly inForceFrom: Date }
  | { readonly kind: "owed-paid" }
  | { readonly kind: "restricted" }
  | { readonly kind: "exempt" };

/**
 * Who is being asked, as far as the gate cares.
 *
 * `paid` is true when any organisation or instance the person acts for has a
 * live paid subscription or a paid licence tier. `staff` is Gelhaus
 * Solutions' own staff in GPlatform Control and Billing. Both are the
 * product's own word: this package does not know who pays and does not guess.
 */
export interface ConsentHolder {
  readonly paid: boolean;
  readonly staff?: boolean;
  /**
   * The capacities the account acts in on the surface asked about, as its
   * product says: the documents bound to one of them bind it too. A capacity
   * the snapshot's surface does not declare binds nothing, rather than
   * throwing, so a product holding a snapshot older than a newly declared
   * capacity keeps answering for everybody.
   */
  readonly capacities?: readonly string[];
}

/**
 * Where an account stands with one covered document. See documentStandings.
 *
 * - `current`: it has accepted the newest version announced or in force.
 * - `asked`: it has accepted the version in force, and a newer one is
 *   announced; `acceptBy` is when the first one it has not accepted binds.
 * - `behind`: it has not accepted the version in force.
 * - `linked`: nothing of it is announced on the surface yet; shown by its live
 *   page and pinned by nothing.
 * - `not-binding`: it binds one capacity, which the account does not hold.
 */
export type DocumentStandingKind = "current" | "asked" | "behind" | "linked" | "not-binding";

export interface DocumentStanding {
  /** The document's key. */
  readonly document: string;
  /** The capacity it binds, or null where it binds every account. */
  readonly audience: string | null;
  readonly kind: DocumentStandingKind;
  /** The version of it the recorded value names, if any. */
  readonly accepted: ScheduledVersion | null;
  /** The version of it in force on the surface at the instant asked, if any. */
  readonly inForce: ScheduledVersion | null;
  /** The version accepting at the instant asked records, or null where only
   *  linked. */
  readonly toRecord: ScheduledVersion | null;
  /** For `asked`: when the first version it has not accepted comes into force. */
  readonly acceptBy: Date | null;
}

/** One version to send notice of. See announcementsDue. */
export interface ConsentAnnouncement {
  /** The archived version the notice is about, and half of its dedupe key. */
  readonly versionId: string;
  /** When it comes into force on the surface asked about. */
  readonly inForceFrom: Date;
  /** What changes, only where the notice has to say: the summary of the
   *  version's rollout on this surface. See ChangeSummary. */
  readonly summary?: ChangeSummary;
}

/** Everything a consent line has to put in front of somebody. See
 *  consentLinks. */
export interface ConsentLinks {
  readonly product: ScheduledVersion | null;
  readonly policies: readonly ScheduledVersion[];
  readonly general: ScheduledVersion;
  readonly unpinnedProductUrl: string | null;
  readonly unpinnedPolicyUrls: readonly string[];
}

/**
 * The consent rules, bound to one snapshot. Every name here is a plain
 * function that closes over the snapshot, so it can be destructured and passed
 * around without its object.
 *
 * None of them reads the clock. Every question about where somebody stands is
 * a question about an instant, and an instant the function picked for itself
 * is one the caller cannot see, test or repeat.
 */
export interface Terms {
  /** The snapshot these rules decide from, as parseSnapshot read it. */
  readonly snapshot: Snapshot;
  /** Every surface the snapshot defines, in its order. */
  surfaces(): readonly string[];
  /** A surface's covers in order, each with the capacity it binds (null: every
   *  account), and the capacities the surface declares. */
  coversOf(surface: string): {
    readonly covers: readonly { readonly document: string; readonly audience: string | null }[];
    readonly capacities: readonly string[];
  };
  consentStateAt(
    surface: string,
    recorded: string | null,
    now: Date,
    who: ConsentHolder,
  ): ConsentState;
  documentStandings(
    surface: string,
    recorded: string | null,
    now: Date,
    capacities?: readonly string[],
  ): readonly DocumentStanding[];
  versionToRecord(surface: string, now: Date, capacities?: readonly string[]): string;
  announcementsDue(
    surface: string,
    now: Date,
    capacities?: readonly string[],
  ): ConsentAnnouncement[];
  consentLinks(surface: string, now: Date, capacities?: readonly string[]): ConsentLinks;
  documentsFor(
    surface: string,
    now: Date,
    capacities?: readonly string[],
  ): readonly ScheduledVersion[];
  archivedVersion(versionId: string): ArchivedVersion | null;
  archivedVersion(versionId: string, surface: string): ScheduledVersion | null;
  documentsOfConsent(recorded: string | null): readonly ArchivedVersion[] | null;
  documentsOfConsent(recorded: string | null, surface: string): readonly ScheduledVersion[] | null;
}

/** One covered document, and whether the surface pins it or only its live
 *  page can be shown. */
type Cover =
  | { readonly key: string; readonly pinned: true }
  | { readonly key: string; readonly pinned: false; readonly liveUrl: string };

/** One version placed on a surface, with the instants of its rollout read once. */
interface Placed {
  readonly version: ScheduledVersion;
  readonly announced: number;
  readonly inForce: number;
}

/** One document's versions on one surface as they stand at one instant. */
interface Versions {
  /** Every version placed on the surface, oldest in force first. A version's
   *  place here is its rank: a later one supersedes an earlier one. */
  readonly all: readonly Placed[];
  /** The version in force: the latest whose `inForceFrom` has passed, or null
   *  before the first one binds. */
  readonly inForce: Placed | null;
  /** The latest version announced and not yet in force, or null when nothing
   *  is pending. */
  readonly announced: Placed | null;
}

/** One surface, with every covered document's versions placed on it once, at
 *  bind time, rather than on every question. */
interface Bound {
  readonly surface: SnapshotSurface;
  readonly placed: ReadonlyMap<string, readonly Placed[]>;
  readonly liveLinks: ReadonlyMap<string, string>;
  /** Document key to the capacity it binds; a document absent binds everybody. */
  readonly audiences: ReadonlyMap<string, string>;
}

/** Every account's documents and the ones a capacity brings in, or every
 *  covered document whoever holds what. */
type Holding = readonly string[] | "all";

/** The instant a question is asked at, refusing anything that is not one. */
function instantAt(now: Date): number {
  if (!(now instanceof Date)) {
    throw new TypeError(
      "now must be a Date. Every rule is asked at an explicit instant and none reads the clock.",
    );
  }
  const at = now.getTime();
  if (Number.isNaN(at)) {
    throw new RangeError("now is not a valid date, so no version can be placed before or after it");
  }
  return at;
}

/**
 * Splits a stored consent value back into the version ids it was built from,
 * or null where it is not one.
 *
 * Strictly: one or more ids joined by single `+`, and nothing else. An empty
 * part, a leading or trailing `+` or a space is not something versionToRecord
 * ever writes, so a value carrying one was written by something else, and
 * reading past it would be guessing at what that something meant.
 */
function versionIdsOf(recorded: string): readonly string[] | null {
  const ids = recorded.split(SEPARATOR);
  return ids.every((id) => /^[\x21-\x7e]+$/u.test(id)) ? ids : null;
}

/**
 * Binds the consent rules to one snapshot.
 *
 * The snapshot is checked first (see parseSnapshot) unless parseSnapshot or
 * verifySnapshot produced it, and the rules decide from the checked, frozen
 * copy, which `snapshot` on the result is. A snapshot that fails the check is
 * refused with a SnapshotError here, once, rather than answering questions
 * from facts that contradict each other.
 */
export function bind(snapshot: Snapshot): Terms {
  const source = checked(snapshot);
  const documentByKey = new Map(source.documents.map((document) => [document.key, document]));
  const versionById = new Map(source.versions.map((version) => [version.versionId, version]));

  const archived = new Map<string, ArchivedVersion>(
    source.versions.map((version) => {
      const document = documentByKey.get(version.document);
      // parseSnapshot refuses a version of a document it does not hold.
      if (document === undefined) throw new UnknownDocumentError(version.document);
      return [version.versionId, Object.freeze({ ...version, liveUrl: document.liveUrl })];
    }),
  );

  const bound = new Map<string, Bound>(
    source.surfaces.map((surface) => {
      const placed = new Map<string, readonly Placed[]>();
      for (const [key, placements] of placementsOn(source, surface)) {
        placed.set(
          key,
          Object.freeze(
            placements.map((placement: Placement): Placed =>
              Object.freeze({
                version: Object.freeze({
                  ...(archived.get(placement.version.versionId) as ArchivedVersion),
                  surface: surface.id,
                  rollout: placement.rollout,
                }),
                announced: placement.announced,
                inForce: placement.inForce,
              }),
            ),
          ),
        );
      }
      const liveLinks = new Map(Object.entries(surface.liveLinks));
      const audiences = new Map(Object.entries(surface.audiences ?? {}));
      return [surface.id, { surface, placed, liveLinks, audiences }];
    }),
  );

  function surfaceOf(id: string): Bound {
    const found = typeof id === "string" ? bound.get(id) : undefined;
    if (found === undefined) {
      throw new UnknownSurfaceError(
        `no surface ${JSON.stringify(id)} in snapshot ${source.serial}. A surface is defined by the snapshot, so a gate asking about one it does not define is asking about nothing it can answer for.`,
      );
    }
    return found;
  }

  /**
   * One document's versions on a surface at `now`, chosen by their dates.
   *
   * Never by where an entry sits in the snapshot. Several versions of a
   * document can be placed at once, and which one binds is a question about
   * time, so it is answered from the rollout's `inForceFrom` and `announcedAt`
   * read as instants.
   */
  function versionsOf(on: Bound, key: string, at: number): Versions {
    const all = on.placed.get(key) ?? [];
    if (all.length === 0) {
      throw new UnknownDocumentError(
        `no version of "${key}" is placed on surface "${on.surface.id}". The archive is the source of truth for what can be agreed to, so a surface cannot pin a document nothing of which has been rolled out to it.`,
      );
    }
    let inForce: Placed | null = null;
    let announced: Placed | null = null;
    for (const entry of all) {
      if (entry.inForce <= at) inForce = entry;
      else if (entry.announced <= at) announced = entry;
    }
    return { all, inForce, announced };
  }

  /** The version an agreement made at `now` records: the announced one where a
   *  newer version is pending, and the one in force otherwise. */
  function newestOf(key: string, versions: Versions, now: Date): Placed {
    const newest = versions.announced ?? versions.inForce;
    if (newest === null) {
      throw new UnknownDocumentError(
        `no version of "${key}" is announced by ${now.toISOString()}, so there is nothing yet that could be agreed to.`,
      );
    }
    return newest;
  }

  /** Whether a covered document binds an account holding `holding`. */
  function binds(on: Bound, key: string, holding: Holding): boolean {
    const audience = on.audiences.get(key);
    return audience === undefined || holding === "all" || holding.includes(audience);
  }

  /** The capacities a caller passed, refusing anything that is not a list of
   *  names. */
  function holdingOf(capacities: readonly string[] | undefined): readonly string[] {
    if (capacities === undefined) return [];
    if (!Array.isArray(capacities) || capacities.some((one) => typeof one !== "string")) {
      throw new TypeError("capacities must be a list of capacity names");
    }
    return capacities;
  }

  /** Every document that binds `holding` at `now`, in the covers' order, each
   *  pinned or linked. */
  function coverOf(on: Bound, now: Date, at: number, holding: Holding): readonly Cover[] {
    return on.surface.covers
      .filter((key) => binds(on, key, holding))
      .map((key): Cover => {
        const announced = (on.placed.get(key) ?? []).some((entry) => entry.announced <= at);
        if (announced) return { key, pinned: true };
        const liveUrl = on.liveLinks.get(key);
        if (liveUrl === undefined) {
          throw new UnknownDocumentError(
            `no version of "${key}" is announced on "${on.surface.id}" by ${now.toISOString()}, and the surface has no live page to show it by. A surface cannot reference a document that is neither announced to it nor linked until it is.`,
          );
        }
        return { key, pinned: false, liveUrl };
      });
  }

  /** The documents a surface's identifier names at `now` for `holding`, in
   *  order. */
  function pinnedOf(on: Bound, now: Date, at: number, holding: Holding): readonly string[] {
    return coverOf(on, now, at, holding)
      .filter((cover) => cover.pinned)
      .map((cover) => cover.key);
  }

  /**
   * A recorded value as the version it names of each document this surface
   * pins, or null where it does not resolve to that.
   *
   * Strict, as comparing it with the current identifier was. A value that is
   * not ids joined by `+` (see versionIdsOf), or names a version this
   * snapshot does not hold, a document this surface does not pin at `now`, a
   * version that has no place on this surface, or one document twice, is not
   * an agreement to anything here: it is either text nobody can show the
   * person again, or an agreement made on another surface. A version with no
   * place on this surface is one nobody here was ever asked to accept, so an
   * agreement to it is not one this surface can rank.
   * Order is not checked, because the documents are told apart by their keys.
   *
   * Read against every document the surface pins, whatever the account holds:
   * an account that accepted the mirror operators' terms while it operated a
   * mirror, and has stopped, still agreed to everything else it accepted then,
   * and the agreement counts again if it operates one later.
   */
  function acceptedOf(
    on: Bound,
    recorded: string | null,
    now: Date,
    at: number,
  ): ReadonlyMap<string, Placed> | null {
    if (recorded === null) return null;
    const ids = versionIdsOf(recorded);
    if (ids === null) return null;
    const pinned = new Set(pinnedOf(on, now, at, "all"));
    const accepted = new Map<string, Placed>();
    for (const id of ids) {
      const version = versionById.get(id);
      if (
        version === undefined ||
        !pinned.has(version.document) ||
        accepted.has(version.document)
      ) {
        return null;
      }
      const placed = on.placed
        .get(version.document)
        ?.find((entry) => entry.version.versionId === id);
      if (placed === undefined) return null;
      accepted.set(version.document, placed);
    }
    return accepted.size === 0 ? null : accepted;
  }

  /**
   * Every pinned document behind one surface's consent, product first, at the
   * version an agreement made at `now` records, with its dates on that
   * surface. The documents it covers that are not pinned at `now` are not
   * here: see consentLinks for how they are shown.
   */
  function documentsFor(
    surface: string,
    now: Date,
    capacities?: readonly string[],
  ): readonly ScheduledVersion[] {
    const on = surfaceOf(surface);
    const at = instantAt(now);
    return pinnedOf(on, now, at, holdingOf(capacities)).map(
      (key) => newestOf(key, versionsOf(on, key, at), now).version,
    );
  }

  /**
   * One account's standing with every document its surface covers, in the
   * covers' order: the per-document answers consentStateAt sums up, for a
   * screen that has to say which document an account is behind on. The
   * documents bound to a capacity it does not hold are listed too, as
   * `not-binding`, with what it accepted of them.
   */
  function documentStandings(
    surface: string,
    recorded: string | null,
    now: Date,
    capacities?: readonly string[],
  ): readonly DocumentStanding[] {
    const on = surfaceOf(surface);
    const at = instantAt(now);
    return standingsOf(on, recorded, now, at, holdingOf(capacities));
  }

  function standingsOf(
    on: Bound,
    recorded: string | null,
    now: Date,
    at: number,
    holding: readonly string[],
  ): DocumentStanding[] {
    const accepted = acceptedOf(on, recorded, now, at);
    const linked = new Set(
      coverOf(on, now, at, "all")
        .filter((cover) => !cover.pinned)
        .map((cover) => cover.key),
    );
    return on.surface.covers.map((key): DocumentStanding => {
      const audience = on.audiences.get(key) ?? null;
      const mine = accepted?.get(key);
      if (linked.has(key)) {
        return {
          document: key,
          audience,
          kind: binds(on, key, holding) ? "linked" : "not-binding",
          accepted: null,
          inForce: null,
          toRecord: null,
          acceptBy: null,
        };
      }
      const versions = versionsOf(on, key, at);
      const newest = newestOf(key, versions, now);
      const base = {
        document: key,
        audience,
        accepted: mine?.version ?? null,
        inForce: versions.inForce?.version ?? null,
        toRecord: newest.version,
      };
      if (!binds(on, key, holding)) return { ...base, kind: "not-binding", acceptBy: null };
      let rank = mine === undefined ? -1 : versions.all.indexOf(mine);
      // An editorial fix in force carries an acceptance of the version before
      // it on this surface: nobody who accepted that one is asked again.
      while (rank >= 0) {
        const next = versions.all[rank + 1];
        if (
          next === undefined ||
          next.version.rollout.atOnce !== "editorial" ||
          next.inForce > at
        ) {
          break;
        }
        rank += 1;
      }
      const inForce = versions.inForce === null ? -1 : versions.all.indexOf(versions.inForce);
      if (rank < inForce) return { ...base, kind: "behind", acceptBy: null };
      if (rank < versions.all.indexOf(newest)) {
        // Current today, with a newer version announced. The first announced
        // version after theirs is the one that will put them behind.
        const next = versions.all.slice(rank + 1).find((entry) => entry.announced <= at) ?? newest;
        return { ...base, kind: "asked", acceptBy: new Date(next.inForce) };
      }
      return { ...base, kind: "current", acceptBy: null };
    });
  }

  /**
   * Where an account stands at `now`. The one question every product's gate and
   * sign-in ask; see ConsentState for what each answer means.
   *
   * Decided per document, never by comparing whole identifiers. An account can be
   * ahead on one document and current on another, as when it accepted a new
   * version of the general terms during their notice period and a product's new
   * terms were announced after that: it has accepted everything in force and is
   * only `asked`. A whole-string comparison with the version in force would call
   * that account behind and restrict it.
   *
   * Decided per surface too. The same version can be in force on one surface
   * and only announced on another, so the same account, having accepted the
   * same things, can be restricted on the first and asked on the second. That
   * is the point of a rollout per surface, not a contradiction: the six weeks
   * run from each surface's own notice.
   *
   * A null or unresolvable value (see acceptedOf) has accepted nothing, so it is
   * behind on every document already in force: `restricted` when free and
   * `owed-paid` when paid. Staff are `exempt` before anything else is looked
   * at, the recorded value and the instant included. Only the surface is
   * checked first, because asking about a surface the snapshot does not define
   * is a misconfigured gate whoever is standing at it.
   */
  function consentStateAt(
    surface: string,
    recorded: string | null,
    now: Date,
    who: ConsentHolder,
  ): ConsentState {
    const on = surfaceOf(surface);
    if (who.staff === true) return { kind: "exempt" };
    const at = instantAt(now);
    let behind = false;
    let acceptBy: number | null = null;
    for (const one of standingsOf(on, recorded, now, at, holdingOf(who.capacities))) {
      if (one.kind === "behind") behind = true;
      if (one.kind === "asked" && one.acceptBy !== null) {
        const by = one.acceptBy.getTime();
        acceptBy = acceptBy === null ? by : Math.min(acceptBy, by);
      }
    }
    if (behind) return who.paid ? { kind: "owed-paid" } : { kind: "restricted" };
    if (acceptBy === null) return { kind: "agreed" };
    return { kind: "asked", inForceFrom: new Date(acceptBy) };
  }

  /**
   * What accepting at `now` records: every covered document pinned on this
   * surface, at the newest version announced or in force on it, joined with
   * "+".
   *
   * Stored verbatim in `termsAcceptedVersion`, so the stored row answers "which
   * text" rather than only "when". A new sign-up records this too, which is the
   * announced version during a notice period, so it is not asked again six weeks
   * later about text it was shown on the day.
   */
  function versionToRecord(surface: string, now: Date, capacities?: readonly string[]): string {
    return documentsFor(surface, now, capacities)
      .map((version) => version.versionId)
      .join(SEPARATOR);
  }

  /**
   * The versions a surface's accounts are owed notice of at `now`: announced on
   * this surface and not yet in force on it, product documents first, then the
   * general terms.
   *
   * One entry per document version, so a daily job sends each account one mail
   * per entry with the account and `versionId` as its dedupe key, and stops on
   * its own once the version is in force. The mail links the live text and the
   * frozen copy (archivedVersion gives both) and does not say what changed,
   * unless `summary` is set, in which case it says exactly that. The summary is
   * the one on this surface's rollout, because a surface that runs later names
   * a later date to object by.
   */
  function announcementsDue(
    surface: string,
    now: Date,
    capacities?: readonly string[],
  ): ConsentAnnouncement[] {
    const on = surfaceOf(surface);
    const at = instantAt(now);
    return pinnedOf(on, now, at, holdingOf(capacities)).flatMap((key) =>
      versionsOf(on, key, at)
        .all.filter((entry) => entry.announced <= at && at < entry.inForce)
        .map(({ version, inForce }): ConsentAnnouncement => ({
          versionId: version.versionId,
          inForceFrom: new Date(inForce),
          ...(version.rollout.summary === undefined ? {} : { summary: version.rollout.summary }),
        })),
    );
  }

  /**
   * Everything a consent line has to put in front of somebody.
   *
   * Each pinned document is given at the version accepting at `now` records
   * (see versionToRecord), with its rollout on this surface: its
   * `rollout.inForceFrom` is when that version binds here, which is what the
   * screen says.
   *
   * `product` is null where the product terms are not pinned at `now`, and
   * `unpinnedProductUrl` is set instead, from the surface's live links. A
   * caller renders whichever it is given and does not have to know which
   * surfaces are in which state.
   *
   * `policies` are the product's other documents accepted with its terms, such
   * as GOpenCDR's acceptable use policy, in the order they are recorded, and
   * empty for a surface that has none. The consent line names and links each of
   * them: the recorded version pins them, and pinning a document somebody was
   * never shown records an agreement that did not happen. `unpinnedPolicyUrls`
   * are the same kind of document where it is not pinned at `now`, such as
   * GOpenCSR's and GOpenCNR's acceptable use policies before their first
   * announcement, linked by their live pages and pinned by nothing; empty
   * otherwise.
   *
   * Throws UnknownDocumentError where the surface does not cover the general
   * terms, or has nothing of them announced at `now`: every product
   * incorporates them by reference, so a consent line without them is
   * incomplete, and showing it anyway would record an agreement to less than
   * the product relies on.
   */
  function consentLinks(surface: string, now: Date, capacities?: readonly string[]): ConsentLinks {
    const on = surfaceOf(surface);
    const at = instantAt(now);
    const covered = coverOf(on, now, at, holdingOf(capacities));
    const general = covered.find((cover) => cover.key === GENERAL_TERMS);
    if (general === undefined || !general.pinned) {
      throw new UnknownDocumentError(
        `surface "${surface}" does not cover the general terms. Every product incorporates them by reference, so a consent that omits them is incomplete.`,
      );
    }
    const newest = (key: string): ScheduledVersion =>
      newestOf(key, versionsOf(on, key, at), now).version;
    const [product, ...policies] = covered.filter((cover) => cover !== general);
    return {
      product: product?.pinned === true ? newest(product.key) : null,
      policies: policies.flatMap((cover) => (cover.pinned ? [newest(cover.key)] : [])),
      general: newest(general.key),
      unpinnedProductUrl: product?.pinned === false ? product.liveUrl : null,
      unpinnedPolicyUrls: policies.flatMap((cover) => (cover.pinned ? [] : [cover.liveUrl])),
    };
  }

  /**
   * One archived version by its id, or null if this snapshot does not hold it.
   *
   * Without a surface, the version and its document's live page, which is what
   * a notice mail links: the dates it needs come with the announcement. With a
   * surface, the same version placed on that surface, carrying the rollout that
   * dates it there; null as well where it has no place on that surface (its
   * document is not covered there, or neither the surface nor the version's
   * default has a rollout of it), because a date for a surface that never
   * scheduled the version would be invented.
   */
  function archivedVersion(versionId: string): ArchivedVersion | null;
  function archivedVersion(versionId: string, surface: string): ScheduledVersion | null;
  function archivedVersion(
    versionId: string,
    surface?: string,
  ): ArchivedVersion | ScheduledVersion | null {
    if (surface === undefined) return archived.get(versionId) ?? null;
    const on = surfaceOf(surface);
    const version = versionById.get(versionId);
    if (version === undefined) return null;
    return (
      on.placed.get(version.document)?.find((entry) => entry.version.versionId === versionId)
        ?.version ?? null
    );
  }

  /**
   * What somebody previously agreed to, resolved back into documents.
   *
   * The point of keeping an archive rather than only a hash. When the gate asks
   * again, the person being asked has already agreed to something once, and the
   * reasonable question is what changed. Their stored value names exact versions
   * and the archive holds those exact bytes, so the screen can link the frozen
   * copy of what they agreed to then beside the live text they are being asked
   * about now.
   *
   * Null where the value cannot be resolved, and that is a real and permanent
   * state rather than an error: an agreement recorded before this column existed
   * has no version at all, and one naming a version published before this archive
   * began is a value we cannot honour. A screen that guessed in either case would
   * show somebody a document they never saw.
   *
   * All or nothing. A consent naming several documents of which only some are
   * held resolves to null, because showing half of what somebody agreed to while
   * implying it is the whole is worse than showing none of it. Given a surface,
   * each version comes with its dates there (see archivedVersion), and a value
   * naming any version that has no place on that surface is null for the same
   * reason.
   */
  function documentsOfConsent(recorded: string | null): readonly ArchivedVersion[] | null;
  function documentsOfConsent(
    recorded: string | null,
    surface: string,
  ): readonly ScheduledVersion[] | null;
  function documentsOfConsent(
    recorded: string | null,
    surface?: string,
  ): readonly (ArchivedVersion | ScheduledVersion)[] | null {
    if (surface !== undefined) surfaceOf(surface);
    if (recorded === null) return null;
    const ids = versionIdsOf(recorded);
    if (ids === null) return null;
    const found = ids.map((id) =>
      surface === undefined ? archivedVersion(id) : archivedVersion(id, surface),
    );
    return found.every((entry) => entry !== null) ? (found as ArchivedVersion[]) : null;
  }

  function coversOf(surface: string) {
    const on = surfaceOf(surface);
    return Object.freeze({
      covers: Object.freeze(
        on.surface.covers.map((document) =>
          Object.freeze({ document, audience: on.audiences.get(document) ?? null }),
        ),
      ),
      capacities: on.surface.capacities ?? Object.freeze([]),
    });
  }

  const surfaceIds = Object.freeze(source.surfaces.map((surface) => surface.id));

  return Object.freeze({
    snapshot: source,
    surfaces: () => surfaceIds,
    coversOf,
    consentStateAt,
    documentStandings,
    versionToRecord,
    announcementsDue,
    consentLinks,
    documentsFor,
    archivedVersion,
    documentsOfConsent,
  });
}

/**
 * The rules bound to each snapshot object asked about through the functions
 * below, so asking a snapshot many questions binds it once. Keyed by the
 * object: a snapshot is immutable, and a changed one is a new object.
 */
const BOUND = new WeakMap<Snapshot, Terms>();

function boundTo(snapshot: Snapshot): Terms {
  let terms = BOUND.get(snapshot);
  if (terms === undefined) {
    terms = bind(snapshot);
    BOUND.set(snapshot, terms);
  }
  return terms;
}

/** consentStateAt of `bind(snapshot)`. */
export function consentStateAt(
  snapshot: Snapshot,
  surface: string,
  recorded: string | null,
  now: Date,
  who: ConsentHolder,
): ConsentState {
  return boundTo(snapshot).consentStateAt(surface, recorded, now, who);
}

/** documentStandings of `bind(snapshot)`. */
export function documentStandings(
  snapshot: Snapshot,
  surface: string,
  recorded: string | null,
  now: Date,
  capacities?: readonly string[],
): readonly DocumentStanding[] {
  return boundTo(snapshot).documentStandings(surface, recorded, now, capacities);
}

/** versionToRecord of `bind(snapshot)`. */
export function versionToRecord(
  snapshot: Snapshot,
  surface: string,
  now: Date,
  capacities?: readonly string[],
): string {
  return boundTo(snapshot).versionToRecord(surface, now, capacities);
}

/** announcementsDue of `bind(snapshot)`. */
export function announcementsDue(
  snapshot: Snapshot,
  surface: string,
  now: Date,
  capacities?: readonly string[],
): ConsentAnnouncement[] {
  return boundTo(snapshot).announcementsDue(surface, now, capacities);
}

/** consentLinks of `bind(snapshot)`. */
export function consentLinks(
  snapshot: Snapshot,
  surface: string,
  now: Date,
  capacities?: readonly string[],
): ConsentLinks {
  return boundTo(snapshot).consentLinks(surface, now, capacities);
}

/** documentsFor of `bind(snapshot)`. */
export function documentsFor(
  snapshot: Snapshot,
  surface: string,
  now: Date,
  capacities?: readonly string[],
): readonly ScheduledVersion[] {
  return boundTo(snapshot).documentsFor(surface, now, capacities);
}

/** archivedVersion of `bind(snapshot)`. */
export function archivedVersion(snapshot: Snapshot, versionId: string): ArchivedVersion | null;
export function archivedVersion(
  snapshot: Snapshot,
  versionId: string,
  surface: string,
): ScheduledVersion | null;
export function archivedVersion(
  snapshot: Snapshot,
  versionId: string,
  surface?: string,
): ArchivedVersion | ScheduledVersion | null {
  const terms = boundTo(snapshot);
  return surface === undefined
    ? terms.archivedVersion(versionId)
    : terms.archivedVersion(versionId, surface);
}

/** documentsOfConsent of `bind(snapshot)`. */
export function documentsOfConsent(
  snapshot: Snapshot,
  recorded: string | null,
): readonly ArchivedVersion[] | null;
export function documentsOfConsent(
  snapshot: Snapshot,
  recorded: string | null,
  surface: string,
): readonly ScheduledVersion[] | null;
export function documentsOfConsent(
  snapshot: Snapshot,
  recorded: string | null,
  surface?: string,
): readonly (ArchivedVersion | ScheduledVersion)[] | null {
  const terms = boundTo(snapshot);
  return surface === undefined
    ? terms.documentsOfConsent(recorded)
    : terms.documentsOfConsent(recorded, surface);
}
