import type { OutboxEntry, OutboxKind, OutboxStore } from "./outbox.js";

/**
 * The outbox in a table of the product's own Postgres database.
 *
 * This package brings no database driver. The product passes the one it
 * already has, as a function that runs one parameterised statement and
 * returns its rows:
 *
 *   Prisma:  (text, values) => prisma.$queryRawUnsafe(text, ...values)
 *   pg:      async (text, values) => (await pool.query(text, values)).rows
 *
 * Every statement returns rows, so one function serves for reads and writes
 * alike. The table is OUTBOX_TABLE_SQL, created by the product's own
 * migrations; the README has the matching Prisma model.
 *
 * Leasing takes the rows it hands out with FOR UPDATE SKIP LOCKED, so two
 * processes flushing at once never take the same entry, and the order within
 * an account holds across them: a row is due only while no older row it waits
 * for is still undelivered, whoever holds that one.
 */

export type SqlQuery = (
  text: string,
  values: readonly unknown[],
) => Promise<readonly Record<string, unknown>[]>;

/**
 * The table, as a migration creates it: written the way Prisma writes the
 * model in the README, so a product on Prisma that adds the model and one that
 * runs this get the same table, and neither sees drift.
 */
export const OUTBOX_TABLE_SQL = `CREATE TABLE "terms_outbox" (
    "seq" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_error" TEXT,

    CONSTRAINT "terms_outbox_pkey" PRIMARY KEY ("seq")
);

CREATE UNIQUE INDEX "terms_outbox_id_key" ON "terms_outbox"("id");

CREATE INDEX "terms_outbox_account" ON "terms_outbox"("surface", "account_id", "seq");

CREATE INDEX "terms_outbox_due" ON "terms_outbox"("next_attempt_at");
`;

const COLUMNS =
  "seq, id, kind, surface, account_id, body, created_at, attempts, next_attempt_at, last_error";

const LEASE = `UPDATE terms_outbox AS o SET next_attempt_at = $2::timestamptz
WHERE o.seq IN (
  SELECT h.seq FROM terms_outbox AS h
  WHERE h.next_attempt_at IS NOT NULL
    AND h.next_attempt_at <= $1::timestamptz
    AND ($4::text IS NULL OR (h.surface = $4::text AND h.account_id = $5::text))
    AND NOT EXISTS (
      SELECT 1 FROM terms_outbox AS e
      WHERE e.surface = h.surface AND e.account_id = h.account_id
        AND e.seq < h.seq AND e.next_attempt_at IS NOT NULL
        AND (e.kind = 'subject' OR h.kind = 'consent')
    )
  ORDER BY h.seq
  LIMIT $3::integer
  FOR UPDATE SKIP LOCKED
)
RETURNING ${COLUMNS.split(", ")
  .map((column) => `o.${column}`)
  .join(", ")}`;

function dateOf(value: unknown, column: string): Date {
  const at = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(at.getTime())) throw new Error(`terms_outbox.${column} is not a time.`);
  return at;
}

function entryOf(row: Record<string, unknown>): OutboxEntry & { readonly seq: bigint } {
  const next = row["next_attempt_at"];
  const lastError = row["last_error"];
  return {
    seq: BigInt(String(row["seq"])),
    id: String(row["id"]),
    kind: String(row["kind"]) as OutboxKind,
    surface: String(row["surface"]),
    accountId: String(row["account_id"]),
    body: String(row["body"]),
    createdAt: dateOf(row["created_at"], "created_at"),
    attempts: Number(row["attempts"]),
    nextAttemptAt: next === null || next === undefined ? null : dateOf(next, "next_attempt_at"),
    lastError: lastError === null || lastError === undefined ? null : String(lastError),
  };
}

function inOrder(rows: readonly Record<string, unknown>[]): OutboxEntry[] {
  return rows
    .map(entryOf)
    .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
    .map(({ seq: _seq, ...entry }) => entry);
}

export function postgresOutboxStore(query: SqlQuery): OutboxStore {
  return {
    async add(entry) {
      await query(
        `INSERT INTO terms_outbox (id, kind, surface, account_id, body, created_at, attempts, next_attempt_at, last_error)
VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz, $7::integer, $8::timestamptz, $9::text)
ON CONFLICT (id) DO NOTHING
RETURNING id`,
        [
          entry.id,
          entry.kind,
          entry.surface,
          entry.accountId,
          entry.body,
          entry.createdAt,
          entry.attempts,
          entry.nextAttemptAt,
          entry.lastError,
        ],
      );
    },
    async lease(now, leaseUntil, limit, only) {
      return inOrder(
        await query(LEASE, [
          now,
          leaseUntil,
          limit,
          only?.surface ?? null,
          only?.accountId ?? null,
        ]),
      );
    },
    async pendingFor(surface, accountId) {
      return inOrder(
        await query(
          `SELECT ${COLUMNS} FROM terms_outbox WHERE surface = $1::text AND account_id = $2::text ORDER BY seq`,
          [surface, accountId],
        ),
      );
    },
    async remove(id) {
      await query(`DELETE FROM terms_outbox WHERE id = $1::text RETURNING id`, [id]);
    },
    async reschedule(id, update) {
      await query(
        `UPDATE terms_outbox SET attempts = $2::integer, next_attempt_at = $3::timestamptz, last_error = $4::text WHERE id = $1::text RETURNING id`,
        [id, update.attempts, update.nextAttemptAt, update.lastError],
      );
    },
  };
}
