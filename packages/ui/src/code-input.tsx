"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn.js";
import {
  backspaceAt,
  cleanCode,
  codeOf,
  deleteAt,
  nextBox,
  toBoxes,
  writeAt,
} from "./code-entry.js";
import { fieldBorderTone, isRefused } from "./field-state.js";

/**
 * One code, one box per character.
 *
 * Four screens across the family need this and every one of them is a person
 * copying characters from somewhere else: an authenticator, a message, a
 * television, a piece of paper they wrote ten codes on. Six inputs styled to
 * look like this is the easy part. What the component is actually for is the
 * behaviour underneath, because that is where six hand-rolled copies drift.
 *
 * **Paste is the one that matters.** Somebody who copies a code copies all of
 * it, and a browser puts the whole string in whichever box has focus. So paste
 * is intercepted, cleaned, and distributed from the box it landed in, which
 * also means pasting into the middle after a mistyped character does the
 * obvious thing rather than filling one box with six characters.
 *
 * **One name, one error.** The group is a `fieldset` with a `legend`, so it has
 * a single accessible name, and each box says which character it is inside that
 * group. A wrong code is one message about the code, not six identical messages
 * about six boxes, and it is announced once.
 *
 * **It posts.** The boxes are unnamed and a hidden input carries the joined
 * value, the same bridge `Combobox` uses, so this works inside a `<form action>`
 * without any JavaScript on the receiving side.
 *
 * Not a `Input` with `maxLength`, and not six of them: the movement rules, the
 * paste distribution and the single error are the component.
 *
 * The rules themselves are in `code-entry.ts`, where a test can reach them.
 * This file is the boxes, the focus and the bridge to FormData.
 */

export interface CodeInputProps {
  /** The name the joined value posts under. */
  name: string;
  /** How many characters. Six for an authenticator or an emailed code, eight for a device code. */
  length?: number;
  /** The group's accessible name. Rendered as the legend. */
  label?: ReactNode;
  hint?: ReactNode;
  /** One message about the code. Never one per box. */
  error?: ReactNode;
  /**
   * Refused, with the sentence saying so somewhere other than under the boxes.
   *
   * The same crit borders and the same `aria-invalid` as `error`, and the hint
   * is left where it is. This exists because `error` replaces the hint, and on
   * a code field the hint is usually the sentence explaining why the obvious
   * answer is not the answer: that both factors are being asked for, that a
   * recovery code works here too. Somebody who has just been refused is the
   * reader that sentence was written for, so a refusal that removes it takes
   * away the explanation at the moment it starts mattering.
   *
   * Use `error` where the refusal is about the code and belongs under it. Use
   * this where the screen says it somewhere better: a block beside the field, a
   * summary above the form.
   */
  invalid?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Fired once the last box is filled, which is where a sign-in usually submits. */
  onComplete?: (value: string) => void;
  /** Digits only, and the numeric keypad on a phone. */
  numeric?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function CodeInput({
  name,
  length = 6,
  label,
  hint,
  error,
  invalid,
  value,
  defaultValue = "",
  onChange,
  onComplete,
  numeric = false,
  disabled = false,
  autoFocus = false,
  className,
}: CodeInputProps) {
  const messageId = useId();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const refused = isRefused(error, invalid);

  /**
   * The boxes are the state, not the joined string.
   *
   * A controlled `value` is still a string, because that is what a caller has,
   * but a gap in the middle cannot be expressed in one. So an uncontrolled field
   * keeps positions and a controlled one is padded from the left, which is the
   * honest reading of a string that has no holes in it.
   */
  const [uncontrolled, setUncontrolled] = useState(() =>
    toBoxes(cleanCode(defaultValue, numeric, length), length),
  );

  const characters = useMemo(
    () => (value === undefined ? uncontrolled : toBoxes(cleanCode(value, numeric, length), length)),
    [length, numeric, uncontrolled, value],
  );
  const current = codeOf(characters);

  /** Move focus, and select what is there so typing replaces rather than appends. */
  const focusBox = useCallback((index: number) => {
    const box = boxes.current[index];
    box?.focus();
    box?.select();
  }, []);

  const apply = useCallback(
    (edit: { boxes: string[]; focus: number }) => {
      const code = codeOf(edit.boxes);
      if (value === undefined) setUncontrolled(edit.boxes);
      onChange?.(code);
      focusBox(edit.focus);
      // A gap makes this shorter than the field, so a code with a hole in the
      // middle cannot fire this, which is right: it is not finished.
      if (code.length === length) onComplete?.(code);
    },
    [focusBox, length, onChange, onComplete, value],
  );

  const write = useCallback(
    (index: number, incoming: string) => {
      apply(writeAt(characters, index, incoming, numeric));
    },
    [apply, characters, numeric],
  );

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      apply(backspaceAt(characters, index));
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      apply(deleteAt(characters, index));
      return;
    }
    const moved = nextBox(event.key, index, length);
    if (moved !== null) {
      event.preventDefault();
      focusBox(moved);
    }
  };

  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    write(index, event.clipboardData.getData("text"));
  };

  const described = error !== undefined || hint !== undefined ? messageId : undefined;

  return (
    <fieldset
      className={cn("min-w-0 border-0 m-0 p-0", className)}
      disabled={disabled}
      aria-describedby={described}
    >
      {label === undefined ? null : (
        <legend className="p-0 mb-2 text-xs font-medium text-fg-secondary">{label}</legend>
      )}

      <div className="flex gap-1.5">
        {characters.map((character, index) => (
          <input
            // The boxes are positional, fixed in number and never reordered or
            // filtered, so the index is the identity rather than standing in for
            // one that got lost.
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            type="text"
            inputMode={numeric ? "numeric" : "text"}
            // Only the first box takes it: a browser filling a one-time code
            // puts the whole string in one field, and paste distribution is what
            // spreads it. Six of these makes six autofill targets for one code.
            autoComplete={index === 0 ? "one-time-code" : "off"}
            autoCorrect="off"
            spellCheck={false}
            maxLength={1}
            value={character}
            aria-label={`Character ${index + 1} of ${length}`}
            aria-invalid={refused ? true : undefined}
            autoFocus={autoFocus && index === 0}
            onChange={(event) => write(index, event.target.value)}
            onKeyDown={onKeyDown(index)}
            onPaste={onPaste(index)}
            onFocus={(event) => event.target.select()}
            className={cn(
              "flex-1 min-w-0 h-11 text-center font-mono tabular-nums text-lg",
              "bg-inset text-fg border rounded-(--radius-md)",
              "border-(--gc-border-control) transition-colors duration-(--duration-instant)",
              "hover:border-(--gc-border-strong)",
              "focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--gc-accent-wash)]",
              "disabled:opacity-45 disabled:cursor-not-allowed",
              // Through the shared rule rather than the copy of the crit border
              // that used to be spelled out here. Two spellings of one border is
              // how the boxes and the text fields end up disagreeing about what
              // a refused control looks like.
              fieldBorderTone(refused, undefined),
            )}
          />
        ))}
      </div>

      {/* The bridge to FormData. The boxes are unnamed so this posts once. */}
      <input type="hidden" name={name} value={current} />

      {error !== undefined ? (
        // One message about the code. `alert` rather than a polite region
        // because it replaces something the reader has just submitted.
        <p id={messageId} role="alert" className="mt-1.5 text-2xs text-crit-ink">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={messageId} className="mt-1.5 text-2xs text-fg-tertiary">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
