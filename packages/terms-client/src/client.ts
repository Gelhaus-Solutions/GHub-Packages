import { randomUUID } from "node:crypto";
import {
  offline,
  PINNED_KEYS,
  type ConsentAnnouncement,
  type ConsentState,
  type PinnedKey,
  type Terms,
} from "@ghub/terms-rules";
import {
  baseUrlOf,
  jsonOf,
  refusalOf,
  send,
  TermsApiError,
  type Answer,
  type FetchLike,
  type HttpOptions,
} from "./http.js";
import {
  isOutage,
  isRetryable,
  nextAttemptAfter,
  type OutboxEntry,
  type OutboxKind,
  type OutboxStore,
} from "./outbox.js";
import {
  catalogueBody,
  readPrivacyRuns,
  reportBody,
  type ErasureCategory,
  type PrivacyHandler,
  type PrivacyPassReport,
  type PrivacyRun,
  type PrivacyRunResult,
} from "./privacy.js";
import { SnapshotCache, type SnapshotSource, type SnapshotStore } from "./snapshot-cache.js";
import {
  consentBody,
  readConsentAnswer,
  readOwnRecord,
  readStateAnswer,
  subjectBody,
  type ConsentRow,
  type ConsentToRecord,
  type DocumentStandingSummary,
  type Objection,
  type OwnRecord,
  type SubjectFacts,
} from "./wire.js";

/**
 * The client a product uses to ask GPlatform Terms where an account stands and
 * to tell it what happened: one per process, server side only, the same for a
 * NestJS product and a Next.js one.
 *
 * The rule it is built around: **if the service is down, nobody is locked
 * out.** A standing is asked of the service, which knows every acceptance in
 * the ledger; when it cannot answer, the standing is decided here, from the
 * newest verified snapshot held and the product's own last known record (the
 * `termsAcceptedVersion` every product keeps for exactly this). An acceptance
 * and a subject push are written to the product's outbox before they are
 * sent, and whatever does not arrive now arrives on a later flush, once.
 *
 * Self-hosted deployments never use this client: they decide from the
 * snapshot bundled with @ghub/terms-rules and never talk to the service.
 */

export interface TermsClientOptions {
  /** `https://terms.gplatform.org`. */
  readonly baseUrl: string;
  /** The product's key, `gpt_prod_...`, from the product's own secret store. */
  readonly apiKey: string;
  readonly outbox: OutboxStore;
  /** The keys a snapshot may be signed with. Those @ghub/terms-rules pins,
   *  unless a test signs its own. */
  readonly keys?: readonly PinnedKey[];
  /** The floor: the rules bound to the snapshot this release carries.
   *  @ghub/terms-rules' offline() unless given; null for none. */
  readonly bundled?: (() => Terms) | null;
  /** Where the last fetched snapshot is kept between processes, if anywhere. */
  readonly snapshotStore?: SnapshotStore | null;
  readonly fetch?: FetchLike;
  /** The clock, for the instants this client stamps and schedules by. Never
   *  read for a rule a caller asks with an instant of its own. */
  readonly clock?: () => Date;
  /** How long one request may take. 3 seconds. */
  readonly timeoutMs?: number;
  /** How often the snapshot is checked for a newer one. 15 minutes. */
  readonly refreshEveryMs?: number;
  /** How long a flush holds an entry it is sending. 2 minutes. */
  readonly leaseMs?: number;
  /** Told of everything that went wrong and did not reach the caller: a
   *  refresh that failed, an entry parked, a standing decided locally.
   *  console.warn unless given. */
  readonly onError?: (error: unknown, context: string) => void;
}

/** What the product itself knows of an account, for deciding without the
 *  service. */
export interface LocalRecord {
  /** The product's own last known record: its `termsAcceptedVersion`. */
  readonly recorded: string | null;
  readonly paid: boolean;
  readonly staff?: boolean;
  readonly capacities?: readonly string[];
}

/**
 * Where an account stands, and who decided it.
 *
 * - `gpterms`: the service, from its ledger.
 * - `snapshot`: this client, from the newest snapshot held and the product's
 *   own record, because the service could not answer or had not yet been told
 *   of everything in the outbox. `why` says which.
 * - `none`: nothing could decide: no snapshot is held and the service is not
 *   reachable. `state` is null. Do not gate on it: nobody is locked out
 *   because the service is down.
 */
