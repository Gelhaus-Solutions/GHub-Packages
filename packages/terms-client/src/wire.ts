/**
 * What crosses the wire between a product and GPlatform Terms, as this client
 * sends and reads it.
 *
 * The service validates what it receives strictly and is the authority on the
 * shapes. This side reads its answers tolerantly on purpose: a field the
 * service adds later is ignored rather than refused, so a product running an
 * older client keeps working while the service moves on. What the client acts
 * on (the state, an outcome, an instant) is checked, and an answer that does
 * not carry it is treated as no answer at all.
 *
 * Instants travel as ISO 8601 strings with a zone and are read into Dates
 * here; an instant without a zone is refused, never read as UTC.
 */

import type { ConsentAnnouncement, ConsentState, DocumentStandingKind } from "@ghub/terms-rules";

export type Locale = "en" | "de";

/** What a product knows about one of its accounts, pushed whole every time. */
export interface SubjectFacts {
  /** The address notices go to. */
  readonly email: string;
  /** Null or absent where the product does not know; notices are then English. */
  readonly locale?: Locale | null;
  /** The product's own word on whether the account pays. Paid is never
   *  restricted. */
  readonly paid: boolean;
  /** Gelhaus Solutions' own staff, who are not gated. */
  readonly staff?: boolean;
  /**
   * Every capacity the account acts in, each declared on the surface, the
   * whole list each time. Leave it out on a surface without capacities: absent
   * leaves the service's list as it was, and an empty list clears it.
   */
  readonly capacities?: readonly string[];
}

/** What a product may say an acceptance came through. */
export type ProductConsentSource = "sign-up" | "accept-screen" | "migration";

