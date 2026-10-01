/**
 * What a code field does with what somebody types, pastes and deletes.
 *
 * `CodeInput` is six or eight boxes and a hidden input, and none of that is
 * where it goes wrong. It goes wrong on the rules: whether pasting a whole code
 * into the fourth box fills forwards or fills one box, whether backspace in an
 * empty box clears the one before it, and whether the hyphen in a recovery code
 * that was printed with one has to be typed. Every one of those is a decision,
 * and none of them is visible in a screenshot.
 *
 * In a `.ts` rather than beside the component: this package compiles with
 * `jsx: preserve`, so a test importing a `.tsx` cannot be parsed at all.
 * `choice-roving.ts`, `allowance-tone.ts` and `contrast.ts` are split the
 * same way and for the same reason.
 */

/**
 * Where focus goes after an edit, and what is in the boxes.
 *
 * The boxes rather than a string, and that is the whole of why this module
 * exists in the shape it does. A string cannot hold a gap: clear the second box
 * of `K7M4` and joining gives `KM4`, which puts `M` where the reader was about
 * to type. Somebody correcting one wrong character in the middle is the commonest
 * thing that happens to a code field, so position has to survive an empty box.
 */
export interface CodeEdit {
  boxes: string[];
  /** The box to put focus in. Clamped, so the last character does not focus nothing. */
  focus: number;
}

/**
 * The code as it posts: the boxes joined, gaps closed.
 *
 * A gap makes this shorter than the field, which is exactly right. An incomplete
 * code is incomplete whether the hole is at the end or in the middle, so nothing
 * here has to treat the two differently and `onComplete` cannot fire on one.
 */
export function codeOf(boxes: readonly string[]): string {
  return boxes.join("");
}

/**
 * What survives being pasted in.
 *
 * Every code this family issues is digits or upper-case alphanumerics, so a
 * lower-case paste is somebody's keyboard rather than a different code, and the
 * separator in a recovery code printed as `A1B2C-D3E4F` is there to help a human
 * keep their place rather than to be typed. Stripping both is what lets somebody
 * paste exactly what they were shown without being told off for it.
 */
export function cleanCode(raw: string, numeric: boolean, length: number): string {
  const kept = numeric ? raw.replace(/\D/gu, "") : raw.replace(/[^0-9a-z]/giu, "").toUpperCase();
  return kept.slice(0, length);
}

/** The characters as boxes, padded to the full length. */
export function toBoxes(value: string, length: number): string[] {
  return Array.from({ length }, (_, index) => value[index] ?? "");
}

/**
 * Type or paste `incoming` starting at `index`.
 *
 * Everything lands from that box onwards rather than from the beginning, which
 * is what makes pasting into the middle after correcting a typo do the obvious
 * thing. A browser hands the whole pasted string to whichever box has focus, so
 * without this a six character code fills one box and is truncated to one
 * character by `maxLength`.
 */
export function writeAt(
  boxes: readonly string[],
  index: number,
  incoming: string,
  numeric: boolean,
): CodeEdit {
  const length = boxes.length;
  const cleaned = cleanCode(incoming, numeric, length - index);
  if (cleaned === "") return { boxes: boxes.slice(), focus: index };

  const next = boxes.slice();
  for (let step = 0; step < cleaned.length && index + step < length; step += 1) {
    next[index + step] = cleaned[step] ?? "";
  }
  return { boxes: next, focus: clamp(index + cleaned.length, length) };
}

/**
 * Backspace, which does two different things.
 *
 * In a box with a character it clears that character and stays, because the
 * reader is fixing the one they are looking at. In an empty box it clears the
 * one before it and goes there, because the reader is fixing the one they just
 * left and a backspace that did nothing would be pressed twice.
 */
export function backspaceAt(boxes: readonly string[], index: number): CodeEdit {
  const next = boxes.slice();
  if (next[index] !== "") {
    next[index] = "";
    return { boxes: next, focus: index };
  }
  if (index > 0) next[index - 1] = "";
  return { boxes: next, focus: clamp(index - 1, boxes.length) };
}

/** Delete clears where it is and never moves, which is the whole difference. */
export function deleteAt(boxes: readonly string[], index: number): CodeEdit {
  const next = boxes.slice();
  next[index] = "";
  return { boxes: next, focus: index };
}

/**
 * Where an arrow, Home or End moves to, or `null` for a key this does not
 * handle.
 *
 * Movement stops at the ends rather than wrapping, unlike a radio group. A code
 * is an ordered thing being read off something, so the box after the last one is
 * nowhere, and wrapping to the first would silently undo a correction somebody
 * was making at the end.
 */
export function nextBox(key: string, from: number, length: number): number | null {
  switch (key) {
    case "ArrowLeft":
      return clamp(from - 1, length);
    case "ArrowRight":
      return clamp(from + 1, length);
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}
