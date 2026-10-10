"use client";

import { ChevronsUpDown } from "lucide-react";
import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS, AURORA_IN_SECTION } from "./aurora.js";

/** One run of text inside a paragraph: unchanged, or a word mark. */
export interface DiffPart {
  kind: "plain" | "del" | "ins";
  text: string;
}

/**
 * One paragraph line.
 *
 * `n` is the paragraph's number in the text it belongs to, or null where a
 * number would mislead. `heading` marks a line that is a heading OF THE
 * DOCUMENT ("## 4 Transfers"): it is drawn at heading weight inside the line
 * and is not an `h` element, because the viewer's own headings are the hunks,
 * and a document heading promoted into the outline would put the compared text
 * and the comparison's structure into one list of headings.
 */
export interface DiffLine {
  kind: "ctx" | "del" | "add";
  n: number | null;
  parts: readonly DiffPart[];
  heading?: boolean;
}

/**
 * A hunk names the section it is in and its paragraph range ("7 to 9", drawn
 * mono after a pilcrow); a fold hides unchanged lines behind a button that
 * says what it hides ("Show 4 unchanged paragraphs").
 */
export type DiffBlock =
  | { kind: "hunk"; section: string; range: string; lines: readonly DiffLine[] }
  | { kind: "fold"; label: string; lines: readonly DiffLine[] };

export interface DiffViewerProps {
  blocks: readonly DiffBlock[];
  /** Names the region: "Changes against 2026-10-03.2, English". */
  label: string;
  /** The `lang` of the compared text, so a German paragraph is read in German. */
  lang: string;
  /**
   * The language of the caller's own words (the fold labels, the hidden
   * prefixes and the range), where it differs from `lang`. A German comparison
   * in an English console is the case: "Removed:" read with German
   * pronunciation is a word nobody recognises. Left out, they inherit `lang`.
   */
  wordsLang?: string;
  /**
   * Every line: the folds start open. When this changes, every fold follows it,
   * open or closed, including any that were opened by hand.
   */
  every?: boolean;
  /** The visually hidden prefix before each line's text: "Removed:", "Added:", "Unchanged:". */
  words: { removed: string; added: string; unchanged: string };
  /** The hunk headings' level. 3 under a page whose section is an `h2`. */
  headingLevel?: 2 | 3 | 4;
  /**
   * The id of the summary line above the viewer ("German: 9 changes in 6
   * sections"), which the design makes the region's description.
   */
  describedBy?: string;
  className?: string;
}

/** The line's film. Removed takes no hue; added takes the ok hue as a film only. */
const FILM: Readonly<Record<DiffLine["kind"], string>> = {
  ctx: "",
  del: "bg-m-diff-del",
  add: "bg-m-diff-add",
};

/** The paragraph's ink. Unchanged and removed are quieter than what the new text says. */
const INK: Readonly<Record<DiffLine["kind"], string>> = {
  ctx: "text-m-ink-2",
  del: "text-m-ink-2",
  add: "text-m-ink",
};

/*
 * The number is ink-3 except on an added line, where ink-3 on the dark added
 * film measures 4.48 and so steps up to ink-2. `modern-contrast.test.ts`
 * measures every ink here on the film it sits on.
 */
const NUMBER_INK: Readonly<Record<DiffLine["kind"], string>> = {
  ctx: "text-m-ink-3",
  del: "text-m-ink-3",
  add: "text-m-ink-2",
};

/** U+2212, the minus sign, not a hyphen: it sits level with the plus. */
const SIGN: Readonly<Record<DiffLine["kind"], string>> = { ctx: "", del: "\u2212", add: "+" };

const SIGN_INK: Readonly<Record<DiffLine["kind"], string>> = {
  ctx: "text-m-ink-3",
  del: "text-m-ink-2",
  add: "text-m-ok-ink",
};

function prefixOf(kind: DiffLine["kind"], words: DiffViewerProps["words"]): string {
  if (kind === "del") return words.removed;
  if (kind === "add") return words.added;
  return words.unchanged;
}

