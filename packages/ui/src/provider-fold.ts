/**
 * How many provider buttons are shown, and how many the control has to name.
 *
 * The rule rather than the rendering, because the counts that matter are the
 * ones nobody develops against. A list of two behaves correctly by accident; a
 * list of twelve is a scroll on a phone, on a screen where the thing somebody
 * came to do is above it.
 *
 * In a `.ts` rather than beside the component: this package compiles with
 * `jsx: preserve`, so a test importing a `.tsx` cannot be parsed at all.
 */

/** Six fit under the way in on a phone. The seventh is where scrolling starts. */
export const FOLD_ABOVE = 6;
/** Five stay visible when it folds, which leaves room for the control itself. */
export const SHOWN_WHEN_FOLDED = 5;

export interface ProviderFold {
  /** How many to render. */
  shown: number;
  /** How many the control names. Zero means there is no control. */
  remaining: number;
}

export function providerFold(total: number, expanded: boolean): ProviderFold {
  if (expanded || total <= FOLD_ABOVE) return { shown: total, remaining: 0 };
  return { shown: SHOWN_WHEN_FOLDED, remaining: total - SHOWN_WHEN_FOLDED };
}
