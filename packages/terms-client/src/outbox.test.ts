/**
 * What every outbox store has to do, asked of the one in memory always and of
 * the Postgres one when TERMS_CLIENT_TEST_DATABASE_URL names a database to
 * try it in. Each Postgres run makes a schema of its own and drops it after,
 * so it never touches anything it did not make.
 */

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIRST_RETRY_MS,
  isRetryable,
  memoryOutboxStore,
  nextAttemptAfter,
  RETRY_CEILING_MS,
  type OutboxEntry,
  type OutboxKind,
  type OutboxStore,
} from "./outbox.js";
import { OUTBOX_TABLE_SQL, postgresOutboxStore } from "./postgres-outbox.js";

const T0 = new Date("2036-03-10T12:00:00+01:00");
const later = (ms: number) => new Date(T0.getTime() + ms);
const LEASE = later(120_000);

let made = 0;
function entry(kind: OutboxKind, accountId: string, id?: string): OutboxEntry {
  made += 1;
  return {
    id: id ?? `e${String(made)}`,
    kind,
    surface: "example",
    accountId,
    body: JSON.stringify({ kind, accountId }),
    // A millisecond apart, in the order made, as a product adds them.
    createdAt: later(made),
    attempts: 0,
    nextAttemptAt: T0,
    lastError: null,
  };
}

const ids = (entries: readonly OutboxEntry[]) => entries.map((one) => one.id);

function contract(name: string, fresh: () => Promise<OutboxStore>) {
  describe(name, () => {
    it("keeps an entry once, however often it is added", async () => {
      const store = await fresh();
      const one = entry("consent", "a", "ref-1");
      await store.add(one);
      await store.add({ ...one, body: "{}" });
      expect(await store.pendingFor("example", "a")).toEqual([one]);
    });

    it("hands out a push only after every older push of its account", async () => {
      const store = await fresh();
      const [p1, p2, q1] = [entry("subject", "a"), entry("subject", "a"), entry("subject", "b")];
      for (const one of [p1, p2, q1]) await store.add(one);
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([p1.id, q1.id]);
      await store.remove(p1.id);
      expect(ids(await store.lease(later(1), LEASE, 10))).toEqual([p2.id]);
    });

    it("hands out an acceptance only after every older push and acceptance of its account", async () => {
      const store = await fresh();
      const [push, c1, c2] = [entry("subject", "a"), entry("consent", "a"), entry("consent", "a")];
      for (const one of [push, c1, c2]) await store.add(one);
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([push.id]);
      await store.remove(push.id);
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([c1.id]);
    });

    it("never holds a push behind an older acceptance", async () => {
      const store = await fresh();
      const [early, push] = [entry("consent", "a"), entry("subject", "a")];
      await store.add(early);
      await store.add(push);
      await store.reschedule(early.id, {
        attempts: 1,
        nextAttemptAt: later(FIRST_RETRY_MS),
        lastError: "404 subject.unknown",
      });
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([push.id]);
    });

    it("does not hand out what is leased until the lease runs out", async () => {
      const store = await fresh();
      const one = entry("subject", "a");
      await store.add(one);
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([one.id]);
      expect(await store.lease(later(60_000), later(180_000), 10)).toEqual([]);
      const again = await store.lease(LEASE, later(240_000), 10);
      expect(ids(again)).toEqual([one.id]);
      expect(again[0]?.nextAttemptAt).toEqual(later(240_000));
    });

    it("never hands out a parked entry, and a parked one holds nothing up", async () => {
      const store = await fresh();
      const [bad, good] = [entry("consent", "a"), entry("consent", "a")];
      await store.add(bad);
      await store.add(good);
      await store.reschedule(bad.id, {
        attempts: 1,
        nextAttemptAt: null,
        lastError: "422 consent.unreadable",
      });
      expect(ids(await store.lease(T0, LEASE, 10))).toEqual([good.id]);
      const pending = await store.pendingFor("example", "a");
      expect(pending.map((one) => [one.id, one.nextAttemptAt, one.lastError])).toEqual([
        [bad.id, null, "422 consent.unreadable"],
        [good.id, LEASE, null],
      ]);
    });

    it("narrows to one account, and to the limit", async () => {
      const store = await fresh();
      const [a, b, c] = [entry("subject", "a"), entry("subject", "b"), entry("subject", "c")];
      for (const one of [a, b, c]) await store.add(one);
      expect(ids(await store.lease(T0, LEASE, 10, { surface: "example", accountId: "b" }))).toEqual(
        [b.id],
      );
      expect(ids(await store.lease(T0, LEASE, 1))).toEqual([a.id]);
    });

    it("counts the attempts and keeps the last error", async () => {
      const store = await fresh();
      const one = entry("subject", "a");
      await store.add(one);
      await store.reschedule(one.id, {
        attempts: 3,
        nextAttemptAt: later(5_000),
        lastError: "no answer",
      });
      expect(await store.lease(T0, LEASE, 10)).toEqual([]);
      expect(await store.lease(later(5_000), LEASE, 10)).toMatchObject([
        { id: one.id, attempts: 3, lastError: "no answer", createdAt: one.createdAt },
      ]);
    });
  });
}

