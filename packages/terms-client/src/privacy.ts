/**
 * Privacy requests: a person asking for erasure, or objecting to processing
 * (Art. 17 and 21 GDPR), handled across the products from GPlatform Terms.
 *
 * Staff record the request in Terms and decide, per product and per kind of
 * data, whether it is kept, pseudonymised or deleted. A product says what it
 * holds as a catalogue of categories, takes the runs Terms has queued for its
 * surface, carries each out (or, in a dry run, counts what it would touch) and
 * reports back. Terms never calls a product: the product asks, which is why
 * this rides the same scheduler as the outbox flush.
 */

import { array, object, string, UnreadableAnswerError } from "./wire.js";

/** What can happen to one kind of data. */
export type PrivacyAction = "keep" | "pseudonymise" | "delete";

const ACTIONS: ReadonlySet<string> = new Set<PrivacyAction>(["keep", "pseudonymise", "delete"]);

/** One kind of data a product holds about a person, and what it can do with it. */
export interface ErasureCategory {
  /** Stable, the product's own: what a plan names. A letter, then letters and digits. */
  readonly id: string;
  readonly label: string;
  /** One or two sentences: what is in it, and what each action does to it. */
  readonly detail: string;
  readonly actions: readonly PrivacyAction[];
  /** What the console preselects. One of `actions`. */
  readonly default: PrivacyAction;
  /** Categories that cannot outlive this one: deleting it deletes them. The
   *  service refuses a plan that deletes this one and keeps one of those. */
  readonly takesWithIt?: readonly string[];
}

/** One instruction from Terms, as the product receives it. */
export interface PrivacyRun {
  readonly id: string;
  /** `DSR-<day>-<n>`: name it in logs and audit entries instead of the person. */
  readonly reference: string;
  readonly kind: "erasure" | "objection" | "restriction" | "other";
  readonly subject: {
    readonly email: string | null;
    /** `{ github: "login" }`: how products know the person besides the address. */
    readonly identifiers: Readonly<Record<string, string>>;
    /** This product's own account ids that Terms knows at the address. */
    readonly accountIds: readonly string[];
  };
  /** One action per category of the catalogue. */
  readonly plan: Readonly<Record<string, PrivacyAction>>;
  /** False: a dry run, which reports and changes nothing. */
  readonly execute: boolean;
}

/** What a product found and did (or, in a dry run, would do), per category. */
export interface PrivacyReport {
  readonly found: Readonly<Record<string, number>>;
  readonly done: Readonly<
    Record<string, { readonly action: PrivacyAction; readonly count: number }>
  >;
  /** What stays whatever the plan says, and why. */
  readonly kept?: readonly { readonly what: string; readonly why: string }[];
  readonly notes?: readonly string[];
}

export type PrivacyRunResult =
  | { readonly ok: true; readonly report: PrivacyReport }
  | { readonly ok: false; readonly error: string };

/** What `handlePrivacyRuns` needs from the product. */
export interface PrivacyHandler {
  /** Everything the product holds about people, published on the first pass
   *  of each process and then every `publishEveryMs`. */
  readonly catalogue: readonly ErasureCategory[];
  /** Carries one run out, or counts it when `run.execute` is false. Throw to
   *  report the run as failed, with the error's message as the reason. */
  readonly carryOut: (run: PrivacyRun) => Promise<PrivacyReport>;
  /** An hour. */
  readonly publishEveryMs?: number;
}

/** What one `handlePrivacyRuns` pass did. */
export interface PrivacyPassReport {
  readonly published: boolean;
  readonly taken: number;
  /** Carried out (or counted) and reported. */
  readonly done: number;
  /** Failed, and reported as failed. */
  readonly failed: number;
  /** Whose report did not arrive. Terms offers the run again after its lease. */
  readonly unreported: number;
}

/** The longest reason for a failure the service takes. */
export const PRIVACY_ERROR_MAX = 2_000;

function strings(value: unknown, path: string): Record<string, string> {
  const fields = object(value, path);
  for (const [key, one] of Object.entries(fields)) string(one, `${path}.${key}`);
  return fields as Record<string, string>;
}

/** The answer of `POST /api/v1/privacy-runs/{surface}/take`. What a run is
 *  carried out by is checked; a field the service adds later is ignored. */
export function readPrivacyRuns(json: unknown): PrivacyRun[] {
  const runs = array(object(json, "privacy runs")["runs"], "privacy runs.runs");
  return runs.map((value, index): PrivacyRun => {
    const path = `privacy runs.runs[${String(index)}]`;
    const run = object(value, path);
    const subject = object(run["subject"], `${path}.subject`);
    const plan = strings(run["plan"], `${path}.plan`);
    for (const [category, action] of Object.entries(plan)) {
      if (!ACTIONS.has(action)) {
        throw new UnreadableAnswerError(`${path}.plan.${category} is not an action: ${action}.`);
      }
    }
    const execute = run["execute"];
    if (typeof execute !== "boolean") {
      throw new UnreadableAnswerError(`${path}.execute is not a boolean.`);
    }
    const email = subject["email"];
    return {
      id: string(run["id"], `${path}.id`),
      reference: string(run["reference"], `${path}.reference`),
      kind: string(run["kind"], `${path}.kind`) as PrivacyRun["kind"],
      subject: {
        email: email === null ? null : string(email, `${path}.subject.email`),
        identifiers: strings(subject["identifiers"], `${path}.subject.identifiers`),
        accountIds: array(subject["accountIds"], `${path}.subject.accountIds`).map((one, i) =>
          string(one, `${path}.subject.accountIds[${String(i)}]`),
        ),
      },
      plan: plan as Record<string, PrivacyAction>,
      execute,
    };
  });
}

export function catalogueBody(categories: readonly ErasureCategory[]): Record<string, unknown> {
  return {
    categories: categories.map((one) => ({
      id: one.id,
      label: one.label,
      detail: one.detail,
      actions: [...one.actions],
      default: one.default,
      takesWithIt: [...(one.takesWithIt ?? [])],
    })),
  };
}

export function reportBody(result: PrivacyRunResult): Record<string, unknown> {
  if (!result.ok) {
    const error = result.error.trim().slice(0, PRIVACY_ERROR_MAX);
    return { ok: false, error: error === "" ? "The product failed without saying why." : error };
  }
  return {
    ok: true,
    report: {
      found: result.report.found,
      done: result.report.done,
      kept: result.report.kept ?? [],
      notes: result.report.notes ?? [],
    },
  };
}
