/**
 * The outbox: what a product has told GPlatform Terms and the service has not
 * yet confirmed.
 *
 * Every subject push and every acceptance is written here first, in the
 * product's own database, and only then sent. A sign-up therefore never waits
 * on the service, an acceptance made while the service is unreachable is not
 * lost, and a process that dies between writing and sending sends on its next
 * flush. Sending again is safe: an acceptance carries the product's request
 * reference, which the service answers with the first row instead of a second,
 * and a subject push carries the account's whole state.
 *
 * Entries for one account keep their order where it matters. Two pushes of
 * one account delivered out of order would leave the older state standing, and
 * the service reads an account's newest acceptance by the order the ledger
 * received them. And the service refuses an acceptance for an account it has
 * not been told of. So a push waits for every older push of its account, and
 * an acceptance waits for every older push and every older acceptance of its
 * account. A push never waits for an acceptance: an acceptance queued before
 * its account was first pushed would otherwise wait for a push that waits for
 * it.
 *
 * An entry the service refuses for what it says, not for when it was sent (an
 * identifier it cannot read, a reference already used for another acceptance)
 * would be refused the same way forever. It is parked rather than retried or
 * dropped: it stays in the table with the refusal beside it, never due again
 * and never blocking the entries after it, until a person looks at it.
 */

export type OutboxKind = "subject" | "consent";

export interface OutboxEntry {
  /** The acceptance's request reference, or a generated id for a push. */
  readonly id: string;
  readonly kind: OutboxKind;
  readonly surface: string;
  readonly accountId: string;
  /** The request body, as JSON text. */
  readonly body: string;
  readonly createdAt: Date;
  /** Failed deliveries so far. */
  readonly attempts: number;
  /** When it is next due; null once parked. */
  readonly nextAttemptAt: Date | null;
  /** The last refusal or failure, for whoever reads the table. */
  readonly lastError: string | null;
}

/**
 * Where a product keeps its outbox. `postgresOutboxStore` is one for any
 * Postgres the product already has; `memoryOutboxStore` keeps it in the
 * process, for tests and for a product that accepts losing it on restart.
 */
export interface OutboxStore {
  /** Keeps an entry. Called before anything is sent. A second entry with an
   *  id already kept is ignored, so a product retrying its own request does
   *  not queue the acceptance twice. */
  add(entry: OutboxEntry): Promise<void>;
  /**
   * Up to `limit` entries due at `now`, oldest first, none parked and none
   * waiting for an older entry of its account (a push for an older push, an
   * acceptance for an older push or acceptance), and leases them: each one's `nextAttemptAt` moves to `leaseUntil`, so a flush running
   * elsewhere does not take it meanwhile, and a process that dies holding it
   * gives it back when the lease runs out. `only` narrows it to one account.
   */
  lease(
    now: Date,
    leaseUntil: Date,
    limit: number,
    only?: { readonly surface: string; readonly accountId: string },
  ): Promise<OutboxEntry[]>;
  /** Every undelivered entry of one account, parked ones included, oldest
   *  first. */
  pendingFor(surface: string, accountId: string): Promise<OutboxEntry[]>;
  /** Delivered: the entry goes. */
  remove(id: string): Promise<void>;
  /** Not delivered: how many attempts, when to try again (null parks it), and
   *  why. */
  reschedule(
    id: string,
    update: {
      readonly attempts: number;
      readonly nextAttemptAt: Date | null;
      readonly lastError: string;
    },
  ): Promise<void>;
}

/** The first retry waits this long, and each one after twice as long as the
 *  last, up to RETRY_CEILING_MS. */
export const FIRST_RETRY_MS = 30_000;
export const RETRY_CEILING_MS = 60 * 60_000;

/** When an entry that has now failed `attempts` times is tried again. */
export function nextAttemptAfter(now: Date, attempts: number): Date {
  const delay = Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1), RETRY_CEILING_MS);
  return new Date(now.getTime() + delay);
}

/**
 * Whether a failed delivery is worth repeating as it stands.
 *
 * No answer, a server error and a rate limit pass. So does a refusal that a
 * person can clear without the entry changing: a key that is wrong or lacks
 * the surface is fixed in configuration, an account the service does not know
 * yet is pushed by the entry before it, a capacity not yet declared is
 * declared by an admin, and an acceptance stamped a moment ahead of the
 * service's clock stops being ahead. Anything else the service refused for
 * what the entry says, and says again every time.
 */
export function isRetryable(status: number | null, code: string | null): boolean {
  if (status === null || status >= 500) return true;
  if (status === 401 || status === 403 || status === 404 || status === 408 || status === 429) {
    return true;
  }
  return code === "capacity.undeclared" || code === "consent.in-the-future";
}

/** Whether a failure says the service is not answering at all, rather than
 *  refusing one entry: then every entry after it would fail the same way. */
export function isOutage(status: number | null): boolean {
  return (
    status === null ||
    status >= 500 ||
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 429
  );
}

/**
 * An outbox held in the process, in the order entries were added.
 *
 * Lost when the process ends, so a product that runs more than one process, or
 * cannot afford to lose an acceptance made while the service was down, keeps
 * its outbox in its database instead.
 */
export function memoryOutboxStore(): OutboxStore & { readonly entries: () => OutboxEntry[] } {
  const rows: OutboxEntry[] = [];
  const accountOf = (entry: OutboxEntry) => `${entry.surface}\u0000${entry.accountId}`;
  const replace = (id: string, change: Partial<OutboxEntry>) => {
    const index = rows.findIndex((row) => row.id === id);
    const row = rows[index];
    if (row !== undefined) rows[index] = { ...row, ...change };
  };
  return {
    entries: () => rows.map((row) => ({ ...row })),
    add(entry) {
      if (!rows.some((row) => row.id === entry.id)) rows.push({ ...entry });
      return Promise.resolve();
    },
    lease(now, leaseUntil, limit, only) {
      const pushes = new Set<string>();
      const acceptances = new Set<string>();
      const due: OutboxEntry[] = [];
      for (const row of rows) {
        if (row.nextAttemptAt === null) continue;
        const account = accountOf(row);
        const waits = pushes.has(account) || (row.kind === "consent" && acceptances.has(account));
        (row.kind === "subject" ? pushes : acceptances).add(account);
        if (waits) continue;
        if (
          only !== undefined &&
          (row.surface !== only.surface || row.accountId !== only.accountId)
        )
          continue;
        if (row.nextAttemptAt.getTime() <= now.getTime() && due.length < limit) due.push(row);
      }
      for (const row of due) replace(row.id, { nextAttemptAt: leaseUntil });
      return Promise.resolve(due.map((row) => ({ ...row, nextAttemptAt: leaseUntil })));
    },
    pendingFor(surface, accountId) {
      return Promise.resolve(
        rows
          .filter((row) => row.surface === surface && row.accountId === accountId)
          .map((row) => ({ ...row })),
      );
    },
    remove(id) {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
    reschedule(id, update) {
      replace(id, update);
      return Promise.resolve();
    },
  };
}
