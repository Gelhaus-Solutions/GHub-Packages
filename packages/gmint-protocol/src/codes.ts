/**
 * The closed list of codes a refused or pending response may carry. A caller can tell an
 * outage from a refusal and a lockdown from both, and learns nothing about policy: every
 * authorization failure is the same `denied`.
 */
export const CODES = [
  "denied",
  "bad_request",
  "replay",
  "clock",
  "quarantined",
  "rate_limited",
  "witness_stale",
  "approval_required",
  "approval_unavailable",
  "locked_down",
  "unavailable",
  "provider_error",
] as const;

export type Code = (typeof CODES)[number];

export function isCode(value: unknown): value is Code {
  return typeof value === "string" && (CODES as readonly string[]).includes(value);
}

/** Codes after which the same request may be retried later without change. */
export const RETRYABLE: ReadonlySet<Code> = new Set(["unavailable", "rate_limited", "clock"]);
