import { RETRYABLE, type Code } from "@ghub/gmint-protocol";

/**
 * Every failure the SDK reports. `code` is one of the protocol's stable codes, or `transport`
 * (could not reach or talk to GMint) or `untrusted` (a response failed verification: treat it as
 * an attack, not an outage, and do not retry).
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
