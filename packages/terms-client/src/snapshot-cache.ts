import {
  bind,
  NoBundledSnapshotError,
  parseSnapshotSignature,
  verifySnapshot,
  type PinnedKey,
  type SnapshotSignature,
  type Terms,
} from "@ghub/terms-rules";
import { refusalOf, send, TermsApiError, type HttpOptions } from "./http.js";

/**
 * The snapshot a product decides from, kept fresh and never trusted unsigned.
 *
 * Three sources, newest serial wins: the snapshot bundled in the installed
 * release of @ghub/terms-rules (the floor, always there once a release carries
 * one), the last one this product fetched and stored, and the one the service
 * serves now. Every one of them is verified against the pinned keys before it
 * is bound; a snapshot that fails is refused and the one before it stays.
 *
 * The cache never goes backwards. A snapshot with a lower serial than the one
 * held is older, whatever served it, and binding it would undo a rollout the
 * product has already acted on.
 */

/** A verified snapshot as it is kept between processes: the exact signed text,
 *  its signature, and the service's ETag for it. */
export interface StoredSnapshot {
  readonly text: string;
  readonly signature: SnapshotSignature;
  readonly etag: string | null;
}

/**
 * Where a product keeps the last snapshot it fetched, so a process that starts
 * while the service is unreachable decides from that rather than from the
 * older one its release carries. Optional: without one, the floor is the
 * bundled snapshot. What is loaded is verified again, so the store need not be
 * trusted.
 */
export interface SnapshotStore {
  load(): Promise<StoredSnapshot | null>;
  save(snapshot: StoredSnapshot): Promise<void>;
}

/** Nothing to decide from: no bundled snapshot, none stored, and the service
 *  not reached yet. */
export class TermsUnavailableError extends Error {
  override readonly name: string = "TermsUnavailableError";
}

export type SnapshotSource = "bundled" | "stored" | "fetched";

interface Held {
  readonly terms: Terms;
  readonly serial: number;
  readonly etag: string | null;
  readonly source: SnapshotSource;
}

export interface SnapshotCacheOptions {
  readonly http: HttpOptions;
  readonly keys: readonly PinnedKey[];
  readonly bundled: (() => Terms) | null;
  readonly store: SnapshotStore | null;
  readonly clock: () => Date;
  readonly refreshEveryMs: number;
  /** How soon to try again after a refresh that failed. */
  readonly retryAfterMs: number;
  readonly report: (error: unknown, context: string) => void;
}

export class SnapshotCache {
  private held: Held | null = null;
  private loaded: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private nextRefreshAt = 0;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: SnapshotCacheOptions) {}

  /** The serial of the snapshot held, or null. */
  get serial(): number | null {
    return this.held?.serial ?? null;
  }

  get source(): SnapshotSource | null {
    return this.held?.source ?? null;
  }

  /**
   * The rules bound to the newest verified snapshot held. Starts a refresh in
   * the background when one is due, and never waits for it: a gate that waits
   * on the network is a gate that locks people out when the network is slow.
   */
  terms(): Terms {
    this.refreshIfDue();
    if (this.held === null) {
      throw new TermsUnavailableError(
        "No verified snapshot is held yet: none is bundled with this release of @ghub/terms-rules, none was stored, and GPlatform Terms has not been reached. Await ready() at start.",
      );
    }
    return this.held.terms;
  }

  /** The held rules, or null, without starting anything. */
  peek(): Terms | null {
    return this.held?.terms ?? null;
  }

  /** Loads the bundled and the stored snapshot, once. */
  load(): Promise<void> {
    this.loaded ??= this.loadOnce();
    return this.loaded;
  }

  private async loadOnce(): Promise<void> {
    if (this.options.bundled !== null) {
      try {
        const terms = this.options.bundled();
        this.adopt({ terms, serial: terms.snapshot.serial, etag: null, source: "bundled" });
      } catch (error) {
        if (!(error instanceof NoBundledSnapshotError)) {
          this.options.report(error, "reading the bundled snapshot");
        }
      }
    }
    if (this.options.store !== null) {
      try {
        const stored = await this.options.store.load();
        if (stored !== null) {
          const snapshot = verifySnapshot(stored.text, stored.signature, this.options.keys);
          this.adopt({
            terms: bind(snapshot),
            serial: snapshot.serial,
            etag: stored.etag,
            source: "stored",
          });
        }
      } catch (error) {
        this.options.report(error, "reading the stored snapshot");
      }
    }
  }

  /** Starts a refresh when one is due and none is running. */
  refreshIfDue(): void {
    if (this.refreshing !== null) return;
    if (this.options.clock().getTime() < this.nextRefreshAt) return;
    this.refresh().catch((error: unknown) => this.options.report(error, "refreshing the snapshot"));
  }

  /**
   * Starts a refresh when the service has just answered from a newer snapshot
   * than the one held, so the local rules catch up without waiting out the
   * interval. At most once per retry interval, so a snapshot that keeps
   * failing to verify is not fetched on every question.
   */
  refreshIfBehind(serial: number): void {
    if (this.held !== null && this.held.serial >= serial) return;
    if (this.refreshing !== null) return;
    if (this.options.clock().getTime() - this.lastAttemptAt < this.options.retryAfterMs) return;
    this.refresh().catch((error: unknown) => this.options.report(error, "refreshing the snapshot"));
  }

  /** A refresh served when one is already running, rather than a second. */
  refresh(): Promise<void> {
    this.refreshing ??= this.refreshOnce().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refreshOnce(): Promise<void> {
    await this.load();
    const now = this.options.clock().getTime();
    this.lastAttemptAt = now;
    try {
      await this.fetchNewer();
      this.nextRefreshAt = now + this.options.refreshEveryMs;
    } catch (error) {
      this.nextRefreshAt = now + this.options.retryAfterMs;
      throw error;
    }
  }

  private async fetchNewer(): Promise<void> {
    const etag = this.held?.source === "bundled" ? null : (this.held?.etag ?? null);
    const answer = await send(this.options.http, "GET", "v1/snapshot", {
      headers: etag === null ? {} : { "if-none-match": etag },
    });
    if (answer.status === 304) return;
    if (answer.status !== 200) throw refusalOf(answer, "the snapshot");
    const header = answer.headers.get("x-snapshot-signature");
    if (header === null) {
      throw new TermsApiError(200, null, "GPlatform Terms sent a snapshot without its signature.");
    }
    let signed: unknown;
    try {
      signed = JSON.parse(header) as unknown;
    } catch {
      throw new TermsApiError(
        200,
        null,
        "GPlatform Terms sent a snapshot signature that is not JSON.",
      );
    }
    const signature = parseSnapshotSignature(signed);
    const snapshot = verifySnapshot(answer.text, signature, this.options.keys);
    const fetched: Held = {
      terms: bind(snapshot),
      serial: snapshot.serial,
      etag: answer.headers.get("etag"),
      source: "fetched",
    };
    if (this.held !== null && fetched.serial < this.held.serial) {
      throw new TermsApiError(
        200,
        null,
        `GPlatform Terms served snapshot ${String(fetched.serial)}, older than the ${String(this.held.serial)} held; the held one stays.`,
      );
    }
    this.adopt(fetched);
    if (this.options.store !== null) {
      try {
        await this.options.store.save({ text: answer.text, signature, etag: fetched.etag });
      } catch (error) {
        this.options.report(error, "storing the snapshot");
      }
    }
  }

  /** Takes a snapshot when it is at least as new as the one held. */
  private adopt(next: Held): void {
    if (this.held === null || next.serial >= this.held.serial) this.held = next;
  }
}
