/**
 * The two rules a form control's message obeys, in a file a test can import.
 *
 * They live here rather than in `input.tsx` because the test setup cannot parse
 * a `.tsx` at all: the package compiles with `jsx: preserve`, so a test file
 * importing one fails on the first tag rather than failing an assertion. A rule
 * that cannot be reached from a test is a rule that is only ever checked by
 * looking at a screen, and both of these are about what a person who cannot see
 * the screen is told.
 */

import type { Status } from "./status.js";

/**
 * A field waiting on somebody else, which is neither a hint nor an error.
 *
 * `hint` is grey standing advice and `error` is red and the field's own fault.
 * Between them sits the state a field reaches when it has been sent somewhere
 * and the answer has not come back, or has come back and is not a refusal: an
 * identifier being checked against a national register, a name being looked up,
 * a value accepted here and rejected there. Colouring that red says the person
 * typed it wrong when they may not have, and colouring it grey says nothing is
 * happening when something is.
 *
 * Three of the status ramp rather than all six. `crit` is `error`, which already
 * exists and outranks this. `idle` and `locked` are the absence of a state, and
 * a field in the absence of a state is simply a field.
 */
export type FieldStatus = Extract<Status, "info" | "warn" | "ok">;

export const FIELD_MESSAGE_TONES: Record<FieldStatus, string> = {
  info: "text-info-ink",
  warn: "text-warn-ink",
  ok: "text-ok-ink",
};

export const FIELD_BORDER_TONES: Record<FieldStatus, string> = {
  info: "border-info focus:border-info focus:shadow-[0_0_0_3px_var(--gc-info-wash)]",
  warn: "border-warn focus:border-warn focus:shadow-[0_0_0_3px_var(--gc-warn-wash)]",
  ok: "border-ok focus:border-ok focus:shadow-[0_0_0_3px_var(--gc-ok-wash)]",
};

const CRIT_BORDER = "border-crit focus:border-crit focus:shadow-[0_0_0_3px_var(--gc-crit-wash)]";

/**
 * Whether a control is showing a refusal, from either of the two ways to say so.
 *
 * `error` is a refusal with its own sentence, which the shell renders under the
 * control in place of the hint. `invalid` is a refusal whose sentence is
 * somewhere else on the screen: a summary above a form, a block beside the
 * control, a paragraph that explains several fields at once. Both are the same
 * state to a person using the control and to the accessibility tree, so both
 * take the crit border and both set `aria-invalid`.
 *
 * The case that made `invalid` exist is a code field being refused while its
 * hint still has to be read. `error` would replace that hint with the refusal,
 * and the hint was the sentence explaining why the obvious answer is not the
 * answer, which is exactly what somebody who has just got it wrong is owed.
 *
 * It is deliberately not a value on `FieldStatus`. That type is the three
 * states a field reaches while something else is deciding, and crit is not one
 * of those: it is a verdict. Putting it there would give two props that can
 * both say crit and a precedence rule nobody can remember.
 *
 * One function rather than the same expression at five call sites, because the
 * one that gets missed is the one where a control looks refused and is not
 * announced as one.
 */
export function isRefused(error: unknown, invalid: boolean | undefined): boolean {
  return error !== undefined || invalid === true;
}

/**
 * Which border a control wears, given both of the things that could decide.
 *
 * One expression rather than two conditions in a class list, because two of
 * them true at once puts two borders and two focus shadows on one control and
 * whichever lands last in the string silently wins. A refusal outranks a report
 * that one is being awaited: a field that has been told its value is wrong
 * should not also look like it is still being checked.
 *
 * `refused` is `isRefused`, so a control refused without a message of its own
 * wears the same border as one refused with one.
 */
export function fieldBorderTone(
  refused: boolean,
  status: FieldStatus | undefined,
): string | undefined {
  if (refused) return CRIT_BORDER;
  return status === undefined ? undefined : FIELD_BORDER_TONES[status];
}

/**
 * The id of a field's message, and the reason it has to have one.
 *
 * Nothing here wired `aria-describedby` before, so the hint and the error were
 * rendered, read by anybody looking at the screen, and announced to nobody. A
 * screen reader landing on a field with a red sentence under it heard the label
 * and the value and stopped, which is WCAG 3.3.1 and 3.3.2 both failing quietly,
 * and no automated check catches it: axe sees a paragraph, and a paragraph is
 * allowed to exist. It was found by adding a third message state and asking what
 * a person who cannot see the colour hears instead.
 *
 * Derived from the control's own id rather than generated separately, so the two
 * cannot drift and a caller passing an explicit `id` gets a matching one.
 */
export function fieldMessageId(htmlFor: string | undefined): string | undefined {
  return htmlFor === undefined ? undefined : `${htmlFor}-message`;
}

/**
 * What a control should be described by, given what its shell will render.
 *
 * A caller's own `aria-describedby` is kept and the message appended, because a
 * field can be described by something outside itself as well: a shared note
 * under a group of them, a legend. Dropping theirs to add ours would be a silent
 * removal, and a silent removal of a description is the same failure this
 * function exists to fix.
 */
export function fieldDescribedBy(
  htmlFor: string,
  hasMessage: boolean,
  own: string | undefined,
): string | undefined {
  const ours = hasMessage ? fieldMessageId(htmlFor) : undefined;
  const all = [own, ours].filter((one): one is string => one !== undefined);
  return all.length === 0 ? undefined : all.join(" ");
}
