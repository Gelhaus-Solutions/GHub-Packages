/**
 * What both design languages share: behaviour, with nothing drawn.
 *
 * This package now serves two languages. `console` keeps GControl and GPlatform
 * Control as they are; `modern` is a complete redesign for GPlatform SSO and
 * GPlatform Billing, with its own component anatomy. The presentation forks.
 * **This is the half that must not.**
 *
 * Accessibility here is implemented rather than inherited, with no Radix and no
 * headless library, so roving tabindex, focus collection, code entry, countdown
 * arithmetic and the field wiring that joins a control to its message are ours.
 * They are also the expensive and correctness-critical half: a second copy of
 * `choice-roving` is a second keyboard model, and the two would disagree in a
 * way only somebody using a keyboard would ever find.
 *
 * **The rule is that nothing reachable from here renders.** No `.tsx`, no
 * element, no class string. `behaviour.test.ts` asserts it rather than trusting
 * it, because the failure is quiet: a helper that returns a Tailwind class is
 * still perfectly usable from `modern`, and modern would then inherit console's
 * appearance through a module nobody thought of as presentation.
 *
 * **`field-state.ts` is the reason that rule needed a test.** It exports the
 * behaviour below and, in the same file, `FIELD_MESSAGE_TONES`,
 * `FIELD_BORDER_TONES` and `fieldBorderTone`, which are seven console class
 * strings. So this barrel names what it takes from that module rather than
 * re-exporting it: the split is expressed here, as a choice about what is
 * shared, and console's own file is not moved or touched. Splitting the file
 * would be the tidier answer and it is not worth editing console to get.
 *
 * `contrast.ts` is here because it is colour arithmetic rather than colour: it
 * computes ratios and resolves tokens, and both languages owe WCAG 2.2 AA
 * against whatever palette they carry.
 */

export { cn } from "./cn.js";
export * from "./choice-roving.js";
export * from "./code-entry.js";
export * from "./countdown-clock.js";
export * from "./focus.js";
export * from "./provider-fold.js";
export * from "./allowance-tone.js";
export * from "./contrast.js";

/*
  Named rather than starred, and the three names left out are the point. See the
  docblock above: the rest of that module is console's presentation.
*/
export { fieldDescribedBy, fieldMessageId, isRefused, type FieldStatus } from "./field-state.js";
