import { RETRYABLE, type Code } from "@ghub/gmint-protocol";

/**
 * Every failure the SDK reports. `code` is one of the protocol's stable codes, or `transport`
 * (could not reach or talk to GMint) or `untrusted` (a response failed verification: treat it as
 * an attack, not an outage, and do not retry).
 *
 * A wait for an operator's approval ends in `approval_required` when no decision came in time or
 * the caller stopped waiting (the message names the approval), `denied` when it was refused, or
 * `approval_expired` when GMint let it lapse first. None of them is retryable: trying again asks
 * for a new approval.
 */
export class GmintError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: Code | "transport" | "untrusted",
    message: string,
  ) {
    super(`gmint: ${code}: ${message}`);
    this.name = "GmintError";
    this.retryable = code === "transport" || (code !== "untrusted" && RETRYABLE.has(code));
  }
}