function Part({ part }: { part: DiffPart }) {
  if (part.kind === "del") {
    return (
      <del className="rounded-[3px] bg-m-diff-del-word px-px text-m-ink line-through decoration-[1.5px]">
        {part.text}
      </del>
    );
  }
  if (part.kind === "ins") {
    return (
      <ins className="rounded-[3px] bg-m-diff-add-word px-px text-m-ink underline decoration-[1.5px] underline-offset-[3px]">
        {part.text}
      </ins>
    );
  }
  return <>{part.text}</>;
}

interface RowProps {
  line: DiffLine;
  words: DiffViewerProps["words"];
  wordsLang: string | undefined;
  /** Set on the first line a fold revealed, so focus can land there. */
  target?: (node: HTMLDivElement | null) => void;
}

function Row({ line, words, wordsLang, target }: RowProps) {
  return (
    <div
      ref={target}
      tabIndex={target === undefined ? undefined : -1}
      className={cn(
        /*
         * Three columns from `sm`, two below it: at 390 the number goes and the
         * sign and the text are all that is left, and `minmax(0, 1fr)` with
         * `overflow-wrap: anywhere` is what keeps a long word from pushing the
         * row wider than the screen. Nothing in the viewer scrolls sideways.
         */
        "grid grid-cols-[22px_minmax(0,1fr)] items-baseline py-[5px] pr-4 sm:grid-cols-[44px_22px_minmax(0,1fr)]",
        "focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-m-ring",
        FILM[line.kind],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "hidden pr-2.5 text-right font-mono text-[12px] leading-6 tabular-nums sm:block",
          NUMBER_INK[line.kind],
        )}
      >
        {line.n ?? ""}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "pl-2.5 font-mono text-[14px] leading-6 font-medium sm:pl-0",
          SIGN_INK[line.kind],
        )}
      >
        {SIGN[line.kind]}
      </span>
      <p
        className={cn(
          "min-w-0 whitespace-pre-wrap text-m-body [overflow-wrap:anywhere]",
          INK[line.kind],
          line.heading === true ? "font-semibold" : "",
        )}
      >
        <span lang={wordsLang} className="sr-only">
          {`${prefixOf(line.kind, words)} `}
        </span>
        {line.parts.map((part, index) => (
          <Part key={index} part={part} />
        ))}
      </p>
    </div>
  );
}

function foldsOf(blocks: readonly DiffBlock[]): Set<number> {
  const found = new Set<number>();
  blocks.forEach((block, index) => {
    if (block.kind === "fold") found.add(index);
  });
  return found;
}

/**
 * What changed between two versions of one text, git-style: unified, paragraph
 * by paragraph, with the changed words marked inside each changed paragraph.
 * Drawn for the GPlatform Terms staff console, where a version page, a draft's
 * Changes tab and the proposal sheet all show the same comparison.
 *
 * **It renders a comparison and computes none.** The hunks, the folds and the
 * word marks come from the caller's API exactly as they are drawn, so the
 * viewer cannot disagree with the server about what changed, and the sentence
 * above it ("Reworded 2 sections") and the marks inside it come from the same
 * computation.
 *
 * **Never colour alone.** Every line carries a sign and a visually hidden
 * prefix ("Removed:", "Added:", "Unchanged:") before its text, and the sign is
 * hidden from assistive technology because the prefix says it in words.
 * Removed words are struck and added ones underlined, as `del` and `ins`. A
 * removed line takes no hue at all, because crit is kept for something lost and
 * a replaced sentence is not lost; an added line takes the ok hue as a FILM,
 * never as the paragraph's ink and never as a dot, so a new paragraph cannot
 * read as a status. The plus is drawn in the ok ink, as the sheet draws it; it
 * is a glyph beside the text, not the text.
 *
 * **Hunk headings are real headings**, so a screen reader moves change by
 * change. A line that is a heading of the document is drawn at heading weight
 * and stays a line: see `DiffLine`.
 *
 * **A fold is a button that names what it hides.** Enter or Space opens it in
 * place and focus moves to the first paragraph it revealed (`tabindex=-1`), so
 * Tab carries on from there rather than from the top of the viewer. Opening one
 * announces nothing, because focus has already moved. A fold stays open once
 * opened. When `every` changes, every fold follows it. The open folds are
 * remembered by position, so a caller showing a different comparison (another
 * language, words only) gives the viewer a new `key`.
 *
 * **The announcement belongs to the page.** The sheet's one polite status when
 * the language, words only or every line changes ("German: 9 changes in 6
 * sections") is said by the page that changed them, because it is the page that
 * knows the comparison was swapped and the sentence to say about it. Point
 * `describedBy` at the summary line so the region carries it as well.
 */