contract("memoryOutboxStore", () => Promise.resolve(memoryOutboxStore()));

const DATABASE_URL = process.env["TERMS_CLIENT_TEST_DATABASE_URL"];

describe.skipIf(DATABASE_URL === undefined)("postgresOutboxStore", () => {
  let pool: Pool;
  const schemas: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  });

  afterAll(async () => {
    for (const schema of schemas) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  });

  async function fresh(): Promise<OutboxStore> {
    const schema = `terms_outbox_test_${randomUUID().replaceAll("-", "")}`;
    schemas.push(schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    const client = await pool.connect();
    await client.query(`SET search_path TO ${schema}`);
    await client.query(OUTBOX_TABLE_SQL);
    client.release();
    // Every statement on a connection of its own that sees only this schema.
    return postgresOutboxStore(async (text, values) => {
      const one = await pool.connect();
      try {
        await one.query(`SET search_path TO ${schema}`);
        return (await one.query(text, values as unknown[])).rows;
      } finally {
        one.release();
      }
    });
  }

  contract("against Postgres", fresh);

  it("never hands one entry to two flushes leasing at once", async () => {
    const store = await fresh();
    const entries = Array.from({ length: 40 }, (_, index) =>
      entry("subject", `acct-${String(index)}`),
    );
    for (const one of entries) await store.add(one);
    const leased = await Promise.all(Array.from({ length: 4 }, () => store.lease(T0, LEASE, 40)));
    const all = leased.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(ids(entries).sort());
  });
});

describe("retrying", () => {
  it("waits twice as long after each failure, up to an hour", () => {
    expect(nextAttemptAfter(T0, 1)).toEqual(later(FIRST_RETRY_MS));
    expect(nextAttemptAfter(T0, 2)).toEqual(later(2 * FIRST_RETRY_MS));
    expect(nextAttemptAfter(T0, 4)).toEqual(later(8 * FIRST_RETRY_MS));
    expect(nextAttemptAfter(T0, 40)).toEqual(later(RETRY_CEILING_MS));
  });

  it("repeats what fails for when it was sent, and parks what fails for what it says", () => {
    expect(isRetryable(null, null)).toBe(true);
    expect(isRetryable(503, null)).toBe(true);
    expect(isRetryable(429, "rate-limited")).toBe(true);
    expect(isRetryable(401, "auth.required")).toBe(true);
    expect(isRetryable(403, "surface.not-yours")).toBe(true);
    expect(isRetryable(404, "subject.unknown")).toBe(true);
    expect(isRetryable(422, "capacity.undeclared")).toBe(true);
    expect(isRetryable(422, "consent.in-the-future")).toBe(true);
    expect(isRetryable(422, "consent.unreadable")).toBe(false);
    expect(isRetryable(409, "consent.replay-differs")).toBe(false);
    expect(isRetryable(400, "validation")).toBe(false);
  });
});
