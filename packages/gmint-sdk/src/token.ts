/**
 * The token a caller gets. It never prints itself: `String()`, `JSON.stringify()` and
 * `util.inspect` all show a redacted form, so a token cannot leak into a log by accident
 * (GAdvisory's S43). The secret is read with `reveal()`, and `revoke()` or `await using`
 * revokes it on GitHub as soon as the caller is done.
 */

import { inspect } from "node:util";
import type { GithubScope } from "@ghub/gmint-protocol";

export type Revoker = (secret: string) => Promise<void>;

const REDACTED = "[GmintToken redacted]";

export class GmintToken {
  readonly #secret: string;
  readonly #revoker: Revoker;
  #revoked = false;

  constructor(
    secret: string,
    readonly expiresAt: Date,
    readonly scope: GithubScope,
    /** SHA-256 of the token, b64url: what GitHub's audit log calls hashed_token. */
    readonly hashed: string,
    revoker: Revoker,
  ) {
    this.#secret = secret;
    this.#revoker = revoker;
  }

  /** The secret itself. Pass it straight to the call that needs it; never store or log it. */
  reveal(): string {
    if (this.#revoked) throw new Error("gmint: token was revoked");
    return this.#secret;
  }

  get revoked(): boolean {
    return this.#revoked;
  }

  /** Revokes the token on GitHub. Best effort, bounded in time, never throws. */
  async revoke(): Promise<void> {
    if (this.#revoked) return;
    this.#revoked = true;
    try {
      await this.#revoker(this.#secret);
    } catch {
      // The token expires within the hour regardless; a failed revocation must not break the caller.
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.revoke();
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
