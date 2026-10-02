"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { FormField } from "./form-field.js";
import { Input, type InputHeight } from "./input.js";
import { Status } from "./status.js";
import { typedConfirmationMatches } from "./typed-confirmation-match.js";

/**
 * A field where somebody types back a string the screen shows them, before an
 * action that cannot be undone: a campaign's title and its count, an account's
 * address, a product's name.
 *
 * It exists because `FormField` can refuse a value but cannot show the string
 * to be typed, and has no way to say a value is right. Both are the point here.
 *
 * **The expected string is part of the field's description**, before the hint
 * or the error, so a screen reader announces what to type when the field is
 * reached rather than leaving somebody to go and find it.
 *
 * **"Matches" appears the moment it is true; a mismatch waits.** It shows on
 * blur and when the caller says a submit was attempted, never while typing: a
 * half-typed title is not wrong yet, and red on the third keystroke tells
 * somebody they are failing at something they have not finished. Typing again
 * after a blur takes the mismatch away until the next blur, because it was a
 * verdict on what was there when they left.
 *
 * **Paste is allowed, deliberately.** Blocking it fails people who dictate or
 * use a password manager and protects nothing: the point is that a person
 * looked at the string, and somebody who copies it has looked at it.
 *
 * The match is announced politely and once. The status region is always in the
 * DOM, empty until it matches, because a live region that is mounted with its
 * text already in it is not announced by most screen readers.
 */
export interface TypedConfirmationProps {
  /** What to type, as an instruction: "Type the campaign's title". */
  label: ReactNode;
  /** The string to type. Shown above the field and compared against. */
  expected: string;
  value: string;
  /**
   * Receives the new value and whether it now matches, so a caller can enable
   * its confirm without repeating the rule. `typedConfirmationMatches` is the
   * same rule for the server.
   */
  onChange: (value: string, matches: boolean) => void;
  /** The word shown once it matches: "Matches". */
  matchesLabel: ReactNode;
  /**
   * The sentence that replaces the hint on a mismatch, saying what to do.
   *
   * A function when the sentence depends on what was typed. A count that equals
   * another figure on the screen is the case this is for: somebody who typed
   * the number of accounts where the number of addresses was asked is told
   * which number they typed ("151 is the number of accounts."), which a fixed
   * sentence cannot say.
   */
  mismatch: ReactNode | ((typed: string) => ReactNode);
  /** Shown while there is no verdict. Replaced by "Matches" or the mismatch. */
  hint?: ReactNode;
  /**
   * Shows a mismatch whatever the field's focus, for a submit that was
   * attempted. While true, a value that does not match is refused, typing or
   * not; the caller decides when to clear it.
   */
  showMismatch?: boolean;
  /**
   * Mono in the FIELD, for a count, an address or an identifier. The expected
   * string above it is always mono, because it is being compared character by
   * character, but a title is still a phrase somebody types as words.
   */
  mono?: boolean;
  /** 44 by default, which is the height the design gives typed confirmations. */
  height?: InputHeight;
  name?: string;
  /** `numeric` for a count, so a phone offers digits. */
  inputMode?: "text" | "numeric" | "email";
  /** For a short value such as a count, which should not span the column. */
  inputClassName?: string;
  className?: string;
}

export function TypedConfirmation({
  label,
  expected,
  value,
  onChange,
  matchesLabel,
  mismatch,
  hint,
  showMismatch = false,
  mono = false,
  height = 44,
  name,
  inputMode,
  inputClassName,
  className,
}: TypedConfirmationProps) {
  const expectedId = useId();
  const matches = typedConfirmationMatches(value, expected);
  /*
   * Set on blur when something was typed, cleared on the next keystroke. An
   * empty field left behind is not a wrong answer, it is no answer yet; the
   * submit path covers that case through `showMismatch`.
   */
  const [left, setLeft] = useState(false);
  const refused = !matches && (showMismatch || left);

  return (
    <FormField
      label={label}
      className={className}
      // Exactly one sentence under the field: the hint at rest, "Matches", or
      // the mismatch. The match takes the hint's place visually below, inside
      // the status region, so the hint is withdrawn rather than shown beside it.
      hint={matches || refused ? undefined : hint}
      error={refused ? (typeof mismatch === "function" ? mismatch(value) : mismatch) : undefined}
    >
      {(control) => (
        <>
          {/*
           * `translate="no"`, because a page translated by the browser would
           * otherwise show a translated title, the person would type that, and
           * it would never match the string the server compares against.
           */}
          <p
            id={expectedId}
            translate="no"
            className="font-mono text-m-meta break-words text-m-ink-2 tabular-nums"
          >
            {expected}
          </p>
          <Input
            id={control.id}
            aria-invalid={control["aria-invalid"]}
            aria-describedby={[expectedId, control["aria-describedby"]]
              .filter((id) => id !== undefined)
              .join(" ")}
            name={name}
            inputMode={inputMode}
            height={height}
            mono={mono}
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              setLeft(false);
              onChange(next, typedConfirmationMatches(next, expected));
            }}
            onBlur={() => {
              setLeft(value.trim() !== "");
            }}
            /*
             * Everything a phone would otherwise do to the text is off: a
             * capital letter added at the start, a word corrected, a previous
             * entry offered. Each one silently changes the string being
             * compared, and the person sees only that it does not match.
             */
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(refused ? "border-m-crit" : "", inputClassName)}
          />
          {/*
           * The status region, mounted from the start and empty until the value
           * matches. Visually hidden while empty, so it takes no row in the
           * column; it becomes the visible verdict in the same node, which is
           * what keeps the announcement reliable.
           *
           * `text-m-meta` here as well as inside `Status`, because `Status`
           * merges its type step through `cn` beside its ink and loses it.
           */}
          <div role="status" className={matches ? "text-m-meta" : "sr-only"}>
            {matches ? <Status level="ok">{matchesLabel}</Status> : null}
          </div>
        </>
      )}
    </FormField>
  );
}
