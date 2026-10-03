/**
 * The client against a stand-in for the service on a real port, stopped and
 * started the way an outage stops and starts the real one. Every instant is
 * fixed; the clock moves only when a test moves it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTermsClient,
  QUIET_AFTER_FAILURE_MS,
  type TermsClient,
  type TermsClientOptions,
} from "./client.js";
import { TermsApiError } from "./http.js";
import { memoryOutboxStore, FIRST_RETRY_MS } from "./outbox.js";
import type { PrivacyRun } from "./privacy.js";
import type { StoredSnapshot } from "./snapshot-cache.js";
import { API_KEY, fakeTerms, type FakeTerms } from "./testing/fake-terms.js";
import {
  bundledAs,
  GENERAL,
  RECORDED_V1,
  RECORDED_V2,
  signed,
  signer,
  SURFACE,
  V2,
  V2_IN_FORCE,
} from "./testing/snapshots.js";

const KEY = signer();
const ELSEWHERE = signer("gpterms-snapshot", 9);
/** Between the announcement of the second version and the day it binds. */
const ANNOUNCED = new Date("2036-03-10T12:00:00+01:00");
const AFTER = new Date("2036-04-20T12:00:00+02:00");

let api: FakeTerms;
let now: Date;
let errors: string[];

beforeEach(async () => {
  api = await fakeTerms();
  api.serve(signed(KEY, 2), 2);
  now = ANNOUNCED;
  errors = [];
});

afterEach(async () => {
  await api.close();
});

function client(options: Partial<TermsClientOptions> = {}) {
  const outbox = memoryOutboxStore();
  const made = createTermsClient({
    baseUrl: api.url,
    apiKey: API_KEY,
    outbox,
    keys: [KEY.pinned],
    bundled: null,
    clock: () => now,
    timeoutMs: 1_000,
    onError: (error, context) => errors.push(`${context}: ${(error as Error).message}`),
    ...options,
  });
  return { client: made, outbox };
}

function accept(made: TermsClient, requestRef: string, recorded = RECORDED_V2, acceptedAt = now) {
  return made.recordConsent({
    surface: SURFACE,
    accountId: "acct-1",
    recorded,
    acceptedAt,
    source: "accept-screen",
    requestRef,
    ip: "203.0.113.7",
    userAgent: "test",
  });
}

const FACTS = { email: "person@example.org", paid: false };

