/**
 * The tint an id gets. These vectors are the contract with Identity, which keeps
 * its own copy of `avatarTint`: the same id must get the same colour in every
 * product, whoever does the hashing.
 */

import { describe, expect, it } from "vitest";
import { AVATAR_TINTS, avatarTint } from "./tint.js";

describe("avatarTint", () => {
  it("is FNV-1a over the id, modulo seven", () => {
    expect(avatarTint("")).toBe(2);
    expect(avatarTint("a")).toBe(5);
    expect(avatarTint("mira")).toBe(3);
    expect(avatarTint("cm2x7k9q00001")).toBe(1);
    expect(avatarTint("00000000-0000-4000-8000-000000000000")).toBe(2);
    expect(avatarTint("usr-42")).toBe(4);
  });

  it("always lands on one of the seven", () => {
    for (let i = 0; i < 500; i += 1) {
      const tint = avatarTint(`id-${String(i)}`);
      expect(tint).toBeGreaterThanOrEqual(0);
      expect(tint).toBeLessThan(AVATAR_TINTS.length);
    }
  });
});
