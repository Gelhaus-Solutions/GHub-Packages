import { describe, expect, it } from "vitest";
import { providerFold, FOLD_ABOVE, SHOWN_WHEN_FOLDED } from "./provider-fold.js";

describe("providerFold", () => {
  it("shows everything at the counts that fit", () => {
    // A6 is drawn at none, two, six and twelve. The first three do not fold.
    expect(providerFold(0, false)).toEqual({ shown: 0, remaining: 0 });
    expect(providerFold(2, false)).toEqual({ shown: 2, remaining: 0 });
    expect(providerFold(FOLD_ABOVE, false)).toEqual({ shown: 6, remaining: 0 });
  });

  it("folds at the seventh, which is where scrolling would start", () => {
    expect(providerFold(7, false)).toEqual({ shown: SHOWN_WHEN_FOLDED, remaining: 2 });
  });

  it("shows five and names seven at twelve, which is the drawn case", () => {
    expect(providerFold(12, false)).toEqual({ shown: 5, remaining: 7 });
  });

  it("shows everything once expanded, so the control has nothing left to name", () => {
    expect(providerFold(12, true)).toEqual({ shown: 12, remaining: 0 });
  });

  it("never leaves one behind the control, which would be worse than showing it", () => {
    // Folding six into five plus a control naming one is the shape this avoids.
    for (let total = 0; total <= 20; total += 1) {
      expect(providerFold(total, false).remaining).not.toBe(1);
    }
  });
});