describe("with the service down", () => {
  it("still answers the state and queues an acceptance that lands once when it is back", async () => {
    await api.stop();
    const { client: made, outbox } = client({ bundled: bundledAs(KEY, 2) });
    expect(await made.ready()).toEqual({ snapshot: 2, source: "bundled" });

    // A free account that accepted only the first version, after the second
    // binds: the snapshot and the product's own record decide, and say so.
    now = AFTER;
    const behind = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V1, paid: false });
    expect(behind.source).toBe("snapshot");
    expect(behind.state).toEqual({ kind: "restricted" });
    expect(behind.toRecord).toBe(RECORDED_V2);
    expect(behind.why).toMatch(/could not be reached/);

    const pushed = await made.upsertSubject(SURFACE, "acct-1", FACTS);
    expect(await pushed.delivery).toBe("queued");
    const acceptedAt = now;
    const outcome = await accept(made, "cc-acceptance-1");
    expect(outcome).toMatchObject({
      requestRef: "cc-acceptance-1",
      outcome: "queued",
      consent: null,
    });
    expect(outbox.entries().map((entry) => entry.kind)).toEqual(["subject", "consent"]);

    // The product wrote its own record when the person accepted, so its
    // fallback reads them as agreed while the outbox still holds the row.
    const agreed = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(agreed).toMatchObject({ source: "snapshot", state: { kind: "agreed" } });

    await api.start();
    // Nothing is due before its retry time; then both go, in order.
    expect(await made.flushOutbox()).toEqual({ delivered: 0, retrying: 0, parked: 0 });
    now = new Date(now.getTime() + FIRST_RETRY_MS);
    expect(await made.flushOutbox()).toEqual({ delivered: 2, retrying: 0, parked: 0 });
    expect(api.ledger).toHaveLength(1);
    expect(api.ledger[0]).toMatchObject({ requestRef: "cc-acceptance-1", recorded: RECORDED_V2 });
    expect(outbox.entries()).toEqual([]);

    // Once: a second flush has nothing, and the product retrying its own
    // request under the same reference gets the first row back.
    expect(await made.flushOutbox()).toEqual({ delivered: 0, retrying: 0, parked: 0 });
    const again = await accept(made, "cc-acceptance-1", RECORDED_V2, acceptedAt);
    expect(again.outcome).toBe("replayed");
    expect(again.consent?.seq).toBe(1);
    expect(api.ledger).toHaveLength(1);

    const live = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(live).toMatchObject({ source: "gpterms", state: { kind: "agreed" } });
  });

  it("says nothing could decide, rather than locking anybody out, when no snapshot is held", async () => {
    await api.stop();
    const { client: made } = client();
    expect(await made.ready()).toEqual({ snapshot: null, source: null });
    const standing = await made.stateOf(SURFACE, "acct-1", { recorded: null, paid: false });
    expect(standing.source).toBe("none");
    expect(standing.state).toBeNull();
    expect(standing.why).toMatch(/no snapshot is held/);
    expect(() => made.versionToRecord(SURFACE, now)).toThrow(/No verified snapshot is held/);
  });

  it("says so when the product sends the same reference for a different acceptance", async () => {
    const { client: made } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    expect((await accept(made, "twice-1")).outcome).toBe("recorded");
    now = new Date(now.getTime() + 1_000);
    const second = await accept(made, "twice-1");
    expect(second.outcome).toBe("parked");
    expect(second.why).toMatch(/consent\.replay-differs/);
    expect(api.ledger).toHaveLength(1);
  });

  it("refuses the account's own record rather than inventing one", async () => {
    await api.stop();
    const { client: made } = client({ bundled: bundledAs(KEY, 2) });
    await expect(made.ownRecord(SURFACE, "acct-1")).rejects.toBeInstanceOf(TermsApiError);
  });

  it("decides from the snapshot it stored, when one is newer than the bundled one", async () => {
    const kept: StoredSnapshot[] = [];
    const store = {
      load: () => Promise.resolve(kept.at(-1) ?? null),
      save: (snapshot: StoredSnapshot) => {
        kept.push(snapshot);
        return Promise.resolve();
      },
    };
    const first = client({ bundled: bundledAs(KEY, 1), snapshotStore: store });
    expect(await first.client.ready()).toEqual({ snapshot: 2, source: "fetched" });
    expect(kept).toHaveLength(1);

    await api.stop();
    const second = client({ bundled: bundledAs(KEY, 1), snapshotStore: store });
    expect(await second.client.ready()).toEqual({ snapshot: 2, source: "stored" });
    expect(second.client.versionToRecord(SURFACE, AFTER)).toBe(RECORDED_V2);
  });
});

