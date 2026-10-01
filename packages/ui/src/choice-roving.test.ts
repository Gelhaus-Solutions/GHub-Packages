import { describe, expect, it } from "vitest";
import { choiceTabStop, nextChoice } from "./choice-roving.js";

/** The shape the removal dialog actually has: two options, the second destructive. */
const BOTH = [true, true];
/** The same dialog on a build that cannot destroy anything. */
const WIPE_BLOCKED = [true, false];

describe("nextChoice", () => {
  it("moves forward and wraps, so a two-option group toggles", () => {
    expect(nextChoice("ArrowDown", 0, BOTH)).toBe(1);
    expect(nextChoice("ArrowDown", 1, BOTH)).toBe(0);
  });

  it("moves backward and wraps", () => {
    expect(nextChoice("ArrowUp", 1, BOTH)).toBe(0);
    expect(nextChoice("ArrowUp", 0, BOTH)).toBe(1);
  });

  it("treats the horizontal arrows as the vertical ones", () => {
    // The cards stack, but somebody who reaches for Right on a group of two is
    // not wrong, and a group that answers one arrow and ignores the other is
    // the kind of thing only its author ever presses correctly.
    expect(nextChoice("ArrowRight", 0, BOTH)).toBe(1);
    expect(nextChoice("ArrowLeft", 1, BOTH)).toBe(0);
  });

  it("lands somewhere sensible on the first press, with nothing selected", () => {
    // A destructive group opens unanswered on purpose, so the first arrow has
    // to mean something. Forward is the top of the list and backward is the
    // bottom, which is what reaching for End-ish behaviour looks like.
    expect(nextChoice("ArrowDown", -1, BOTH)).toBe(0);
    expect(nextChoice("ArrowUp", -1, BOTH)).toBe(1);
  });

  it("skips an option that cannot be picked rather than stopping on it", () => {
    // Stopping focus on a blocked answer is a dead key press with nothing
    // saying why. The option stays visible; it just is not a stop.
    expect(nextChoice("ArrowDown", 0, WIPE_BLOCKED)).toBe(0);
    expect(nextChoice("ArrowUp", 0, WIPE_BLOCKED)).toBe(0);
    expect(nextChoice("End", -1, WIPE_BLOCKED)).toBe(0);
  });

  it("goes to the ends on Home and End", () => {
    expect(nextChoice("Home", 1, BOTH)).toBe(0);
    expect(nextChoice("End", 0, BOTH)).toBe(1);
  });

  it("does nothing for a key that is not its business", () => {
    // Tab above all: the group is one stop and leaving it is the browser's job.
    for (const key of ["Tab", "Enter", " ", "a", "Escape"]) {
      expect(nextChoice(key, 0, BOTH)).toBeNull();
    }
  });

  it("does nothing at all when every option is blocked", () => {
    // The group still renders, because hiding it would leave somebody wondering
    // whether the product can do the thing at all. The arrows must not loop
    // looking for a stop that is not there.
    expect(nextChoice("ArrowDown", -1, [false, false])).toBeNull();
    expect(nextChoice("Home", 0, [])).toBeNull();
  });
});

describe("choiceTabStop", () => {
  it("is the answer already given, so tabbing back returns to it", () => {
    expect(choiceTabStop(1, BOTH)).toBe(1);
  });

  it("is the first pickable option while the group is unanswered", () => {
    expect(choiceTabStop(-1, BOTH)).toBe(0);
    expect(choiceTabStop(-1, WIPE_BLOCKED)).toBe(0);
  });

  it("never rests on a blocked option, even one somehow selected", () => {
    expect(choiceTabStop(1, WIPE_BLOCKED)).toBe(0);
  });

  it("leaves a wholly blocked group out of the tab order", () => {
    // There is nothing to say in it, so it is not a stop on the way anywhere.
    expect(choiceTabStop(-1, [false, false])).toBe(-1);
  });
});
