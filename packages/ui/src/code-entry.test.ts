import { describe, expect, it } from "vitest";
import {
  backspaceAt,
  cleanCode,
  codeOf,
  deleteAt,
  nextBox,
  toBoxes,
  writeAt,
} from "./code-entry.js";

/** Six boxes with the first four filled, which is where most corrections happen. */
const PART = ["K", "7", "M", "4", "", ""];
const EMPTY = ["", "", "", "", "", ""];

describe("cleanCode", () => {
  it("upper-cases, because a lower-case paste is a keyboard rather than a different code", () => {
    expect(cleanCode("k7m4qz", false, 6)).toBe("K7M4QZ");
  });

  it("drops the separator a recovery code is printed with", () => {
    // Shown as A1B2C-D3E4F, so pasting exactly what was shown has to work.
    expect(cleanCode("A1B2C-D3E4F", false, 10)).toBe("A1B2CD3E4F");
  });

  it("drops the spaces a code pasted out of a message brings with it", () => {
    expect(cleanCode("  K7 M4 QZ  ", false, 6)).toBe("K7M4QZ");
  });

  it("keeps only digits when the code is digits", () => {
    expect(cleanCode("4a8b2c1d", true, 6)).toBe("4821");
  });

  it("never returns more than the field holds", () => {
    expect(cleanCode("K7M4QZEXTRA", false, 6)).toBe("K7M4QZ");
  });
});

describe("writeAt", () => {
  it("spreads a whole pasted code from the box it landed in", () => {
    // The browser hands the entire string to one box. Without this it fills one
    // and maxLength truncates it to a single character.
    expect(writeAt(EMPTY, 0, "K7M4QZ", false)).toEqual({
      boxes: ["K", "7", "M", "4", "Q", "Z"],
      focus: 5,
    });
  });

  it("fills forwards from the middle, so correcting a typo by pasting works", () => {
    expect(writeAt(PART, 2, "XY", false)).toEqual({
      boxes: ["K", "7", "X", "Y", "", ""],
      focus: 4,
    });
  });

  it("stops at the last box rather than wrapping round", () => {
    expect(writeAt(PART, 4, "ABCDEF", false)).toEqual({
      boxes: ["K", "7", "M", "4", "A", "B"],
      focus: 5,
    });
  });

  it("types one character and moves on", () => {
    expect(writeAt(PART, 4, "Q", false)).toEqual({
      boxes: ["K", "7", "M", "4", "Q", ""],
      focus: 5,
    });
  });

  it("does nothing at all when everything pasted was punctuation", () => {
    expect(writeAt(PART, 2, "---", false)).toEqual({ boxes: PART.slice(), focus: 2 });
  });
});

describe("backspaceAt", () => {
  it("clears the box it is in and stays, when there is something in it", () => {
    expect(backspaceAt(PART, 3)).toEqual({ boxes: ["K", "7", "M", "", "", ""], focus: 3 });
  });

  it("clears the box before and goes there, when the one it is in is empty", () => {
    // Otherwise the first press does nothing and everybody presses it twice.
    expect(backspaceAt(PART, 4)).toEqual({ boxes: ["K", "7", "M", "", "", ""], focus: 3 });
  });

  it("does nothing at the start, rather than moving to nowhere", () => {
    expect(backspaceAt(EMPTY, 0)).toEqual({ boxes: EMPTY.slice(), focus: 0 });
  });
});

describe("deleteAt", () => {
  it("clears where it is and never moves, which is the whole difference", () => {
    expect(deleteAt(PART, 1)).toEqual({ boxes: ["K", "", "M", "4", "", ""], focus: 1 });
  });

  it("leaves a hole rather than shuffling everything left", () => {
    // The case a joined string cannot express. Clearing the second box of K7M4
    // and compacting would put M where the reader is about to type, which is
    // the commonest correction anybody makes to a code.
    const cleared = deleteAt(PART, 1).boxes;
    expect(cleared[2]).toBe("M");
    expect(writeAt(cleared, 1, "8", false).boxes).toEqual(["K", "8", "M", "4", "", ""]);
  });
});

describe("codeOf", () => {
  it("closes the gaps, so an unfinished code is short whichever box is empty", () => {
    expect(codeOf(["K", "", "M", "4", "", ""])).toBe("KM4");
    expect(codeOf(["K", "7", "M", "4", "", ""])).toBe("K7M4");
  });

  it("is the full length only when every box is filled", () => {
    expect(codeOf(["K", "7", "M", "4", "Q", "Z"])).toHaveLength(6);
  });
});

describe("nextBox", () => {
  it("moves left and right", () => {
    expect(nextBox("ArrowRight", 2, 6)).toBe(3);
    expect(nextBox("ArrowLeft", 2, 6)).toBe(1);
  });

  it("stops at the ends rather than wrapping, unlike a radio group", () => {
    // A code is read off something in order, so the box after the last is
    // nowhere, and wrapping would undo a correction made at the end.
    expect(nextBox("ArrowRight", 5, 6)).toBe(5);
    expect(nextBox("ArrowLeft", 0, 6)).toBe(0);
  });

  it("takes Home and End to the ends", () => {
    expect(nextBox("Home", 4, 6)).toBe(0);
    expect(nextBox("End", 1, 6)).toBe(5);
  });

  it("returns null for a key it does not handle, so the box keeps it", () => {
    expect(nextBox("a", 0, 6)).toBeNull();
    expect(nextBox("Tab", 0, 6)).toBeNull();
  });
});

describe("toBoxes", () => {
  it("pads to the full length, so every box renders from the first keystroke", () => {
    expect(toBoxes("K7", 6)).toEqual(["K", "7", "", "", "", ""]);
  });

  it("works for the eight a device code has", () => {
    expect(toBoxes("K7M4Q", 8)).toHaveLength(8);
  });
});
