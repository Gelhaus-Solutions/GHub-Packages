"use client";

import { clsx } from "clsx";
import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { Status } from "./status.js";

/**
 * What a hash is compared against, and the words for the outcome.
 *
 * One object rather than three optional props, so a verdict cannot be asked for
 * without its words: the expected value and the sentences arrive together or
 * not at all, and a verdict with no word is a coloured dot, which is the one
 * thing colour may never carry alone.
 */
export interface HashVerdict {
  /** The value this one should equal. Compared ignoring case and outer space. */
  expected: string;
  /** "Matches". */
  matchesLabel: ReactNode;
  /** "Does not match". */
  mismatchLabel: ReactNode;
  /** "Expected", set before the expected value when they differ. */
  expectedLabel: ReactNode;
}

/**
 * A hash, shortened in the middle, copied whole, opened in groups of eight, and
 * optionally judged against the value it should be.
 *
 * `CopyChip` is not used for the display, deliberately: it truncates at the
 * END, which hides the tail, and the head and the tail are the two halves
 * people actually compare. So this keeps CopyChip's behaviour (one stop, the
 * whole value copied and named, a refusal said out loud) and draws its own
 * short form: the first eight and the last six characters around an ellipsis.
 *
 * **The full value is always what is copied and what is named.** The short form
 * is for the eye; the button's accessible name carries all of it, so a screen
 * reader is never handed half a hash as if it were the hash.
 *
 * **The verdict is a word.** A mismatch is never a red value alone, and with no
 * expected value there is no verdict at all rather than a neutral one, because
 * a column of "nothing to say" marks trains the eye to skip the column.
 *
 * "Show full" is a disclosure: it opens the value in place, grouped in eights,
 * and the panel stays mounted and hidden when closed, like `Disclosure`.
 */
export interface HashProps {
  /** The hash, in hex. */
  value: string;
  /**
   * What it is, for the copy button's name: "Copy the sha256 of the English
   * text". Never a bare "Copy", which is the name of every one of these on a
   * screen with six.
   */
  label: string;
  /** The disclosure trigger: "Show full". */
  showFullLabel: ReactNode;
  /** The trigger once open. The same words when absent; `aria-expanded` says which. */
  hideFullLabel?: ReactNode;
  /** Announced after a copy: "Copied". */
  copiedLabel: ReactNode;
  /** Announced when the browser refuses the clipboard, saying to select it by hand. */
  refusedLabel: ReactNode;
  /** Absent for a hash that is only being shown. */
  verdict?: HashVerdict;
  className?: string;
}

/** How long the tick stays, the same as CopyChip's. */
const CONFIRM_MS = 1600;
const HEAD = 8;
const TAIL = 6;

/** First eight, an ellipsis, last six. A value too short to shorten is shown whole. */
function shortForm(hash: string): string {
  return hash.length <= HEAD + TAIL + 1 ? hash : `${hash.slice(0, HEAD)}…${hash.slice(-TAIL)}`;
}

/** Groups of eight, separated by real spaces so the browser can wrap between them. */
function grouped(hash: string): string {
  return (hash.match(/.{1,8}/gu) ?? []).join(" ");
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function Hash({
  value,
  label,
  showFullLabel,
  hideFullLabel,
  copiedLabel,
  refusedLabel,
  verdict,
  className,
}: HashProps) {
  const base = useId();
  const panelId = `${base}-full`;
  const verdictId = `${base}-verdict`;
  const expectedId = `${base}-expected`;

  const hash = value.trim();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "refused">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleared on unmount, for the reason CopyChip gives: a list revalidated
  // underneath it would otherwise set state on a component that has gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(hash);
      setCopy("copied");
    } catch {
      // Not thrown onwards. The value is on the screen and one press away from
      // being shown whole, so the recovery is selecting it, which the
      // announcement says.
      setCopy("refused");
    }
    timer.current = setTimeout(() => setCopy("idle"), CONFIRM_MS);
  };

  const matches = verdict === undefined ? undefined : same(hash, verdict.expected);
  const expected = verdict?.expected.trim() ?? "";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`${label}: ${hash}`}
          // The verdict and, on a mismatch, the expected value describe the
          // button, so somebody tabbing to it hears whether it matches without
          // having to explore the row.
          aria-describedby={
            matches === undefined ? undefined : matches ? verdictId : `${verdictId} ${expectedId}`
          }
          translate="no"
          /*
           * Joined with `clsx`, not merged with `cn`: tailwind-merge reads the
           * type step `text-m-meta` and the ink `text-m-ink-2` as two colours
           * and keeps only the ink.
           *
           * `control` rather than `hairline` for the edge, because this is the
           * edge of something a person has to find in order to use, so it owes
           * 3:1.
           */
          className={clsx(
            "inline-flex h-[26px] min-w-0 shrink-0 items-center gap-2 rounded-m-chip px-2",
            "border border-m-control bg-m-inset font-mono text-m-meta text-m-ink-2 tabular-nums",
            "hover:text-m-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
          )}
        >
          <span>{shortForm(hash)}</span>
          {copy === "copied" ? (
            <Check className="size-3 shrink-0 text-m-ok-ink" aria-hidden="true" />
          ) : (
            <Copy className="size-3 shrink-0 text-m-ink-3" aria-hidden="true" />
          )}
        </button>
        {/*
         * Beside the button rather than inside it, which is the one change from
         * CopyChip: a button's children are presentational, so a live region
         * inside one is not reliably exposed to assistive technology at all.
         */}
        <span role="status" className="sr-only">
          {copy === "copied" ? copiedLabel : copy === "refused" ? refusedLabel : null}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className={clsx(
            "min-h-6 rounded-m-chip text-m-meta font-medium text-m-accent-text",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
          )}
        >
          {open && hideFullLabel !== undefined ? hideFullLabel : showFullLabel}
        </button>
        {verdict === undefined ? null : (
          /*
           * The wrapper sets the type step as well as carrying the id, because
           * `Status` merges its `text-m-meta` through `cn` beside its ink and
           * loses it; inherited from here, the word is the size it is drawn at.
           */
          <span id={verdictId} className="text-m-meta">
            <Status level={matches === true ? "ok" : "crit"}>
              {matches === true ? verdict.matchesLabel : verdict.mismatchLabel}
            </Status>
          </span>
        )}
      </div>

      {verdict !== undefined && matches === false ? (
        <p id={expectedId} className="text-m-meta text-m-ink-2">
          {verdict.expectedLabel}{" "}
          <span translate="no" className="font-mono tabular-nums">
            {shortForm(expected)}
          </span>
        </p>
      ) : null}

      {/*
       * `hidden` rather than unmounted, as in `Disclosure`. Real spaces between
       * the groups, widened by word spacing, so the line can wrap between groups
       * and never inside one.
       */}
      <div id={panelId} hidden={!open} className="mt-2 flex flex-col gap-1">
        <p
          translate="no"
          className="font-mono text-m-meta break-words text-m-ink-2 tabular-nums [word-spacing:4px]"
        >
          {grouped(hash)}
        </p>
        {verdict !== undefined && matches === false ? (
          <p className="text-m-meta text-m-ink-2">
            {verdict.expectedLabel}{" "}
            <span translate="no" className="font-mono tabular-nums [word-spacing:4px]">
              {grouped(expected)}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
