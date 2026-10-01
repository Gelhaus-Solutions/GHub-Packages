/**
 * Where a count sits against its ceiling, as a rule rather than a component.
 *
 * It is shared rather than written twice because the judgement in it must not be
 * made twice. Both consoles show the same question from opposite ends: this one
 * shows a customer what their own lease grants them, and GPlatform Control shows
 * staff what they sold. If the two disagree about the width at which a bar turns
 * amber, the disagreement is found by a customer reading one number on a support
 * call and a different one on their screen.
 *
 * The colour follows the two meanings the system allows. Under the ceiling the
 * bar is the accent, which the token table defines as "the primary action, a
 * live value, the selected thing", and a usage count is a live value. At the
 * ceiling and above it the status ramp takes over, where `warn` is defined as
 * "over allowance" and `crit` as critical.
 *
 * The split between the bar and the number is the one the contrast suite
 * enforces. The bar is a graphic and owes 3:1, so it takes `--gc-{status}`. The
 * number is text and owes 4.5:1, so it takes `--gc-{status}-ink`. Colouring the
 * number with the graphic token is the exact failure the ink tokens exist to
 * prevent: `warn` as text measures 3.67:1 in light, which is a fail.
 */
export type AllowanceTone = "accent" | "warn" | "crit";

/**
 * Where a count sits against its ceiling.
 *
 * At the ceiling is already worth saying, because the next deployment is the one
 * that is refused and nobody wants to discover the ceiling by hitting it. Over
 * it is `crit` even though nothing has been switched off: the lease reports the
 * overage and the renewal is where it is settled, so the colour is reporting a
 * fact rather than an outage.
 */
export function allowanceTone(used: number, allowed: number | null): AllowanceTone {
  if (allowed === null) return "accent";
  if (used > allowed) return "crit";
  if (used >= allowed) return "warn";
  return "accent";
}
