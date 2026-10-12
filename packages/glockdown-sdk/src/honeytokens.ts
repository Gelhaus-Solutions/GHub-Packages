/**
 * This app's honeytokens (GLockdown L97): a decoy admin account and a decoy API key that sit in the
 * app's database like real ones and are used by nobody. A sign-in attempt as the decoy admin,
 * whatever the password, and any request carrying the decoy key mean somebody is where they should
 * not be: the app answers it as any refused credential, so whoever tried learns nothing, and tells
 * GLockdown, which raises AAL phase 1 for the app and whatever shares its host and database.
 *
 * The app keeps the decoy key only as its SHA-256; the key itself is planted where an intruder
 * would look and nowhere in the app's configuration.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type HoneytokenSignal = "decoy_admin" | "decoy_api_key";

export interface HoneytokenOptions {
  /** The decoy admin's sign-in names (email, username), compared without regard to case. */
  logins: readonly string[];
  /** The SHA-256 of each decoy API key, hex. */
  keySha256: readonly string[];
  /**
   * Called on a trip, at most once a minute for each signal; typically
   * `(s) => void signal({ ...edge, ...s })`. Its result is not awaited and its errors are ignored.
   */
  trip: (s: { signal: HoneytokenSignal; detail: string }) => unknown;
  now?: () => number;
}

export class Honeytokens {
  private readonly logins: Set<string>;
  private readonly keys: Buffer[];
  private readonly last = new Map<HoneytokenSignal, number>();

  constructor(private readonly o: HoneytokenOptions) {
    this.logins = new Set(o.logins.map(norm).filter((l) => l.length > 0));
    this.keys = o.keySha256.map((h) => Buffer.from(h, "hex"));
    if (this.keys.some((k) => k.length !== 32)) throw new Error("keySha256: 64 hex digits each");
  }

  /**
   * Whether this sign-in name is the decoy admin's; when it is, GLockdown is told. Call it before
   * checking the password, and refuse the sign-in as a wrong password would be refused.
   */
  isDecoyLogin(login: string, detail = ""): boolean {
    if (!this.logins.has(norm(login))) return false;
    this.tell("decoy_admin", `sign-in as the decoy admin${detail ? `: ${detail}` : ""}`);
    return true;
  }

  /**
   * Whether this presented API key is the decoy; when it is, GLockdown is told. Call it before
   * looking the key up, and refuse it as an unknown key would be refused.
   */
  isDecoyKey(key: string, detail = ""): boolean {
    const h = createHash("sha256").update(key, "utf8").digest();
    // Every decoy compared, in constant time each: the answer's timing says nothing.
    let hit = false;
    for (const k of this.keys) hit = timingSafeEqual(h, k) || hit;
    if (!hit) return false;
    this.tell("decoy_api_key", `the decoy API key used${detail ? `: ${detail}` : ""}`);
    return true;
  }

  /**
   * What this app holds of its decoys, as hashes only (L120): the SHA-256 of each decoy key and of
   * each decoy login (trimmed, lower case), hex, for `reportDecoys`. GLockdown keeps the same
   * hashes in its inventory and checks that each is still held here: a decoy the app no longer
   * checks would trip nothing.
   */
  fingerprints(): { keys: string[]; logins: string[] } {
    return {
      keys: this.keys.map((k) => k.toString("hex")),
      logins: [...this.logins].map((l) => createHash("sha256").update(l, "utf8").digest("hex")),
    };
  }

  private tell(signal: HoneytokenSignal, detail: string): void {
    const now = (this.o.now ?? Date.now)();
    const last = this.last.get(signal);
    if (last !== undefined && now - last < 60_000) return;
    this.last.set(signal, now);
    try {
      void Promise.resolve(this.o.trip({ signal, detail: detail.slice(0, 200) })).catch(() => {});
    } catch {
      // A trip that cannot be told is still refused; the app's own logs keep it.
    }
  }
}

function norm(login: string): string {
  return login.trim().toLowerCase();
}