describe("with the service up", () => {
  it("asks the service, and reads an answer with fields it does not know", async () => {
    const { client: made } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    const standing = await made.stateOf(
      SURFACE,
      "acct-1",
      { recorded: RECORDED_V1, paid: false },
      ANNOUNCED,
    );
    // The service's ledger, not the product's record, decides: nothing is in
    // the ledger, so a free account is restricted whatever the product says.
    expect(standing).toMatchObject({
      source: "gpterms",
      why: null,
      state: { kind: "restricted" },
      recorded: null,
      toRecord: RECORDED_V2,
    });
  });

  it("records a sign-up's push and its acceptance in that order, both at once", async () => {
    const { client: made, outbox } = client();
    await made.ready();
    const pushed = await made.upsertSubject(SURFACE, "acct-1", FACTS);
    const outcome = await accept(made, "signup-1");
    expect(await pushed.delivery).toBe("delivered");
    expect(outcome.outcome).toBe("recorded");
    expect(outcome.consent).toMatchObject({ seq: 1, recorded: RECORDED_V2 });
    expect(outbox.entries()).toEqual([]);
    expect(api.requests.filter((one) => !one.endsWith("/snapshot"))).toEqual([
      "PUT /api/v1/subjects/example/acct-1",
      "POST /api/v1/consents",
    ]);

    const standing = await made.stateOf(SURFACE, "acct-1", { recorded: null, paid: false }, AFTER);
    expect(standing).toMatchObject({
      source: "gpterms",
      snapshot: 2,
      state: { kind: "agreed" },
      recorded: RECORDED_V2,
    });
    expect(standing.at).toEqual(AFTER);
  });

  it("reports the second version as asked, with its date and summary, before it binds", async () => {
    const { client: made } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    await accept(made, "v1-1", RECORDED_V1);
    const standing = await made.stateOf(SURFACE, "acct-1", { recorded: null, paid: false }, now);
    expect(standing.state).toEqual({ kind: "asked", inForceFrom: V2_IN_FORCE });
    expect(standing.announcements).toEqual([
      {
        versionId: V2,
        inForceFrom: V2_IN_FORCE,
        summary: { en: "What changes.", de: "Was sich ändert." },
      },
    ]);
    expect(standing.documents.map((one) => [one.document, one.kind, one.toRecord])).toEqual([
      ["project:example:terms", "asked", V2],
      ["page:gs:terms", "current", GENERAL],
    ]);
  });

  it("parks an acceptance the service cannot read, and the account's next entry still goes", async () => {
    const { client: made, outbox } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    const unreadable = await accept(made, "bad-1", "not-a-version+gs-terms-2026-01-01");
    expect(unreadable.outcome).toBe("parked");
    expect(unreadable.why).toMatch(/consent\.unreadable/);
    expect(errors.some((line) => line.startsWith("parked consent bad-1"))).toBe(true);

    const fine = await accept(made, "good-1");
    expect(fine.outcome).toBe("recorded");
    expect(outbox.entries()).toMatchObject([
      { id: "bad-1", attempts: 1, nextAttemptAt: null, lastError: expect.stringMatching(/422/) },
    ]);
    // A parked entry is not waiting to be delivered, so the service answers.
    const standing = await made.stateOf(SURFACE, "acct-1", { recorded: null, paid: false });
    expect(standing.source).toBe("gpterms");
  });

  it("retries what failed for when it was sent, later and later", async () => {
    const { client: made, outbox } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    api.refusals.push({ status: 503, code: "unavailable", message: "Restarting." });
    expect((await accept(made, "later-1")).outcome).toBe("queued");
    expect(outbox.entries()[0]).toMatchObject({
      attempts: 1,
      nextAttemptAt: new Date(now.getTime() + FIRST_RETRY_MS),
    });

    // Asked while it waits, the standing is decided locally, because the
    // service would answer without the acceptance; asking sends it first, and
    // the service is still refusing.
    api.refusals.push({ status: 503, code: "unavailable", message: "Restarting." });
    now = new Date(now.getTime() + FIRST_RETRY_MS);
    const waiting = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(waiting).toMatchObject({ source: "snapshot", state: { kind: "agreed" } });
    expect(waiting.why).toMatch(/1 entry for this account not yet delivered/);
    expect(outbox.entries()[0]).toMatchObject({
      attempts: 2,
      nextAttemptAt: new Date(now.getTime() + 2 * FIRST_RETRY_MS),
    });

    now = new Date(now.getTime() + 2 * FIRST_RETRY_MS);
    expect(await made.flushOutbox()).toEqual({ delivered: 1, retrying: 0, parked: 0 });
    expect(api.ledger.map((row) => row.requestRef)).toEqual(["later-1"]);
  });

  it("keeps an acceptance for an account the service has not been told of, until it is", async () => {
    const { client: made, outbox } = client();
    await made.ready();
    expect((await accept(made, "early-1")).outcome).toBe("queued");
    expect(outbox.entries()[0]?.lastError).toMatch(/subject\.unknown/);
    // The push queued after it does not wait for it, or neither would ever go;
    // once it arrives, the acceptance is due at once rather than after its
    // back-off.
    expect(await (await made.upsertSubject(SURFACE, "acct-1", FACTS)).delivery).toBe("delivered");
    expect(await made.flushOutbox()).toEqual({ delivered: 1, retrying: 0, parked: 0 });
    expect(api.ledger.map((row) => row.requestRef)).toEqual(["early-1"]);
  });

  it("closes an account with the instant it closed", async () => {
    const { client: made } = client();
    await made.ready();
    const closed = await made.closeSubject(SURFACE, "acct-1", FACTS, now);
    expect(await closed.delivery).toBe("delivered");
    expect(api.subjects.get(`${SURFACE}/acct-1`)).toEqual({
      email: "person@example.org",
      locale: null,
      paid: false,
      staff: false,
      status: "closed",
      closedAt: "2036-03-10T11:00:00.000Z",
    });
  });

  it("returns the account's own record for its export", async () => {
    const { client: made } = client();
    await made.ready();
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    await accept(made, "export-1");
    const record = await made.ownRecord(SURFACE, "acct-1");
    expect(record.consents.map((one) => one.requestRef)).toEqual(["export-1"]);
  });
});

