/**
 * The class helper keeps a type step beside an ink. Before the steps were
 * declared, tailwind-merge read both as colours and dropped the step.
 */

import { describe, expect, it } from "vitest";
import { cn } from "./cn.js";

describe("cn", () => {
  it("keeps a modern type step beside an ink", () => {
    expect(cn("text-m-meta", "text-m-ink-2")).toBe("text-m-meta text-m-ink-2");
    expect(cn("text-m-label text-m-ink", "px-3")).toBe("text-m-label text-m-ink px-3");
  });

  it("keeps a console step beside a colour", () => {
    expect(cn("text-2xs", "text-fg-secondary")).toBe("text-2xs text-fg-secondary");
  });

  it("still lets a later step or a later ink win over an earlier one", () => {
    expect(cn("text-m-meta", "text-m-body")).toBe("text-m-body");
    expect(cn("text-m-ink-2", "text-m-ink")).toBe("text-m-ink");
  });
});