export interface Standing {
  readonly source: "gpterms" | "snapshot" | "none";
  readonly why: string | null;
  readonly at: Date;
  /** The serial of the snapshot it was decided from. */
  readonly snapshot: number | null;
  readonly state: ConsentState | null;
  /** What the account last accepted on the surface, as the decider knows it. */
  readonly recorded: string | null;
  /** What accepting at `at` records. */
  readonly toRecord: string | null;
  readonly documents: readonly DocumentStandingSummary[];
  readonly announcements: readonly ConsentAnnouncement[];
  /** Objections on file; only the service knows them. */
  readonly objections: readonly Objection[];
}

/** Where an outbox entry is after this call: arrived, waiting for a later
 *  flush, or parked for a person because the service refused what it says. */
export type Delivery = "delivered" | "queued" | "parked";

export interface Queued {
  readonly id: string;
  /** Settles once the first attempt is over, and never rejects. Nothing need
   *  wait for it: the entry is in the outbox either way. */
  readonly delivery: Promise<Delivery>;
}

export interface RecordOutcome {
  readonly requestRef: string;
  /** `recorded` new, `replayed` under a reference the service already had,
   *  `queued` for a later flush, `parked` for a person. */
  readonly outcome: "recorded" | "replayed" | "queued" | "parked";
  /** The ledger row, where this call delivered it. */
  readonly consent: ConsentRow | null;
  /** Why it did not arrive now. */
  readonly why: string | null;
}

export interface FlushReport {
  readonly delivered: number;
  readonly retrying: number;
  readonly parked: number;
}

export interface ReadyReport {
  readonly snapshot: number | null;
  readonly source: SnapshotSource | null;
}

type ProductRules = Pick<
  Terms,
  | "consentStateAt"
  | "versionToRecord"
  | "announcementsDue"
  | "consentLinks"
  | "documentsFor"
  | "documentStandings"
>;

export interface TermsClient extends ProductRules {
  /**
   * Reads the bundled and stored snapshots and asks the service for a newer
   * one. Await it once at start. Never throws: a product that cannot reach
   * the service at start still starts.
   */
  ready(): Promise<ReadyReport>;
  /** Asks the service for a newer snapshot now. Throws what went wrong. */
  refreshSnapshot(): Promise<void>;
  /** The rules bound to the newest verified snapshot held, for anything not
   *  bound here. Throws TermsUnavailableError while none is held. */
  terms(): Terms;
  /** An account's standing on its surface, from the service where it can
   *  answer and from the snapshot and `local` where it cannot. `at` defaults
   *  to the service's now, or this client's clock when deciding locally. */
  stateOf(surface: string, accountId: string, local: LocalRecord, at?: Date): Promise<Standing>;
  /** Tells the service about an account: on sign-up and whenever its email,
   *  locale, paid, staff or capacities change. Returns once it is in the
   *  outbox; never waits on the service. */
  upsertSubject(surface: string, accountId: string, facts: SubjectFacts): Promise<Queued>;
  /** Tells the service an account is closed. Closed accounts are never sent
   *  notices; their record is kept for its retention. */
  closeSubject(
    surface: string,
    accountId: string,
    facts: SubjectFacts,
    closedAt: Date,
  ): Promise<Queued>;
  /** Records an acceptance: into the outbox, then to the service, waiting at
   *  most one request's timeout. Never throws for the service being down. */
  recordConsent(consent: ConsentToRecord): Promise<RecordOutcome>;
  /** The account's own record for its data export. Throws a TermsApiError
   *  while the service cannot answer; the export is retried, not faked. */
  ownRecord(surface: string, accountId: string): Promise<OwnRecord>;
  /** Sends whatever is due in the outbox. Call it from the product's own
   *  scheduler, every minute or so. */
  flushOutbox(options?: {
    readonly rounds?: number;
    readonly batch?: number;
  }): Promise<FlushReport>;
  /** Tells the service what the product holds about people, as kinds of data
   *  with what it can do to each. Staff choose from it per request. */
  publishErasureCatalogue(surface: string, categories: readonly ErasureCategory[]): Promise<void>;
  /** The privacy runs waiting for the surface, marked taken. One taken and
   *  never reported is offered again after the service's lease. */
  takePrivacyRuns(surface: string): Promise<PrivacyRun[]>;
  /** What a run found and did, or why it failed. Once per run. */
  reportPrivacyRun(surface: string, runId: string, result: PrivacyRunResult): Promise<void>;
  /**
   * One pass over the surface's privacy requests: publishes the catalogue when
   * due, takes the runs, carries each out with `handler.carryOut` and reports
   * it. Call it from the product's own scheduler, beside `flushOutbox`.
   * Throws when the catalogue or the runs cannot be exchanged; a run that
   * throws is reported as failed, and one whose report does not arrive is
   * offered again by the service after its lease.
   */
  handlePrivacyRuns(surface: string, handler: PrivacyHandler): Promise<PrivacyPassReport>;
}