describe("privacy requests", () => {
  const CATALOGUE = [
    {
      id: "account",
      label: "Account",
      detail: "Name and address.",
      actions: ["pseudonymise", "delete"],
      default: "pseudonymise",
      takesWithIt: ["answers"],
    },
    {
      id: "answers",
      label: "Answers",
      detail: "What they wrote.",
      actions: ["keep", "delete"],
      default: "delete",
    },
  ] as const;
  const REPORT = {
    found: { account: 1, answers: 2 },
    done: { answers: { action: "delete", count: 2 } },
  } as const;

  function queue(
    id: string,
    execute: boolean,
    plan: Record<string, string> = { account: "pseudonymise", answers: "delete" },
  ) {
    api.privacyRuns.push({
      surface: SURFACE,
      run: {
        id,
        reference: `DSR-2036-03-10-${id}`,
        kind: "erasure",
        subject: {
          email: "person@example.org",
          identifiers: { github: "someone" },
          accountIds: ["acct-1"],
        },
        plan,
        execute,
        addedLater: "a field this client does not know",
      },
      state: "queued",
      report: null,
    });
  }

  it("publishes the catalogue when due, carries out each run and reports it, a failure as failed", async () => {
    const { client: made } = client();
    queue("run-1", false);
    queue("run-2", true);
    const seen: string[] = [];
    const handler = {
      catalogue: CATALOGUE,
      carryOut: (run: PrivacyRun) => {
        seen.push(`${run.reference} ${String(run.execute)} ${run.subject.accountIds.join(",")}`);
        return run.execute
          ? Promise.reject(new Error("the database said no"))
          : Promise.resolve(REPORT);
      },
    };
    expect(await made.handlePrivacyRuns(SURFACE, handler)).toEqual({
      published: true,
      taken: 2,
      done: 1,
      failed: 1,
      unreported: 0,
    });
    expect(api.catalogues.get(SURFACE)).toEqual({
      categories: [CATALOGUE[0], { ...CATALOGUE[1], takesWithIt: [] }],
    });
    expect(seen).toEqual(["DSR-2036-03-10-run-1 false acct-1", "DSR-2036-03-10-run-2 true acct-1"]);
    expect(api.privacyRuns.map((one) => one.report)).toEqual([
      { ok: true, report: { ...REPORT, kept: [], notes: [] } },
      { ok: false, error: "the database said no" },
    ]);
    expect(errors).toEqual([
      expect.stringMatching(/^carrying out DSR-2036-03-10-run-2: the database said no/),
    ]);

    // Within the hour the catalogue is not sent again, and nothing is left to take.
    now = new Date(now.getTime() + 30 * 60_000);
    expect(await made.handlePrivacyRuns(SURFACE, handler)).toMatchObject({
      published: false,
      taken: 0,
    });
    now = new Date(now.getTime() + 31 * 60_000);
    expect(await made.handlePrivacyRuns(SURFACE, handler)).toMatchObject({ published: true });
  });

  it("counts a run whose report did not arrive as unreported, and throws when the service is down", async () => {
    const { client: made } = client();
    await made.publishErasureCatalogue(SURFACE, CATALOGUE);
    queue("run-3", true);
    const pass = await made.handlePrivacyRuns(SURFACE, {
      catalogue: CATALOGUE,
      carryOut: () => {
        api.refusals.push({ status: 503, code: "unavailable", message: "Down for a moment." });
        return Promise.resolve(REPORT);
      },
    });
    expect(pass).toEqual({ published: false, taken: 1, done: 0, failed: 0, unreported: 1 });
    expect(api.privacyRuns[0]?.state).toBe("taken");

    await api.stop();
    await expect(made.takePrivacyRuns(SURFACE)).rejects.toBeInstanceOf(TermsApiError);
  });

  it("refuses a run with an action it does not know, rather than guessing", async () => {
    const { client: made } = client();
    queue("run-4", true, { account: "anonymise" });
    await expect(made.takePrivacyRuns(SURFACE)).rejects.toThrow(/plan\.account is not an action/);
  });
});

