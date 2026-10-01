/**
 * Which option an arrow key moves to, and which one holds the tab stop.
 *
 * A group of radios is one stop on the way round a form, not one per option.
 * Tab reaches the group, the arrows choose inside it, and Tab leaves. That is
 * the pattern every screen reader and every keyboard user already expects from
 * a radio group, and a group that makes each option its own tab stop is one
 * where somebody pressing Tab to leave a dialog walks through three answers
 * instead, selecting as they go.
 *
 * A rule rather than a handler because this is the half worth testing. Whether
 * the arrows wrap, whether they skip an option that cannot be picked, and where
 * focus starts when nothing is selected yet are all decisions, and all of them
 * are invisible in a screenshot of a dialog.
 *
 * In a `.ts` rather than beside the component: this package compiles with
 * `jsx: preserve`, so a test importing a `.tsx` cannot be parsed at all.
 * `allowance-tone.ts` and `contrast.ts` are split the same way and for the
 * same reason.
 */

/**
 * The option an arrow, Home or End moves to, or `null` for a key this does not
 * handle.
 *
 * `from` is the option focus is on now, and `-1` means none of them: a
 * destructive group opens with nothing selected on purpose, so the first arrow
 * press has to land somewhere sensible rather than nowhere. Forward from
 * nothing is the first option and backward from nothing is the last, which is
 * what somebody reaching for the end of a short list expects.
 *
 * **Disabled options are skipped rather than landed on.** An option this build
 * cannot carry out is shown, because hiding it would leave somebody wondering
 * whether the product can do the thing at all, but stopping focus on an answer
 * that cannot be given is a dead key press with no explanation attached.
 */
export function nextChoice(key: string, from: number, enabled: readonly boolean[]): number | null {
  const count = enabled.length;
  // Nothing to move to. A group whose every option is blocked still renders,
  // and the arrows in it must do nothing rather than loop looking for a stop.
  if (count === 0 || !enabled.includes(true)) return null;

  const first = enabled.indexOf(true);
  const last = enabled.lastIndexOf(true);

  /** The next enabled option in `delta`'s direction, wrapping, giving up where it started. */
  const step = (start: number, delta: number): number => {
    let at = start;
    for (let moved = 0; moved < count; moved++) {
      at = (at + delta + count) % count;
      if (enabled[at] === true) return at;
    }
    return start;
  };

  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return from < 0 ? first : step(from, 1);
    case "ArrowUp":
    case "ArrowLeft":
      return from < 0 ? last : step(from, -1);
    case "Home":
      return first;
    case "End":
      return last;
    default:
      return null;
  }
}

/**
 * Which option is reachable by Tab.
 *
 * The selected one, so that tabbing back into a group returns to the answer
 * already given rather than to the top of the list. Where nothing is selected
 * the first option that can be picked takes it, because a group has to be
 * reachable before it can be answered.
 *
 * Returns `-1` when every option is blocked, which leaves the group out of the
 * tab order entirely. That is correct: there is nothing to say in it.
 */
export function choiceTabStop(selected: number, enabled: readonly boolean[]): number {
  if (selected >= 0 && enabled[selected] === true) return selected;
  return enabled.indexOf(true);
}