interface Attempt {
  readonly delivery: Delivery;
  readonly answer: unknown;
  readonly error: TermsApiError | null;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_REFRESH_MS = 15 * 60_000;
const DEFAULT_LEASE_MS = 2 * 60_000;
const DEFAULT_PUBLISH_EVERY_MS = 60 * 60_000;
const REFRESH_RETRY_MS = 60_000;
/**
 * How long a person's request stops asking the service after it failed to
 * answer one. A service that accepts connections and then hangs would
 * otherwise cost every gate check its full timeout; for this long, standings
 * are decided here and acceptances go straight to the outbox, while the
 * scheduled flush and the snapshot refresh keep trying.
 */
export const QUIET_AFTER_FAILURE_MS = 30_000;
/** How many entries of one account one call sends at most, oldest first. */
const ACCOUNT_ROUNDS = 20;
/** How many deliveries a flush runs at once. */
const FLUSH_CONCURRENCY = 8;

function warn(error: unknown, context: string): void {
  console.warn(
    `@ghub/terms-client: ${context}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function required(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${what} must be a non-empty string.`);
  }
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createTermsClient(options: TermsClientOptions): TermsClient {
  return new Client(options);
}

class Client implements TermsClient {
  private readonly http: HttpOptions;
  private readonly outbox: OutboxStore;
  private readonly clock: () => Date;
  private readonly leaseMs: number;
  private readonly report: (error: unknown, context: string) => void;
  private readonly cache: SnapshotCache;
  /** One promise per account with work in flight, so this process sends one
   *  account's entries one after another. */
  private readonly chains = new Map<string, Promise<void>>();
  /** Until when a person's request does not ask the service. */
  private quietUntil = Number.NEGATIVE_INFINITY;
  /** When each surface's erasure catalogue was last published, in ms. */
  private readonly published = new Map<string, number>();

