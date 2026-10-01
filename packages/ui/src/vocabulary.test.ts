/**
 * A shared component must not name one of the products that share it.
 *
 * This package is the design system BOTH consoles consume: GControl's own web
 * app and GPlatform Control. A sentence written for the first one reads as a
 * lie in the second, and it is the worst kind of lie because everything around
 * it is right. The panel renders, the grammar is fine, the advice is coherent,
 * and it names a product the reader does not have.
 *
 * That shipped. `health-panel.tsx` told anybody whose app declares no health
 * values that "GControl renders whatever that list contains", and the GPlatform
 * Control cloud portal renders that exact panel. The cloud portal exists for
 * people who are NOT running a GControl broker, so the one audience that saw
 * the sentence was the one audience it was wrong for.
 *
 * COMMENTS ARE DELIBERATELY ALLOWED. A docblock saying GControl hand-wrote the
 * nav rail first, and that GPlatform Control was about to hand-write it again,
 * is exactly the provenance that should be kept: it explains why the component
 * is shared at all. What must not name a product is the text a person reads on
 * a screen.
 *
 * Read as TEXT rather than imported, because a `.tsx` cannot be imported by a
 * test in this package: the tsconfig preserves JSX and the parse fails.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/** The products that share this package, in the spellings a screen would use. */
const PRODUCTS = ["GControl", "GPlatform", "GAdvisory", "gctl", "gpctl"];

/**
 * Everything a reader could see, and nothing else.
 *
 * Three things are removed before anything is judged, and each earned its place
 * by producing a false positive on the first run of this file.
 *
 * Comments go first, so provenance survives: a docblock saying GControl
 * hand-wrote the nav rail is the reason the component is shared and must stay.
 *
 * Import and export specifiers go next, including the multi-line form, because
 * `@ghub/gctl-core-types` is a package name rather than a sentence.
 *
 * And then only string literals and JSX text are returned, rather than whatever
 * is left of the line. An identifier is not something a person reads: the key
 * `gctlPanel` is the name of a wire field and renaming it would be a protocol
 * change to satisfy a lint about prose.
 */
function visibleStrings(source: string): string[] {
  let text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  text = text.replace(/(?:^|\n)[ \t]*(?:import|export)[\s\S]*?from\s*["'][^"']*["'];?/g, "\n");
  text = text.replace(/(?:^|\n)[ \t]*import\s*["'][^"']*["'];?/g, "\n");

  const found: string[] = [];
  // The JSX arm allows braces on purpose. It used to be `[^<>{}]`, which
  // cannot span an interpolation, so the most ordinary sentence React writes,
  // `<span>GControl has {n} apps</span>`, was invisible to the one check that
  // exists to catch exactly that. Measured: with that class this gate passed on
  // that line. Allowing braces widens what is offered to the product scan
  // below, which costs nothing, because a candidate is only reported if it
  // actually contains a product name.
  const literal =
    /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|>([^<>]{2,})</g;
  for (let m = literal.exec(text); m !== null; m = literal.exec(text)) {
    found.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  }
  return found;
}

/**
 * Every source file under `src`, at any depth.
 *
 * This was a single non-recursive `readdirSync`, so `src/charts` was scanned by
 * nothing at all. A component in a subdirectory is no less shared than one at
 * the top, and the directory a file sits in is not a statement about who reads
 * its prose.
 */
function sources(dir: string = SRC, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(join(dir, entry.name), rel));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(rel);
  }
  return out;
}

describe("the shared package does not name the products that share it", () => {
  it("has no user-visible string naming a console", () => {
    const offences: string[] = [];

    for (const name of sources()) {
      for (const text of visibleStrings(readFileSync(join(SRC, name), "utf8"))) {
        for (const product of PRODUCTS) {
          if (text.includes(product)) offences.push(`${name} names ${product}: ${text.trim()}`);
        }
      }
    }

    // Named rather than counted, so a failure says which sentence and which
    // product rather than "expected 1 to be 0".
    expect(offences).toEqual([]);
  });

  it("still allows a comment to say where a component came from", () => {
    // The guard on the guard. If `visibleText` ever stopped stripping comments,
    // the test above would go red on provenance docblocks that are correct, and
    // the fix somebody reaches for is deleting the rule.
    const withComment = ["/** GControl hand-wrote this first. */", 'const a = "safe";'].join("\n");
    expect(visibleStrings(withComment).join(" ")).not.toContain("GControl");
    // Both import forms, because the multi-line one is what actually shipped.
    expect(
      visibleStrings('import type { X } from "@ghub/gctl-core-types";').join(" "),
    ).not.toContain("gctl");
    expect(
      visibleStrings('import type {\n  X,\n} from "@ghub/gctl-core-types";').join(" "),
    ).not.toContain("gctl");
    // An identifier is not prose, and a wire field keeps its name.
    expect(visibleStrings("const a = { gctlPanel: 1 };").join(" ")).not.toContain("gctl");
    // And it still catches the sentence that started this.
    expect(visibleStrings('<X description="GControl renders it." />').join(" ")).toContain(
      "GControl",
    );
  });
});
