/**
 * The snapshot: what the consent rules know about the archive, as a value that
 * arrives from outside rather than code compiled into the package.
 *
 * `@ghub/gctl-terms` quoted its archive into TypeScript, so a new version of
 * any document was a new release of the package and of every product that
 * used it. A snapshot carries the same facts as data: the documents, the
 * metadata and hash of every frozen version, which documents each surface
 * covers, and the rollout that dates each version on each surface. Not the
 * texts, which stay in the archive and are tied to a version by its hash, and
 * never anybody's consent.
 *
 * Because it arrives from outside, nothing in it is trusted until
 * parseSnapshot has read it. The rules depend on facts about the whole
 * snapshot that no single field shows, such as that two versions of one
 * document never come into force at the same instant on one surface, and a
 * rule asked of a snapshot where that is false does not fail: it answers by
 * array order, which is exactly what the dates are there to replace. So a
 * snapshot is refused whole, naming the field, rather than used in part.
 */

import { earliestInForceAt } from "./notice.js";

/** The languages every document is published in. Both are authoritative: the
 *  general terms state that the German version governs under German law. */
export type LanguageTag = "en" | "de";

/**
 * What a new version changes, in both languages, for the few announcements
 * that have to say so.
 *
 * Most do not. A person is asked to accept the new text, which is linked in
 * full beside the frozen copy, and is not handed a digest of it, because a
 * digest is a second text that can disagree with the first. The exceptions are
 * the first rollout under the general terms of 2026-09-06, whose section on
 * changes promises to say what changes and that the person may object, and a
 * materially changed privacy notice.
 */
export type ChangeSummary = Readonly<Record<LanguageTag, string>>;

/** One document across all its versions. */
export interface SnapshotDocument {
  /** Stable across every version: `page:gs:terms`, `project:gadvisory:terms`. */
  readonly key: string;
  /** The product it belongs to: `gs`, `gadvisory`. */
  readonly product: string;
  /**
   * `consent` is agreed to; `notice` is only read, as a privacy notice is.
   * A notice is never part of what a surface records, because nobody accepts
   * one: it informs, and pinning it into a consent identifier would ask people
   * to agree to something the law only requires us to tell them.
   */
  readonly kind: "consent" | "notice";
  /** The live page, which is mutable and is the reason the archive exists. */
  readonly liveUrl: { readonly en: string; readonly de?: string };
}

/** One frozen version of one document. Immutable once published: a change is
 *  a new `versionId`, never an edit to this entry. */
export interface SnapshotVersion {
  /** What consent is recorded against, and the homepage's `/legal` slug. */
  readonly versionId: string;
  /** The key of the document this is a version of. */
  readonly document: string;
  /** The label people see, such as `2026-10-01`. */
  readonly version: string;
  readonly title: Readonly<Record<LanguageTag, string>>;
  /**
   * The publisher's hash over the document as a whole.
   *
   * Carried and compared; never re-derived here. How it combines the
   * per-language texts is the publisher's business, and a second
   * implementation of that rule in this package would be a second thing that
   * can be wrong.
   */
  readonly contentHash: string;
  /** The frozen copy of this exact version, per language. */
  readonly archiveUrl: Readonly<Record<LanguageTag, string>>;
  /** When the publisher froze this text. Not when it binds anybody: that is
   *  the rollout's `inForceFrom`. */
  readonly frozenAt: string;
}