  constructor(options: TermsClientOptions) {
    this.http = {
      baseUrl: baseUrlOf(options.baseUrl),
      apiKey: required(options.apiKey, "apiKey"),
      fetch: options.fetch ?? ((input, init) => fetch(input, init)),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    if (options.outbox === undefined || options.outbox === null) {
      throw new TypeError(
        "outbox is required: an acceptance made while GPlatform Terms is unreachable has to be kept somewhere.",
      );
    }
    this.outbox = options.outbox;
    this.clock = options.clock ?? (() => new Date());
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    const onError = options.onError ?? warn;
    this.report = (error, context) => {
      try {
        onError(error, context);
      } catch {
        // A reporter that throws must not turn a reported failure into a
        // failed request.
      }
    };
    this.cache = new SnapshotCache({
      http: this.http,
      keys: options.keys ?? PINNED_KEYS,
      bundled: options.bundled === undefined ? offline : options.bundled,
      store: options.snapshotStore ?? null,
      clock: this.clock,
      refreshEveryMs: options.refreshEveryMs ?? DEFAULT_REFRESH_MS,
      retryAfterMs: REFRESH_RETRY_MS,
      report: this.report,
    });
  }

  // --- the rules, bound to the newest snapshot -----------------------------

  consentStateAt: Terms["consentStateAt"] = (...args) => this.cache.terms().consentStateAt(...args);
  versionToRecord: Terms["versionToRecord"] = (...args) =>
    this.cache.terms().versionToRecord(...args);
  announcementsDue: Terms["announcementsDue"] = (...args) =>
    this.cache.terms().announcementsDue(...args);
  consentLinks: Terms["consentLinks"] = (...args) => this.cache.terms().consentLinks(...args);
  documentsFor: Terms["documentsFor"] = (...args) => this.cache.terms().documentsFor(...args);
  documentStandings: Terms["documentStandings"] = (...args) =>
    this.cache.terms().documentStandings(...args);

  terms(): Terms {
    return this.cache.terms();
  }

  async ready(): Promise<ReadyReport> {
    await this.cache.load();
    try {
      await this.cache.refresh();
    } catch (error) {
      this.report(error, "fetching the snapshot at start");
    }
    return { snapshot: this.cache.serial, source: this.cache.source };
  }

  refreshSnapshot(): Promise<void> {
    return this.cache.refresh();
  }

  // --- standings -----------------------------------------------------------

  async stateOf(
    surface: string,
    accountId: string,
    local: LocalRecord,
    at?: Date,
  ): Promise<Standing> {
    required(surface, "surface");
    required(accountId, "accountId");
    await this.cache.load();
    const quiet = this.quietReason();
    if (quiet !== null) return this.decideLocally(surface, local, at ?? this.clock(), quiet);
    // Whatever of this account is still in the outbox goes first: until it
    // arrives, the service answers without it, and an acceptance just made
    // would read as missing.
    let waiting = 0;
    try {
      if ((await this.undelivered(surface, accountId)) > 0) {
        await this.serially(surface, accountId, () => this.drain(surface, accountId));
        waiting = await this.undelivered(surface, accountId);
      }
    } catch (error) {
      this.report(error, `reading the outbox for ${surface}/${accountId}`);
    }
    if (waiting > 0) {
      return this.decideLocally(
        surface,
        local,
        at ?? this.clock(),
        `${String(waiting)} entr${waiting === 1 ? "y" : "ies"} for this account not yet delivered`,
      );
    }
    try {
      const query = at === undefined ? "" : `?at=${encodeURIComponent(at.toISOString())}`;
      const answer = await this.call(
        "GET",
        `v1/state/${encodeURIComponent(surface)}/${encodeURIComponent(accountId)}${query}`,
      );
      if (answer.status !== 200) throw refusalOf(answer, "the state");
      const read = readStateAnswer(jsonOf(answer, "the state"));
      this.cache.refreshIfBehind(read.snapshot);
      return { source: "gpterms", why: null, ...read };
    } catch (error) {
      this.report(error, `asking the state of ${surface}/${accountId}; deciding from the snapshot`);
      return this.decideLocally(surface, local, at ?? this.clock(), messageOf(error));
    }
  }

  private async undelivered(surface: string, accountId: string): Promise<number> {
    const pending = await this.outbox.pendingFor(surface, accountId);
    return pending.filter((entry) => entry.nextAttemptAt !== null).length;
  }

  private decideLocally(surface: string, local: LocalRecord, at: Date, why: string): Standing {
    const none = (reason: string): Standing => ({
      source: "none",
      why: reason,
      at,
      snapshot: null,
      state: null,
      recorded: local.recorded,
      toRecord: null,
      documents: [],
      announcements: [],
      objections: [],
    });
    this.cache.refreshIfDue();
    const terms = this.cache.peek();
    if (terms === null) return none(`${why}; and no snapshot is held to decide from`);
    const capacities = local.capacities ?? [];
    try {
      const state = terms.consentStateAt(surface, local.recorded, at, {
        paid: local.paid,
        staff: local.staff ?? false,
        capacities,
      });
      const documents = terms
        .documentStandings(surface, local.recorded, at, capacities)
        .map((one) => ({
          document: one.document,
          audience: one.audience,
          kind: one.kind,
          accepted: one.accepted?.versionId ?? null,
          inForce: one.inForce?.versionId ?? null,
          toRecord: one.toRecord?.versionId ?? null,
          acceptBy: one.acceptBy,
        }));
      return {
        source: "snapshot",
        why,
        at,
        snapshot: terms.snapshot.serial,
        state,
        recorded: local.recorded,
        toRecord: terms.versionToRecord(surface, at, capacities),
        documents,
        announcements: terms.announcementsDue(surface, at, capacities),
        objections: [],
      };
    } catch (error) {
      this.report(error, `deciding ${surface} from snapshot ${String(terms.snapshot.serial)}`);
      return none(`${why}; and the snapshot cannot decide: ${messageOf(error)}`);
    }
  }

  // --- subjects and acceptances --------------------------------------------

  upsertSubject(surface: string, accountId: string, facts: SubjectFacts): Promise<Queued> {
    return this.enqueue("subject", surface, accountId, subjectBody(facts, "active"), randomUUID());
  }

  closeSubject(
    surface: string,
    accountId: string,
    facts: SubjectFacts,
    closedAt: Date,
  ): Promise<Queued> {
    return this.enqueue(
      "subject",
      surface,
      accountId,
      subjectBody(facts, "closed", closedAt),
      randomUUID(),
    );
  }

  private async enqueue(
    kind: OutboxKind,
    surface: string,
    accountId: string,
    body: Record<string, unknown>,
    id: string,
  ): Promise<Queued> {
    await this.add(kind, surface, accountId, body, id);
    const delivery = this.serially(surface, accountId, () =>
      this.drain(surface, accountId, id),
    ).then(
      (attempts) => attempts.get(id)?.delivery ?? "queued",
      (error: unknown) => {
        this.report(error, `sending ${kind} ${id} for ${surface}/${accountId}`);
        return "queued" as const;
      },
    );
    return { id, delivery };
  }

  private async add(
    kind: OutboxKind,
    surface: string,
    accountId: string,
    body: Record<string, unknown>,
    id: string,
  ): Promise<void> {
    required(surface, "surface");
    required(accountId, "accountId");
    const now = this.clock();
    await this.outbox.add({
      id,
      kind,
      surface,
      accountId,
      body: JSON.stringify(body),
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
    });
  }

  async recordConsent(consent: ConsentToRecord): Promise<RecordOutcome> {
    const requestRef = required(consent.requestRef, "requestRef");
    required(consent.recorded, "recorded");
    await this.add("consent", consent.surface, consent.accountId, consentBody(consent), requestRef);
    const quiet = this.quietReason();
    if (quiet !== null) return { requestRef, outcome: "queued", consent: null, why: quiet };
    let attempts: ReadonlyMap<string, Attempt>;
    try {
      attempts = await this.serially(consent.surface, consent.accountId, () =>
        this.drain(consent.surface, consent.accountId, requestRef),
      );
    } catch (error) {
      this.report(error, `sending consent ${requestRef}`);
      return { requestRef, outcome: "queued", consent: null, why: messageOf(error) };
    }
    const mine = attempts.get(requestRef);
    if (mine?.delivery === "delivered") {
      try {
        const read = readConsentAnswer(mine.answer);
        return { requestRef, outcome: read.outcome, consent: read.consent, why: null };
      } catch (error) {
        this.report(error, `reading the answer to consent ${requestRef}`);
        return { requestRef, outcome: "recorded", consent: null, why: null };
      }
    }
    if (mine !== undefined) {
      return {
        requestRef,
        outcome: mine.delivery === "parked" ? "parked" : "queued",
        consent: null,
        why: mine.error?.message ?? null,
      };
    }
    // Not attempted by this call: something older it waits for is still
    // undelivered, or another flush holds it, or another flush already sent it.
    const pending = await this.outbox.pendingFor(consent.surface, consent.accountId);
    const entry = pending.find((one) => one.id === requestRef);
    if (entry === undefined) {
      return { requestRef, outcome: "recorded", consent: null, why: null };
    }
    return {
      requestRef,
      outcome: entry.nextAttemptAt === null ? "parked" : "queued",
      consent: null,
      why: entry.lastError ?? "an older entry of this account is waiting to be delivered first",
    };
  }

  async ownRecord(surface: string, accountId: string): Promise<OwnRecord> {
    required(surface, "surface");
    required(accountId, "accountId");
    const answer = await this.call(
      "GET",
      `v1/subjects/${encodeURIComponent(surface)}/${encodeURIComponent(accountId)}/record`,
    );
    if (answer.status !== 200) throw refusalOf(answer, "the account's own record");
    return readOwnRecord(jsonOf(answer, "the account's own record"));
  }

  // --- privacy requests ----------------------------------------------------

  async publishErasureCatalogue(
    surface: string,
    categories: readonly ErasureCategory[],
  ): Promise<void> {
    required(surface, "surface");
    const answer = await this.call("PUT", `v1/erasure-catalogues/${encodeURIComponent(surface)}`, {
      json: JSON.stringify(catalogueBody(categories)),
    });
    if (answer.status !== 200) throw refusalOf(answer, "the erasure catalogue");
    this.published.set(surface, this.clock().getTime());
  }

  async takePrivacyRuns(surface: string): Promise<PrivacyRun[]> {
    required(surface, "surface");
    const answer = await this.call("POST", `v1/privacy-runs/${encodeURIComponent(surface)}/take`);
    if (answer.status !== 200) throw refusalOf(answer, "the privacy runs");
    return readPrivacyRuns(jsonOf(answer, "the privacy runs"));
  }

  async reportPrivacyRun(surface: string, runId: string, result: PrivacyRunResult): Promise<void> {
    required(surface, "surface");
    required(runId, "runId");
    const answer = await this.call(
      "POST",
      `v1/privacy-runs/${encodeURIComponent(surface)}/${encodeURIComponent(runId)}/report`,
      { json: JSON.stringify(reportBody(result)) },
    );
    if (answer.status !== 200) throw refusalOf(answer, `the report of privacy run ${runId}`);
  }

  async handlePrivacyRuns(surface: string, handler: PrivacyHandler): Promise<PrivacyPassReport> {
    const every = handler.publishEveryMs ?? DEFAULT_PUBLISH_EVERY_MS;
    const last = this.published.get(surface);
    const due = last === undefined || this.clock().getTime() - last >= every;
    if (due) await this.publishErasureCatalogue(surface, handler.catalogue);
    const runs = await this.takePrivacyRuns(surface);
    let done = 0;
    let failed = 0;
    let unreported = 0;
    for (const run of runs) {
      let result: PrivacyRunResult;
      try {
        result = { ok: true, report: await handler.carryOut(run) };
      } catch (error) {
        this.report(error, `${run.execute ? "carrying out" : "counting"} ${run.reference}`);
        result = { ok: false, error: messageOf(error) };
      }
      try {
        await this.reportPrivacyRun(surface, run.id, result);
        if (result.ok) done += 1;
        else failed += 1;
      } catch (error) {
        this.report(error, `reporting ${run.reference}; it is offered again after its lease`);
        unreported += 1;
      }
    }
    return { published: due, taken: runs.length, done, failed, unreported };
  }

  // --- talking to the service ----------------------------------------------

  /** One request, and the pause after a failure to answer kept up to date. */
  private async call(
    method: "GET" | "PUT" | "POST",
    path: string,
    options: { readonly json?: string } = {},
  ): Promise<Answer> {
    try {
      const answer = await send(this.http, method, path, options);
      this.quietUntil =
        answer.status >= 500
          ? this.clock().getTime() + QUIET_AFTER_FAILURE_MS
          : Number.NEGATIVE_INFINITY;
      return answer;
    } catch (error) {
      if (error instanceof TermsApiError && error.status === null) {
        this.quietUntil = this.clock().getTime() + QUIET_AFTER_FAILURE_MS;
      }
      throw error;
    }
  }

  /** Why a person's request does not ask the service now, or null. */
  private quietReason(): string | null {
    if (this.clock().getTime() >= this.quietUntil) return null;
    return `GPlatform Terms did not answer a moment ago; it is asked again from ${new Date(this.quietUntil).toISOString()}`;
  }

  // --- the outbox ----------------------------------------------------------

  async flushOutbox(
    options: { readonly rounds?: number; readonly batch?: number } = {},
  ): Promise<FlushReport> {
    const rounds = options.rounds ?? 10;
    const batch = options.batch ?? 100;
    let delivered = 0;
    let retrying = 0;
    let parked = 0;
    for (let round = 0; round < rounds; round += 1) {
      const now = this.clock();
      const due = await this.outbox.lease(now, this.leaseEnd(now), batch);
      if (due.length === 0) break;
      const results = await inPool(due, FLUSH_CONCURRENCY, (entry) =>
        this.serially(entry.surface, entry.accountId, () => this.deliver(entry)),
      );
      for (const result of results) {
        if (result.delivery === "delivered") delivered += 1;
        else if (result.delivery === "parked") parked += 1;
        else retrying += 1;
      }
    }
    return { delivered, retrying, parked };
  }

  private leaseEnd(now: Date): Date {
    return new Date(now.getTime() + this.leaseMs);
  }

  /**
   * Sends one account's due entries oldest first, until one does not arrive,
   * none is left, or `until` has had its attempt. A call that queued one entry
   * stops at it, so the entry queued after it by the next call is that call's
   * to send and to report on.
   */
  private async drain(
    surface: string,
    accountId: string,
    until?: string,
  ): Promise<Map<string, Attempt>> {
    const attempts = new Map<string, Attempt>();
    for (let round = 0; round < ACCOUNT_ROUNDS; round += 1) {
      const now = this.clock();
      const [entry] = await this.outbox.lease(now, this.leaseEnd(now), 1, { surface, accountId });
      if (entry === undefined) break;
      const attempt = await this.deliver(entry);
      attempts.set(entry.id, attempt);
      if (entry.id === until) break;
      // When the service is not answering, the rest would fail the same way;
      // a refusal of this one entry says nothing about the next.
      if (attempt.delivery === "queued" && isOutage(attempt.error?.status ?? null)) break;
    }
    return attempts;
  }

  /** One attempt at one entry, and the outbox told how it went. */
  private async deliver(entry: OutboxEntry): Promise<Attempt> {
    let error: TermsApiError;
    try {
      const answer = await this.call(
        entry.kind === "subject" ? "PUT" : "POST",
        entry.kind === "subject"
          ? `v1/subjects/${encodeURIComponent(entry.surface)}/${encodeURIComponent(entry.accountId)}`
          : "v1/consents",
        { json: entry.body },
      );
      if (answer.status >= 200 && answer.status < 300) {
        try {
          await this.outbox.remove(entry.id);
        } catch (removal) {
          // It arrived; sending it again later is a replay the service
          // answers with the same row.
          this.report(removal, `removing delivered entry ${entry.id} from the outbox`);
        }
        if (entry.kind === "subject") await this.wakeAcceptances(entry.surface, entry.accountId);
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(answer.text) as unknown;
        } catch {
          // Delivered all the same; the caller is told it has no row to show.
        }
        return { delivery: "delivered", answer: parsed, error: null };
      }
      error = refusalOf(answer, `${entry.kind} ${entry.id}`);
    } catch (failure) {
      error =
        failure instanceof TermsApiError
          ? failure
          : new TermsApiError(
              null,
              null,
              `sending ${entry.kind} ${entry.id}: ${messageOf(failure)}`,
            );
    }
    const attempts = entry.attempts + 1;
    const retry = isRetryable(error.status, error.code);
    await this.outbox.reschedule(entry.id, {
      attempts,
      nextAttemptAt: retry ? nextAttemptAfter(this.clock(), attempts) : null,
      lastError: error.message,
    });
    if (!retry) {
      this.report(
        error,
        `parked ${entry.kind} ${entry.id} for ${entry.surface}/${entry.accountId}`,
      );
    }
    return { delivery: retry ? "queued" : "parked", answer: null, error };
  }

