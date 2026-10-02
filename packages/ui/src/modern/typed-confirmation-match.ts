/**
 * The one rule a typed confirmation is judged by, in a module with no
 * "use client" so the server can apply it too.
 *
 * The field checks as somebody types, and the action behind it has to check
 * again when the form arrives, because a confirmation the server never re-reads
 * is a confirmation anybody with a request builder can skip. Two copies of the
 * rule are how the field says "Matches" and the server then refuses the same
 * string, which is the failure that makes a careful screen feel arbitrary.
 *
 * **Exact after trimming, and case counts.** Leading and trailing space is
 * forgiven because nobody can see it and a paste or a dictation often brings
 * some. Everything else is the comparison: case, inner spacing, punctuation.
 *
 * **Canonically equivalent text is the same text.** Both sides are put in NFC
 * first. "Geschäftsbedingungen" stored decomposed and typed composed looks
 * identical on every screen and differs in its bytes, and refusing it would ask
 * somebody to type something they already typed correctly.
 */
export function typedConfirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().normalize("NFC") === expected.trim().normalize("NFC");
}