/** Somewhere a person is asked to agree, and what that agreement covers. */
export interface SnapshotSurface {
  /** `gadvisory`, `contribution-checker`. */
  readonly id: string;
  /**
   * The documents an agreement here covers, in the order the recorded
   * identifier names them: the product's terms first, then any other product
   * document accepted with them, then the general terms.
   *
   * Order is part of the identifier, so it is data rather than derived from
   * however the documents happen to be sorted.
   */
  readonly covers: readonly string[];
  /**
   * The live page to show for a covered document while no version of it is
   * announced on this surface.
   *
   * A consent line has two jobs and they fail differently. It has to show
   * somebody everything that governs what they are agreeing to, and it has to
   * leave behind a record of what that was. For a document with nothing
   * announced the first is possible and the second is not, so the link is
   * shown and nothing is pinned, rather than hiding a document because its
   * text cannot be proved yet. A change to such a page supersedes nothing and
   * asks nobody again, because there is no hash to notice the change with;
   * that is the price of not archiving it, and why a link here is meant to be
   * temporary. Once a version is announced on this surface it is pinned
   * whatever this says.
   */
  readonly liveLinks: Readonly<Record<string, string>>;
  /**
   * The capacities an account on this surface can act in, as the surface
   * declares them: `mirror-operator`, `prefix-operator`. A product says which
   * of them each account holds; a capacity is declared here first, by an
   * admin, so a misspelt one in a push is refused rather than becoming a
   * capacity nobody is bound under. Absent where the surface has none.
   */
  readonly capacities?: readonly string[];
  /**
   * The covered documents that bind only accounts acting in one capacity,
   * keyed by document, valued by the capacity. A covered document not named
   * here binds every account, as every document did before capacities. An
   * account records, is asked about and is held to only the documents that
   * bind it, in the covers' order. Absent where every document binds every
   * account.
   */
  readonly audiences?: Readonly<Record<string, string>>;
}

/**
 * When one version binds, on one surface or by default on all of them.
 *
 * The dates live here and not on the version because one version can reach
 * different surfaces at different times: the six weeks run from the notice
 * mail, and a product whose mail goes out later has its own six weeks.
 */
export interface SnapshotRollout {
  readonly versionId: string;
  /** The surface this rollout is for, or null for the version's default,
   *  which every surface without a rollout of its own uses. */
  readonly surface: string | null;
  /**
   * When the notice went out. From here on a person signing in is asked to
   * accept the version and may say "not now", and the surface pins its
   * document if nothing of it was pinned before.
   */
  readonly announcedAt: string;
  /**
   * When the version replaces the one before it. From here on a person who
   * has not accepted it is behind, which restricts a free account and never a
   * paid one. At least six weeks and a day after `announcedAt` for a version
   * that supersedes another on the same surface.
   */
  readonly inForceFrom: string;
  /** What changes, where the notice has to say. On the rollout rather than the
   *  version, because a later surface's summary names a later date to object
   *  by. See ChangeSummary. */
  readonly summary?: ChangeSummary;
  /**
   * Set when the version binds at once, without six weeks' notice, and why
   * nobody is owed any (absent on every ordinary rollout):
   *
   * - `editorial`: a fix that changes nothing anybody agreed to, a typo. An
   *   account that accepted the version before it on the same surface has
   *   accepted this one; nobody is asked again.
   * - `no-accounts`: nobody had accepted anything on the surfaces it reaches
   *   when it was dated, so nobody was owed notice. It binds like any version
   *   from then on.
   *
   * The publisher decides which, and is the one that can see the accounts:
   * these rules take its word, as they take its dates.
   */
  readonly atOnce?: AtOnce;
}

/** Why a version binds without notice. See SnapshotRollout.atOnce. */
export type AtOnce = "editorial" | "no-accounts";

export interface Snapshot {
  readonly format: 1;
  /** Increases with every regeneration, so a cache can tell newer from older
   *  without comparing contents. */
  readonly serial: number;
  readonly generatedAt: string;
  readonly documents: readonly SnapshotDocument[];
  readonly versions: readonly SnapshotVersion[];
  readonly surfaces: readonly SnapshotSurface[];
  readonly rollouts: readonly SnapshotRollout[];
}

/** A snapshot, or a part of one, that cannot be used. The message names the
 *  field and says what is wrong with it. */
export class SnapshotError extends Error {
  override readonly name: string = "SnapshotError";
}

