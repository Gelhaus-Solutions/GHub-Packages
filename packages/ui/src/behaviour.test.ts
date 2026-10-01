/**
 * That the shared behaviour core stays behaviour.
 *
 * `behaviour.ts` is what `console` and `modern` are allowed to have in common.
 * Its whole value is that it draws nothing: the moment a helper in it returns a
 * class string, modern inherits console's appearance through a module nobody
 * thinks of as presentation, and it does so silently, because such a helper is
 * perfectly usable and everything still compiles and renders.
 *
 * The file that proves this is needed is `field-state.ts`, which exports the
 * field wiring **and** seven console class strings from the same module. The
 * barrel takes the first and leaves the second, and without this test that
 * distinction survives only as a comment.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as behaviour from "./behaviour.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BARREL = join(HERE, "behaviour.ts");

/**
 * A Tailwind class, near enough for a file we own.
 *
 * Deliberately a shape rather than a list of utilities. A list is a thing to
 * keep up to date with Tailwind, and the question here is not "is this a valid
 * utility" but "is this module talking about appearance at all".
 */
const LOOKS_LIKE_A_CLASS =
  /"(?:[a-z][a-z0-9]*:)*(?:text|bg|border|rounded|shadow|px|py|pt|pb|pl|pr|gap|flex|grid|font|tracking|leading|size|w|h|m[xytblr]?)-[a-z0-9[\]()#./_-]+/u;

/** The modules the barrel re-exports from, read out of the barrel itself. */
function sources(): string[] {
  const text = readFileSync(BARREL, "utf8");
  const found = [...text.matchAll(/from "\.\/([a-z-]+)\.js"/gu)].map((m) => `${m[1] as string}.ts`);
  return [...new Set(found)];
}

/**
 * Modules the barrel reads from that do contain presentation, with the reason
 * and the names that are therefore not re-exported.
 *
 * "Classified or exempt with a written reason, never absent" is the rule this
 * repository already follows for routes, tokens and contract vocabularies. An
 * exemption here is a claim that a module carries appearance AND behaviour, and
 * that the barrel takes only the second.
 */
const MIXED: Readonly<Record<string, readonly string[]>> = {
  "field-state.ts": ["FIELD_MESSAGE_TONES", "FIELD_BORDER_TONES", "fieldBorderTone"],
};

describe("the shared behaviour core", () => {
  it("reads from the modules the barrel names, and found some", () => {
    /*
      The floor. Every assertion below walks `sources()`, so a barrel that
      stopped matching the pattern would make all of them vacuously true: an
      empty list contains no presentation at all.
    */
    expect(sources().length).toBeGreaterThan(5);
  });

  it("draws nothing, in any module it re-exports from", () => {
    const drawing = sources()
      .filter((file) => MIXED[file] === undefined)
      .filter((file) => LOOKS_LIKE_A_CLASS.test(readFileSync(join(HERE, file), "utf8")))
      .sort();

    expect(drawing).toEqual([]);
  });

  it("takes only the behaviour out of a module that is both", () => {
    const exported = new Set(Object.keys(behaviour));
    const leaked = Object.entries(MIXED).flatMap(([, names]) =>
      names.filter((name) => exported.has(name)),
    );

    expect(leaked).toEqual([]);
  });

  it("keeps no exemption for a module the barrel no longer reads", () => {
    const live = new Set(sources());
    expect(Object.keys(MIXED).filter((file) => !live.has(file))).toEqual([]);
  });

  it("keeps no exemption for a module that has stopped mixing the two", () => {
    /*
      The mirror, and the one that catches an entry left behind. An exemption
      for a module that is now clean reads as a decision somebody took about a
      file that no longer needs one.
    */
    const stale = Object.keys(MIXED).filter(
      (file) => !LOOKS_LIKE_A_CLASS.test(readFileSync(join(HERE, file), "utf8")),
    );

    expect(stale).toEqual([]);
  });

  it("re-exports no component, which is the other way appearance gets in", () => {
    /*
      A class string is the obvious leak. A component is the one that would not
      look like a leak at all: `export * from "./status.js"` would compile, pass
      every assertion above, and hand modern a console component from the module
      whose entire purpose is to be language-neutral.
    */
    const componentish = Object.entries(behaviour)
      .filter(([name, value]) => {
        if (!/^[A-Z]/u.test(name)) return false;
        if (typeof value === "function") return true;
        return typeof value === "object" && value !== null && "$$typeof" in value;
      })
      .map(([name]) => name);

    expect(componentish).toEqual([]);
  });

  it("exports something worth sharing, so none of the above is vacuous", () => {
    // Every assertion here is a "nothing is wrong" shape, and an empty module
    // satisfies all of them.
    expect(Object.keys(behaviour).length).toBeGreaterThan(10);
    expect(typeof behaviour.cn).toBe("function");
    expect(typeof behaviour.focusablesIn).toBe("function");
    expect(typeof behaviour.isRefused).toBe("function");
  });
});