describe("the snapshot", () => {
  it("is refused when its signature is from a key this release does not pin, and the held one stays", async () => {
    api.serve(signed(ELSEWHERE, 2), 2);
    const { client: made } = client({ bundled: bundledAs(KEY, 1) });
    expect(await made.ready()).toEqual({ snapshot: 1, source: "bundled" });
    expect(errors.join("\n")).toMatch(/does not pin/);
  });

  it("is refused when it was changed after signing", async () => {
    const { text, signature } = signed(KEY, 2);
    api.serve({ text: text.replace('"serial":2', '"serial":3'), signature }, 3);
    const { client: made } = client({ bundled: bundledAs(KEY, 1) });
    expect(await made.ready()).toMatchObject({ snapshot: 1 });
    expect(errors.join("\n")).toMatch(/signature does not hold/);
  });

  it("never goes back to an older serial", async () => {
    api.serve(signed(KEY, 1), 1);
    const { client: made } = client({ bundled: bundledAs(KEY, 2) });
    expect(await made.ready()).toEqual({ snapshot: 2, source: "bundled" });
    expect(errors.join("\n")).toMatch(/older than the 2 held/);
  });

  it("is asked for again with its ETag after the interval, and a 304 keeps it", async () => {
    const { client: made } = client();
    await made.ready();
    const asked = () => api.requests.filter((one) => one === "GET /api/v1/snapshot").length;
    expect(asked()).toBe(1);
    made.versionToRecord(SURFACE, now);
    expect(asked()).toBe(1);
    now = new Date(now.getTime() + 15 * 60_000);
    made.versionToRecord(SURFACE, now);
    await made.refreshSnapshot();
    expect(asked()).toBeGreaterThanOrEqual(2);
    expect(made.terms().snapshot.serial).toBe(2);
  });

  it("is fetched again as soon as the service answers from a newer one", async () => {
    api.serve(signed(KEY, 1), 1);
    const { client: made } = client();
    expect(await made.ready()).toMatchObject({ snapshot: 1 });
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    api.serve(signed(KEY, 2), 2);
    now = new Date(now.getTime() + 60_000);
    await made.stateOf(SURFACE, "acct-1", { recorded: null, paid: false });
    await made.refreshSnapshot();
    expect(made.terms().snapshot.serial).toBe(2);
  });
});

describe("options", () => {
  it("refuses a base URL that is not http or https, and a missing key", () => {
    expect(() =>
      createTermsClient({ baseUrl: "ftp://x", apiKey: "k", outbox: memoryOutboxStore() }),
    ).toThrow(/not http or https/);
    expect(() =>
      createTermsClient({ baseUrl: "https://x", apiKey: " ", outbox: memoryOutboxStore() }),
    ).toThrow(/apiKey/);
  });

  it("gives up on a request that takes longer than its timeout, and asks nothing for a while after", async () => {
    let hanging = true;
    let asked = 0;
    const { client: made, outbox } = client({
      bundled: bundledAs(KEY, 2),
      timeoutMs: 50,
      fetch: (input, init) => {
        // The snapshot refresh runs in the background on its own schedule;
        // what is counted here is what a person's request waits for.
        if (!input.endsWith("/snapshot")) asked += 1;
        if (!hanging) return fetch(input, init);
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
        });
      },
    });
    const standing = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(standing.source).toBe("snapshot");
    expect(standing.why).toMatch(/no answer within 50 ms/);
    expect(asked).toBe(1);

    // For the next half minute a person's request does not wait on it again.
    const next = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(next.source).toBe("snapshot");
    expect(next.why).toMatch(
      /did not answer a moment ago; it is asked again from 2036-03-10T11:00:30.000Z/,
    );
    const queued = await accept(made, "quiet-1");
    expect(queued).toMatchObject({ outcome: "queued", why: expect.stringMatching(/a moment ago/) });
    expect(outbox.entries().map((one) => one.id)).toEqual(["quiet-1"]);
    expect(asked).toBe(1);

    // The scheduled flush still tries, and after the pause requests ask again.
    hanging = false;
    now = new Date(now.getTime() + QUIET_AFTER_FAILURE_MS);
    await (
      await made.upsertSubject(SURFACE, "acct-1", FACTS)
    ).delivery;
    expect(await made.flushOutbox()).toEqual({ delivered: 1, retrying: 0, parked: 0 });
    const back = await made.stateOf(SURFACE, "acct-1", { recorded: RECORDED_V2, paid: false });
    expect(back.why).toBeNull();
    expect(back.source).toBe("gpterms");
  });
});
