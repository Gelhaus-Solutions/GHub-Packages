/**
 * Where a count turns amber, and where it turns red.
 *
 * This is the half of `AllowanceBar` worth pinning down, because it is the half
 * two products have to agree on. GControl shows a customer what their lease
 * grants them and GPlatform Control shows staff what was sold, off the same
 * component; if one of them decided that at-the-ceiling was still fine, the
 * disagreement would surface as a customer reading one colour on a support call
 * and staff reading another.
 *
 * The boundary case is the whole point. At the ceiling is `warn` rather than
 * `accent`, because the next deployment is the one that gets refused and nobody
 * should have to discover the ceiling by hitting it.
 */

import { describe, expect, it } from "vitest";
import { allowanceTone } from "./allowance-tone.js";

describe("allowanceTone", () => {
  it("is the accent below the ceiling, where the count is just a live value", () => {
    expect(allowanceTone(0, 500)).toBe("accent");
    expect(allowanceTone(412, 500)).toBe("accent");
    expect(allowanceTone(499, 500)).toBe("accent");
  });

  it("warns at the ceiling, not only past it", () => {
    expect(allowanceTone(2, 2)).toBe("warn");
    expect(allowanceTone(500, 500)).toBe("warn");
  });

  it("is critical above the ceiling", () => {
    expect(allowanceTone(57, 50)).toBe("crit");
    expect(allowanceTone(3, 2)).toBe("crit");
  });

  /**
   * An unbounded grant cannot be over-spent, so it never colours. This is the
   * case that would break if somebody rewrote the guard as a falsy check: a
   * ceiling of zero is a real ceiling that grants nothing, while null is the
   * absence of one, and `!allowed` cannot tell them apart.
   */
  it("stays the accent where there is no ceiling", () => {
    expect(allowanceTone(0, null)).toBe("accent");
    expect(allowanceTone(88, null)).toBe("accent");
    expect(allowanceTone(1_000_000, null)).toBe("accent");
  });

  it("treats a ceiling of zero as a ceiling, not as an absent one", () => {
    expect(allowanceTone(0, 0)).toBe("warn");
    expect(allowanceTone(1, 0)).toBe("crit");
  });
});