/** One acceptance, as the product saw it happen. */
export interface ConsentToRecord {
  readonly surface: string;
  readonly accountId: string;
  /** The identifier accepting recorded, `a+b+c`, exactly as versionToRecord
   *  gave it at the instant the person accepted. */
  readonly recorded: string;
  readonly acceptedAt: Date;
  readonly source: ProductConsentSource;
  /**
   * The product's own name for this acceptance, unique to it: the id of the
   * row the product wrote for it is the natural one. Sending the same
   * reference again returns the first row rather than writing a second, which
   * is what makes delivery from the outbox safe to repeat.
   */
  readonly requestRef: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/** One row of the consent ledger, as the service returns it. Instants are
 *  strings with a zone, as recorded. */
export interface ConsentRow {
  readonly seq: number;
  readonly surface: string;
  readonly recorded: string;
  readonly versionIds: readonly string[];
  readonly acceptedAt: string | null;
  readonly recordedAt: string;
  readonly source: string;
  readonly requestRef: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly evidenceHash: string;
  readonly rowHash: string;
}

/** An objection on file, shown beside the state. It never changes it. */
export interface Objection {
  readonly id: string;
  readonly versionId: string;
  readonly receivedAt: Date;
  readonly channel: "mail" | "letter" | "other";
  readonly note: string | null;
}

/** Where an account stands with one covered document, by version id. */
export interface DocumentStandingSummary {
  readonly document: string;
  /** The capacity it binds, or null where it binds every account. */
  readonly audience: string | null;
  readonly kind: DocumentStandingKind;
  /** The version of it the account accepted, if any. */
  readonly accepted: string | null;
  /** The version of it in force at the instant asked, if any. */
  readonly inForce: string | null;
  /** The version accepting at the instant asked records for it. */
  readonly toRecord: string | null;
  /** For `asked`: when the first version not accepted comes into force. */
  readonly acceptBy: Date | null;
}

/**
 * One account's own record, for the product's "export my data": its consents,
 * the notices sent to it and its objections, on its own surface only. Passed
 * through as the service sends it, instants as strings, because it goes into
 * an export as it is.
 */
export interface OwnRecord {
  readonly subject: Readonly<Record<string, unknown>>;
  readonly consents: readonly ConsentRow[];
  readonly notices: readonly Readonly<Record<string, unknown>>[];
  readonly objections: readonly Readonly<Record<string, unknown>>[];
}

/** The body of `PUT /api/v1/subjects/{surface}/{accountId}`. */
export function subjectBody(
  facts: SubjectFacts,
  status: "active" | "closed",
  closedAt?: Date,
): Record<string, unknown> {
  return {
    email: facts.email,
    locale: facts.locale ?? null,
    paid: facts.paid,
    staff: facts.staff ?? false,
    status,
    ...(closedAt === undefined ? {} : { closedAt: isoOf(closedAt, "closedAt") }),
    ...(facts.capacities === undefined ? {} : { capacities: [...facts.capacities] }),
  };
}

/** The body of `POST /api/v1/consents`. */
export function consentBody(consent: ConsentToRecord): Record<string, unknown> {
  return {
    surface: consent.surface,
    accountId: consent.accountId,
    recorded: consent.recorded,
    acceptedAt: isoOf(consent.acceptedAt, "acceptedAt"),
    source: consent.source,
    requestRef: consent.requestRef,
    ip: consent.ip ?? null,
    userAgent: consent.userAgent ?? null,
  };
}

function isoOf(value: Date, what: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${what} must be a valid Date.`);
  }
  return value.toISOString();
}

/** An answer that does not have the shape this client acts on. */
export class UnreadableAnswerError extends Error {
  override readonly name: string = "UnreadableAnswerError";
}

type Fields = Readonly<Record<string, unknown>>;

function object(value: unknown, path: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UnreadableAnswerError(`${path} is not an object.`);
  }
  return value as Fields;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw new UnreadableAnswerError(`${path} is not a string.`);
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new UnreadableAnswerError(`${path} is not a list.`);
  return value;
}

const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u;

function instant(value: unknown, path: string): Date {
  const text = string(value, path);
  const at = ZONED.test(text) ? new Date(text) : null;
  if (at === null || Number.isNaN(at.getTime())) {
    throw new UnreadableAnswerError(`${path} is not an instant with a zone: ${text}.`);
  }
  return at;
}

function nullableInstant(value: unknown, path: string): Date | null {
  return value === null || value === undefined ? null : instant(value, path);
}

const STANDING_KINDS: ReadonlySet<string> = new Set([
  "current",
  "asked",
  "behind",
  "linked",
  "not-binding",
]);

export function stateOf(value: unknown, path: string): ConsentState {
  const fields = object(value, path);
  switch (fields["kind"]) {
    case "agreed":
    case "owed-paid":
    case "restricted":
    case "exempt":
      return { kind: fields["kind"] };
    case "asked":
      return { kind: "asked", inForceFrom: instant(fields["inForceFrom"], `${path}.inForceFrom`) };
    default:
      throw new UnreadableAnswerError(`${path}.kind is not a state this client knows.`);
  }
}

/** The parts of `GET /api/v1/state/...` a standing carries. */
export interface StateAnswer {
  readonly at: Date;
  readonly snapshot: number;
  readonly state: ConsentState;
  readonly recorded: string | null;
  readonly toRecord: string;
  readonly documents: readonly DocumentStandingSummary[];
  readonly announcements: readonly ConsentAnnouncement[];
  readonly objections: readonly Objection[];
}

export function readStateAnswer(json: unknown): StateAnswer {
  const root = object(json, "state");
  const snapshot = root["snapshot"];
  if (typeof snapshot !== "number" || !Number.isSafeInteger(snapshot)) {
    throw new UnreadableAnswerError("state.snapshot is not a whole number.");
  }
  return {
    at: instant(root["at"], "state.at"),
    snapshot,
    state: stateOf(root["state"], "state.state"),
    recorded: nullableString(root["recorded"], "state.recorded"),
    toRecord: string(root["toRecord"], "state.toRecord"),
    documents: array(root["documents"], "state.documents").map((value, index) => {
      const path = `state.documents[${String(index)}]`;
      const fields = object(value, path);
      const kind = string(fields["kind"], `${path}.kind`);
      if (!STANDING_KINDS.has(kind)) {
        throw new UnreadableAnswerError(`${path}.kind is not a standing this client knows.`);
      }
      return {
        document: string(fields["document"], `${path}.document`),
        audience: nullableString(fields["audience"] ?? null, `${path}.audience`),
        kind: kind as DocumentStandingKind,
        accepted: nullableString(fields["accepted"] ?? null, `${path}.accepted`),
        inForce: nullableString(fields["inForce"] ?? null, `${path}.inForce`),
        toRecord: nullableString(fields["toRecord"] ?? null, `${path}.toRecord`),
        acceptBy: nullableInstant(fields["acceptBy"], `${path}.acceptBy`),
      };
    }),
    announcements: array(root["announcements"], "state.announcements").map((value, index) => {
      const path = `state.announcements[${String(index)}]`;
      const fields = object(value, path);
      const summary = fields["summary"];
      return {
        versionId: string(fields["versionId"], `${path}.versionId`),
        inForceFrom: instant(fields["inForceFrom"], `${path}.inForceFrom`),
        ...(summary === undefined || summary === null
          ? {}
          : {
              summary: {
                en: string(object(summary, `${path}.summary`)["en"], `${path}.summary.en`),
                de: string(object(summary, `${path}.summary`)["de"], `${path}.summary.de`),
              },
            }),
      };
    }),
    objections: array(root["objections"] ?? [], "state.objections").map((value, index) => {
      const path = `state.objections[${String(index)}]`;
      const fields = object(value, path);
      const channel = fields["channel"];
      return {
        id: string(fields["id"], `${path}.id`),
        versionId: string(fields["versionId"], `${path}.versionId`),
        receivedAt: instant(fields["receivedAt"], `${path}.receivedAt`),
        channel: channel === "mail" || channel === "letter" ? channel : "other",
        note: nullableString(fields["note"] ?? null, `${path}.note`),
      };
    }),
  };
}

/** `POST /api/v1/consents`: the row, and whether it was written now or
 *  already had been under the same reference. */
export function readConsentAnswer(json: unknown): {
  readonly consent: ConsentRow;
  readonly outcome: "recorded" | "replayed";
} {
  const root = object(json, "consent answer");
  const outcome = root["outcome"];
  if (outcome !== "recorded" && outcome !== "replayed") {
    throw new UnreadableAnswerError("consent answer.outcome is neither recorded nor replayed.");
  }
  const consent = object(root["consent"], "consent answer.consent");
  if (typeof consent["seq"] !== "number") {
    throw new UnreadableAnswerError("consent answer.consent.seq is not a number.");
  }
  string(consent["rowHash"], "consent answer.consent.rowHash");
  return { consent: consent as unknown as ConsentRow, outcome };
}

export function readOwnRecord(json: unknown): OwnRecord {
  const root = object(json, "own record");
  object(root["subject"], "own record.subject");
  array(root["consents"], "own record.consents");
  array(root["notices"], "own record.notices");
  array(root["objections"], "own record.objections");
  return root as unknown as OwnRecord;
}