  /**
   * Makes an account's acceptances that are waiting to be retried due now,
   * once a push of the account has arrived: the one most likely to have held
   * them back was the service not knowing the account yet, and waiting out
   * their back-off would leave a person's acceptance out of the ledger for no
   * reason.
   */
  private async wakeAcceptances(surface: string, accountId: string): Promise<void> {
    try {
      const now = this.clock();
      for (const entry of await this.outbox.pendingFor(surface, accountId)) {
        if (
          entry.kind === "consent" &&
          entry.attempts > 0 &&
          entry.nextAttemptAt !== null &&
          entry.nextAttemptAt.getTime() > now.getTime()
        ) {
          await this.outbox.reschedule(entry.id, {
            attempts: entry.attempts,
            nextAttemptAt: now,
            lastError: entry.lastError ?? "",
          });
        }
      }
    } catch (error) {
      this.report(error, `making ${surface}/${accountId}'s waiting acceptances due`);
    }
  }

  /** Runs `work` after whatever this process already has in flight for the
   *  account, whether that succeeded or not. */
  private serially<T>(surface: string, accountId: string, work: () => Promise<T>): Promise<T> {
    const key = `${surface}\u0000${accountId}`;
    const before = this.chains.get(key) ?? Promise.resolve();
    const run = before.then(work);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, tail);
    void tail.then(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return run;
  }
}

/** `work` over every item, at most `size` at once, results in item order. */
async function inPool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