const ZONED =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):(\d{2}))$/u;
const ZONELESS = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)?$/u;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIn(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/**
 * The instant a zoned date-time names, in milliseconds, or null where it names
 * none.
 *
 * Read field by field rather than by `Date.parse`, which accepts 30 February
 * and quietly means 2 March: a legal date that is not a real date is a typing
 * error, and moving it to a neighbouring day is a guess about which day was
 * meant. The shape is the one the GPlatform Terms API accepts on the wire
 * (seconds optional, up to nine fractional digits, read to the millisecond),
 * because the server keeps an instant as the string it arrived as and puts that
 * string into the snapshot.
 */
export function instantOf(value: string): number | null {
  const match = ZONED.exec(value);
  if (match === null) return null;
  const [, y, mo, d, h, mi, s, fraction, zulu, sign, oh, om] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? "0");
  const millis = Number((fraction ?? "").padEnd(3, "0").slice(0, 3));
  const offsetHours = zulu === undefined ? Number(oh) : 0;
  const offsetMinutes = zulu === undefined ? Number(om) : 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysIn(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHours > 23 ||
    offsetMinutes > 59
  ) {
    return null;
  }
  // setUTCFullYear rather than Date.UTC, which reads a year below 100 as 19xx.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millis);
  const offset = (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return date.getTime() - (sign === "-" ? -offset : offset);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return `the string ${JSON.stringify(value)}`;
  if (typeof value === "object") return "an object";
  return `${typeof value} ${String(value)}`;
}

function fail(path: string, message: string): never {
  throw new SnapshotError(`${path} ${message}`);
}

/** A plain object, as JSON makes them: not an array, a Date or a class. */
function plain(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `should be an object, and is ${describe(value)}.`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "should be a plain object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

/** An object with exactly these fields: every required one present, and none
 *  this format does not define. */
function fields(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  const record = plain(value, path);
  for (const key of Object.keys(record)) {
    // Refused rather than ignored. Most fields here are required, so a typo in
    // one is caught as a missing field anyway; the one that matters is the
    // optional summary, which misspelt would vanish without a word and send a
    // notice that owes a summary without one.
    if (!required.includes(key) && !optional.includes(key)) {
      fail(`${path}.${key}`, "is not a field of snapshot format 1.");
    }
  }
  for (const key of required) {
    if (record[key] === undefined) fail(`${path}.${key}`, "is missing.");
  }
  return record;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, `should be an array, and is ${describe(value)}.`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, `should be a string, and is ${describe(value)}.`);
  return value;
}

/** A key or id: printable ASCII with no spaces, so it reads the same in a
 *  database column, a URL and a log line. */
function identifier(value: unknown, path: string): string {
  const text = string(value, path);
  if (!/^[\x21-\x7e]+$/u.test(text)) {
    fail(path, `should be printable ASCII without spaces, and is ${describe(text)}.`);
  }
  return text;
}

/** A version id. It is joined with `+` into the recorded identifier, so a `+`
 *  inside one would make that identifier mean two different lists. */
function versionIdentifier(value: unknown, path: string): string {
  const text = identifier(value, path);
  if (text.includes("+")) {
    fail(
      path,
      `contains "+", which joins version ids in a recorded identifier: ${describe(text)}.`,
    );
  }
  return text;
}

/** Words a person reads: present, and not only whitespace. */
function prose(value: unknown, path: string): string {
  const text = string(value, path);
  if (text.trim() === "") fail(path, "is empty.");
  return text;
}

function url(value: unknown, path: string): string {
  const text = string(value, path);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    fail(path, `should be an absolute URL, and is ${describe(text)}.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(path, `should be a web address, and is ${describe(text)}.`);
  }
  return text;
}

function zoned(value: unknown, path: string): string {
  const text = string(value, path);
  if (instantOf(text) !== null) return text;
  if (ZONELESS.test(text)) {
    fail(
      path,
      `is ${describe(text)}, which has no zone. gctl-terms read such a value as UTC, which put a German midnight an hour or two from where it was meant; a snapshot names its zone, as Z or an offset such as +01:00.`,
    );
  }
  fail(
    path,
    `is ${describe(text)}, which is not a real date-time with a zone, such as 2026-11-20T00:00:00+01:00.`,
  );
}

function languages(value: unknown, path: string, read: (v: unknown, p: string) => string) {
  const record = fields(value, path, ["en", "de"]);
  return Object.freeze({ en: read(record.en, `${path}.en`), de: read(record.de, `${path}.de`) });
}

function documentAt(value: unknown, path: string): SnapshotDocument {
  const record = fields(value, path, ["key", "product", "kind", "liveUrl"]);
  if (record.kind !== "consent" && record.kind !== "notice") {
    fail(`${path}.kind`, `should be "consent" or "notice", and is ${describe(record.kind)}.`);
  }
  const live = fields(record.liveUrl, `${path}.liveUrl`, ["en"], ["de"]);
  return Object.freeze({
    key: identifier(record.key, `${path}.key`),
    product: identifier(record.product, `${path}.product`),
    kind: record.kind,
    liveUrl: Object.freeze({
      en: url(live.en, `${path}.liveUrl.en`),
      ...(live.de === undefined ? {} : { de: url(live.de, `${path}.liveUrl.de`) }),
    }),
  });
}

function versionAt(value: unknown, path: string): SnapshotVersion {
  const record = fields(value, path, [
    "versionId",
    "document",
    "version",
    "title",
    "contentHash",
    "archiveUrl",
    "frozenAt",
  ]);
  const contentHash = string(record.contentHash, `${path}.contentHash`);
  if (!/^[0-9a-f]{64}$/u.test(contentHash)) {
    fail(
      `${path}.contentHash`,
      `should be a sha256 in lowercase hex, and is ${describe(contentHash)}.`,
    );
  }
  return Object.freeze({
    versionId: versionIdentifier(record.versionId, `${path}.versionId`),
    document: identifier(record.document, `${path}.document`),
    version: prose(record.version, `${path}.version`),
    title: languages(record.title, `${path}.title`, prose),
    contentHash,
    archiveUrl: languages(record.archiveUrl, `${path}.archiveUrl`, url),
    frozenAt: zoned(record.frozenAt, `${path}.frozenAt`),
  });
}

/** A capacity's name: lower case, digits and dashes, as products spell them. */
function capacityName(value: unknown, path: string): string {
  const text = string(value, path);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(text)) {
    fail(path, `should be lower case letters, digits and dashes, and is ${describe(text)}.`);
  }
  return text;
}

function surfaceAt(value: unknown, path: string): SnapshotSurface {
  const record = fields(value, path, ["id", "covers", "liveLinks"], ["capacities", "audiences"]);
  const covers = list(record.covers, `${path}.covers`).map((key, index) =>
    identifier(key, `${path}.covers[${index}]`),
  );
  const links = plain(record.liveLinks, `${path}.liveLinks`);
  const capacities =
    record.capacities === undefined
      ? undefined
      : list(record.capacities, `${path}.capacities`).map((name, index) =>
          capacityName(name, `${path}.capacities[${index}]`),
        );
  capacities?.forEach((name, index) => {
    if (capacities.indexOf(name) !== index) {
      fail(`${path}.capacities[${index}]`, `names ${JSON.stringify(name)} a second time.`);
    }
  });
  let audiences: Record<string, string> | undefined;
  if (record.audiences !== undefined) {
    const given = plain(record.audiences, `${path}.audiences`);
    audiences = {};
    for (const key of Object.keys(given)) {
      const where = `${path}.audiences[${JSON.stringify(key)}]`;
      identifier(key, `${path}.audiences key`);
      const capacity = capacityName(given[key], where);
      if (!covers.includes(key)) {
        fail(where, `is for ${JSON.stringify(key)}, which the surface does not cover.`);
      }
      if (capacities?.includes(capacity) !== true) {
        fail(
          where,
          `names the capacity ${JSON.stringify(capacity)}, which the surface does not declare.`,
        );
      }
      if (key === "page:gs:terms") {
        fail(
          where,
          "would bind the general terms to one capacity. Every product incorporates them by reference, so they bind every account.",
        );
      }
      audiences[key] = capacity;
    }
  }
  return Object.freeze({
    id: identifier(record.id, `${path}.id`),
    covers: Object.freeze(covers),
    liveLinks: Object.freeze(
      Object.fromEntries(
        Object.keys(links).map((key) => [
          identifier(key, `${path}.liveLinks key`),
          url(links[key], `${path}.liveLinks[${JSON.stringify(key)}]`),
        ]),
      ),
    ),
    ...(capacities === undefined ? {} : { capacities: Object.freeze(capacities) }),
    ...(audiences === undefined ? {} : { audiences: Object.freeze(audiences) }),
  });
}

function rolloutAt(value: unknown, path: string): SnapshotRollout {
  const record = fields(
    value,
    path,
    ["versionId", "surface", "announcedAt", "inForceFrom"],
    ["summary", "atOnce"],
  );
  if (record.surface !== null && typeof record.surface !== "string") {
    fail(`${path}.surface`, `should be a surface id or null, and is ${describe(record.surface)}.`);
  }
  if (
    record.atOnce !== undefined &&
    record.atOnce !== "editorial" &&
    record.atOnce !== "no-accounts"
  ) {
    fail(
      `${path}.atOnce`,
      `should be "editorial" or "no-accounts", and is ${describe(record.atOnce)}.`,
    );
  }
  return Object.freeze({
    versionId: versionIdentifier(record.versionId, `${path}.versionId`),
    surface: record.surface === null ? null : identifier(record.surface, `${path}.surface`),
    announcedAt: zoned(record.announcedAt, `${path}.announcedAt`),
    inForceFrom: zoned(record.inForceFrom, `${path}.inForceFrom`),
    ...(record.summary === undefined
      ? {}
      : { summary: languages(record.summary, `${path}.summary`, prose) }),
    ...(record.atOnce === undefined ? {} : { atOnce: record.atOnce as AtOnce }),
  });
}

/** One version placed on one surface by the rollout that dates it there. */
export interface Placement {
  readonly version: SnapshotVersion;
  readonly rollout: SnapshotRollout;
  readonly announced: number;
  readonly inForce: number;
}

/**
 * Every version of each document a surface covers, placed on that surface and
 * ordered oldest in force first, keyed by document.
 *
 * A version's rollout on a surface is the surface's own where it has one and
 * the version's default otherwise. A version with neither has no dates on that
 * surface and is not on it at all: it is archived, and nobody there has been
 * told when it binds, which is the state every version is in between being
 * frozen and being scheduled.
 *
 * Ordered by `inForceFrom`, never by where an entry sits in the snapshot.
 * parseSnapshot refuses two versions of one document coming into force at the
 * same instant on one surface, so on a checked snapshot the order is total.
 */
export function placementsOn(
  snapshot: Snapshot,
  surface: SnapshotSurface,
): ReadonlyMap<string, readonly Placement[]> {
  const own = new Map<string, SnapshotRollout>();
  const fallback = new Map<string, SnapshotRollout>();
  for (const rollout of snapshot.rollouts) {
    if (rollout.surface === surface.id) own.set(rollout.versionId, rollout);
    else if (rollout.surface === null) fallback.set(rollout.versionId, rollout);
  }
  const placements = new Map<string, Placement[]>(surface.covers.map((key) => [key, []]));
  for (const version of snapshot.versions) {
    const onSurface = placements.get(version.document);
    const rollout = own.get(version.versionId) ?? fallback.get(version.versionId);
    if (onSurface === undefined || rollout === undefined) continue;
    onSurface.push({
      version,
      rollout,
      announced: instantOf(rollout.announcedAt) ?? Number.NaN,
      inForce: instantOf(rollout.inForceFrom) ?? Number.NaN,
    });
  }
  for (const onSurface of placements.values()) onSurface.sort((a, b) => a.inForce - b.inForce);
  return placements;
}

/** The snapshots parseSnapshot built, so binding one it already checked does
 *  not check it again. Each is frozen, so it cannot change after the check. */
const CHECKED = new WeakSet<Snapshot>();

/**
 * Reads a snapshot, refusing it whole with a SnapshotError if anything in it
 * is malformed or contradicts the rules, and returns a frozen copy.
 *
 * Beyond the shape of every field, it refuses:
 *
 * - an instant without a zone (see `zoned`), or a date that does not exist;
 * - a field format 1 does not define, so a misspelt optional field cannot
 *   vanish unnoticed;
 * - two documents, versions or surfaces with one key or id, and two rollouts
 *   for one version on one surface (or two defaults for one version);
 * - a version of a document the snapshot does not hold, a rollout of a version
 *   it does not hold or for a surface it does not define;
 * - a surface covering a document the snapshot does not hold, a notice (read,
 *   never accepted, so never part of a consent identifier), or one document
 *   twice;
 * - a rollout in force before it is announced;
 * - two versions of one document coming into force at the same instant on one
 *   surface, because which one binds would then come down to array order;
 * - a capacity named twice, or an audience for a document the surface does
 *   not cover, naming a capacity it does not declare, or binding the general
 *   terms (which bind every account) to one capacity;
 * - a version that supersedes an earlier one on a surface and comes into force
 *   less than six weeks and a day after it is announced there (see
 *   notice.ts), unless its rollout says it binds at once and why (`atOnce`). The first version of a document on a surface supersedes
 *   nothing and is owed no notice: the versions archived before notice
 *   existed bind from the moment they were frozen, and agreements were
 *   recorded against them on that footing.
 *
 * A surface-specific rollout for a document the surface does not cover is not
 * refused, only unused: what a surface covers can change between snapshots,
 * and a rollout is history that outlives it.
 */
export function parseSnapshot(json: unknown): Snapshot {
  const root = fields(json, "snapshot", [
    "format",
    "serial",
    "generatedAt",
    "documents",
    "versions",
    "surfaces",
    "rollouts",
  ]);
  if (root.format !== 1) {
    fail(
      "snapshot.format",
      `is ${describe(root.format)}. This release reads format 1 only; a newer format needs a newer @ghub/terms-rules.`,
    );
  }
  if (typeof root.serial !== "number" || !Number.isSafeInteger(root.serial) || root.serial < 0) {
    fail("snapshot.serial", `should be a whole number from 0, and is ${describe(root.serial)}.`);
  }
  const generatedAt = zoned(root.generatedAt, "snapshot.generatedAt");

  const documents = list(root.documents, "snapshot.documents").map((value, index) =>
    documentAt(value, `snapshot.documents[${index}]`),
  );
  const documentByKey = new Map<string, SnapshotDocument>();
  documents.forEach((document, index) => {
    if (documentByKey.has(document.key)) {
      fail(`snapshot.documents[${index}].key`, `repeats ${JSON.stringify(document.key)}.`);
    }
    documentByKey.set(document.key, document);
  });

  const versions = list(root.versions, "snapshot.versions").map((value, index) =>
    versionAt(value, `snapshot.versions[${index}]`),
  );
  const versionIds = new Set<string>();
  versions.forEach((version, index) => {
    const path = `snapshot.versions[${index}]`;
    if (versionIds.has(version.versionId)) {
      fail(`${path}.versionId`, `repeats ${JSON.stringify(version.versionId)}.`);
    }
    versionIds.add(version.versionId);
    if (!documentByKey.has(version.document)) {
      fail(`${path}.document`, `names ${JSON.stringify(version.document)}, which no document has.`);
    }
  });

  const surfaces = list(root.surfaces, "snapshot.surfaces").map((value, index) =>
    surfaceAt(value, `snapshot.surfaces[${index}]`),
  );
  const surfaceIds = new Set<string>();
  surfaces.forEach((surface, index) => {
    const path = `snapshot.surfaces[${index}]`;
    if (surfaceIds.has(surface.id)) fail(`${path}.id`, `repeats ${JSON.stringify(surface.id)}.`);
    surfaceIds.add(surface.id);
    if (surface.covers.length === 0) fail(`${path}.covers`, "is empty, so it records nothing.");
    surface.covers.forEach((key, at) => {
      const document = documentByKey.get(key);
      if (document === undefined) {
        fail(`${path}.covers[${at}]`, `names ${JSON.stringify(key)}, which no document has.`);
      }
      if (document.kind !== "consent") {
        fail(
          `${path}.covers[${at}]`,
          `names ${JSON.stringify(key)}, a notice. A notice is read, never accepted, so it is never part of what a surface records.`,
        );
      }
      if (surface.covers.indexOf(key) !== at) {
        fail(`${path}.covers[${at}]`, `names ${JSON.stringify(key)} a second time.`);
      }
    });
  });

  const rollouts = list(root.rollouts, "snapshot.rollouts").map((value, index) =>
    rolloutAt(value, `snapshot.rollouts[${index}]`),
  );
  const rolloutKeys = new Set<string>();
  rollouts.forEach((rollout, index) => {
    const path = `snapshot.rollouts[${index}]`;
    if (!versionIds.has(rollout.versionId)) {
      fail(
        `${path}.versionId`,
        `names ${JSON.stringify(rollout.versionId)}, which no version has.`,
      );
    }
    if (rollout.surface !== null && !surfaceIds.has(rollout.surface)) {
      fail(`${path}.surface`, `names ${JSON.stringify(rollout.surface)}, which no surface has.`);
    }
    // Ids are printable ASCII, so a NUL cannot occur inside either half.
    const key = `${rollout.versionId}\u0000${rollout.surface ?? ""}`;
    if (rolloutKeys.has(key)) {
      fail(
        path,
        `is a second rollout of ${JSON.stringify(rollout.versionId)} ${rollout.surface === null ? "by default" : `on ${JSON.stringify(rollout.surface)}`}. Which dates applied would come down to array order.`,
      );
    }
    rolloutKeys.add(key);
    if ((instantOf(rollout.inForceFrom) ?? 0) < (instantOf(rollout.announcedAt) ?? 0)) {
      fail(
        `${path}.inForceFrom`,
        "is before announcedAt: a version cannot bind before its notice.",
      );
    }
  });

  const snapshot: Snapshot = Object.freeze({
    format: 1 as const,
    serial: root.serial,
    generatedAt,
    documents: Object.freeze(documents),
    versions: Object.freeze(versions),
    surfaces: Object.freeze(surfaces),
    rollouts: Object.freeze(rollouts),
  });

  for (const surface of surfaces) {
    for (const [key, placed] of placementsOn(snapshot, surface)) {
      placed.forEach((entry, index) => {
        const where = `snapshot.rollouts: ${JSON.stringify(entry.version.versionId)} on ${JSON.stringify(surface.id)}`;
        const previous = placed[index - 1];
        if (previous === undefined) return;
        if (previous.inForce === entry.inForce) {
          fail(
            where,
            `comes into force at the same instant as ${JSON.stringify(previous.version.versionId)}, another version of ${JSON.stringify(key)}. Which one binds would come down to array order.`,
          );
        }
        // A version that binds at once says why nobody is owed notice.
        if (
          entry.rollout.atOnce === undefined &&
          entry.inForce < earliestInForceAt(entry.announced)
        ) {
          fail(
            where,
            `supersedes ${JSON.stringify(previous.version.versionId)} and is in force ${entry.rollout.inForceFrom}, less than six weeks and a day after it is announced (${entry.rollout.announcedAt}): the earliest is ${new Date(earliestInForceAt(entry.announced)).toISOString()}, 43 full days and the same Berlin clock time 43 days on, whichever is later. The notice mail may leave a day after the announcement, and the six weeks run from the mail.`,
          );
        }
      });
    }
  }

  CHECKED.add(snapshot);
  return snapshot;
}

/** The snapshot itself if parseSnapshot built it, and parseSnapshot's reading
 *  of it otherwise. */
export function checked(snapshot: Snapshot): Snapshot {
  return CHECKED.has(snapshot) ? snapshot : parseSnapshot(snapshot);
}
