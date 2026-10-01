import { describe, expect, it } from "vitest";
import { isFinished, remainingSeconds } from "./countdown-clock.js";

/** A deadline a quarter of an hour out, which is the lockout the design draws. */
const NOW = 1_800_000_000_000;
const IN_15_MINUTES = NOW + 15 * 60 * 1000;

describe("remainingSeconds", () => {
  it("reads the wall clock rather than counting, so a backgrounded tab catches up", () => {
    // The case a decrementing counter gets wrong: nothing ticked for ten
    // minutes and the answer still has to be right when the tab comes back.
    expect(remainingSeconds(IN_15_MINUTES, NOW + 10 * 60 * 1000)).toBe(300);
  });

  it("rounds up, so a wait of one second is shown for the whole of it", () => {
    expect(remainingSeconds(NOW + 1, NOW)).toBe(1);
    expect(remainingSeconds(NOW + 999, NOW)).toBe(1);
    expect(remainingSeconds(NOW + 1000, NOW)).toBe(1);
  });

  it("never goes negative, so a late tick cannot show a wait running backwards", () => {
    expect(remainingSeconds(NOW, NOW + 60_000)).toBe(0);
  });

  it("is zero exactly at the deadline", () => {
    expect(remainingSeconds(NOW, NOW)).toBe(0);
  });
});

describe("isFinished", () => {
  it("is false while any part of a second is left, so the control stays disabled", () => {
    expect(isFinished(NOW + 1, NOW)).toBe(false);
  });

  it("is true at the deadline and after it", () => {
    expect(isFinished(NOW, NOW)).toBe(true);
    expect(isFinished(NOW, NOW + 5000)).toBe(true);
  });
});