export function DiffViewer({
  blocks,
  label,
  lang,
  wordsLang,
  every = false,
  words,
  headingLevel = 3,
  describedBy,
  className,
}: DiffViewerProps) {
  const [opened, setOpened] = useState<ReadonlySet<number>>(() =>
    every ? foldsOf(blocks) : new Set(),
  );
  const [followed, setFollowed] = useState(every);
  const firstLines = useRef(new Map<number, HTMLDivElement>());
  const focusFold = useRef<number | null>(null);

  /*
   * `every` moved: every fold follows it, including one opened by hand.
   * Adjusted during render, as `AsOf` does with its value, so the viewer never
   * paints the old state of the folds under the new state of the toggle.
   */
  if (every !== followed) {
    setFollowed(every);
    setOpened(every ? foldsOf(blocks) : new Set());
  }

  useEffect(() => {
    /*
     * After the render that put the fold's lines in the document, never in the
     * click: a node that does not exist yet cannot take focus. Only a fold
     * opened by a press moves focus; `every` opening all of them does not.
     */
    const fold = focusFold.current;
    focusFold.current = null;
    if (fold === null) return;
    firstLines.current.get(fold)?.focus();
  }, [opened]);

  function open(index: number) {
    focusFold.current = index;
    setOpened((current) => new Set(current).add(index));
  }

  function lines(index: number, of: readonly DiffLine[], target: boolean) {
    return of.map((line, at) => (
      <Row
        key={at}
        line={line}
        words={words}
        wordsLang={wordsLang}
        target={
          target && at === 0
            ? (node) => {
                if (node === null) firstLines.current.delete(index);
                else firstLines.current.set(index, node);
              }
            : undefined
        }
      />
    ));
  }

  return (
    <section
      aria-label={label}
      aria-describedby={describedBy}
      lang={lang}
      data-m-flush=""
      className={cn(
        "overflow-hidden rounded-m-panel bg-m-plate shadow-m-plate",
        AURORA_GLASS,
        AURORA_IN_SECTION,
        className,
      )}
    >
      {blocks.map((block, index) => {
        // A hairline between blocks, none above the first, so the plate's own
        // edge is the top of the viewer.
        const rule = index === 0 ? undefined : "border-t border-m-hairline";

        if (block.kind === "fold") {
          if (opened.has(index)) {
            return (
              <div key={index} className={rule}>
                {lines(index, block.lines, true)}
              </div>
            );
          }
          return (
            <div key={index} className={rule}>
              <button
                type="button"
                aria-expanded={false}
                lang={wordsLang}
                onClick={() => {
                  open(index);
                }}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 border-b border-m-hairline bg-m-sunken px-4 py-1.5 aurora:bg-a-well",
                  "text-left text-m-meta font-medium text-m-accent-text hover:underline",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-m-ring",
                )}
              >
                <ChevronsUpDown
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                  strokeWidth={1.75}
                />
                {block.label}
              </button>
            </div>
          );
        }

        const heading: ReactNode = (
          <>
            <span>{block.section}</span>
            {/*
             * A space the flex row does not draw (whitespace between flex items
             * is not rendered) but the heading's name needs: without it the
             * section and the range are read as one word, "keep it21".
             */}{" "}
            <span lang={wordsLang} className="font-mono font-normal text-m-ink-3">
              {/* The pilcrow is a mark for the eye; "7 to 9" says the range. */}
              <span aria-hidden="true">{"\u00b6 "}</span>
              {block.range}
            </span>
          </>
        );

        return (
          <div key={index} className={rule}>
            {createElement(
              `h${String(headingLevel)}`,
              {
                className:
                  "flex flex-wrap items-baseline gap-x-2.5 border-b border-m-hairline bg-m-diff-band px-4 py-2 text-m-meta font-medium text-m-ink",
              },
              heading,
            )}
            {lines(index, block.lines, false)}
          </div>
        );
      })}
    </section>
  );
}
