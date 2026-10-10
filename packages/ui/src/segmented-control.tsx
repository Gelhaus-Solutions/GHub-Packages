"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { choiceTabStop, nextChoice } from "./choice-roving.js";
import { cn } from "./cn.js";
import {
  AURORA_TRACK,
  AURORA_TRACK_ITEM,
  AURORA_TRACK_OFF,
  AURORA_TRACK_ON,
} from "./modern/aurora.js";

/**
 * Two to four exclusive options in one row, which is not navigation.
 *
 * The theme control is what this was drawn for: System, Light and Dark, sitting
 * in a row, one of them true at a time. `TabBand` is the closest thing already
 * here and it is the wrong one, not approximately right: it takes a render prop
 * for a link and marks its active item with `aria-current="page"`, which says
 * "this is the page you are on". A theme is not a page, and a reader told it is
 * one will look for a way back.
 *
 * A radio group is the correct semantics and there was no styled one, so this is
 * that. It shares `choice-roving.ts` with `ChoiceCards`, which is the point of
 * that module having been split out: the two controls look nothing alike and
 * owe the keyboard exactly the same contract, so one group is one tab stop and
 * the arrows choose inside it in both.
 *
 * Four options is the ceiling because the labels stop fitting, not because the
 * code minds. Past that the answer is `Select`, which gets the platform's own
 * picker on a phone rather than four words squeezed into a row.
 */

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: ReactNode;
  /** Announced instead of the label where the label is a glyph or an abbreviation. */
  ariaLabel?: string;
}

export interface SegmentedControlProps<K extends string = string> {
  /**
   * The group's accessible name.
   *
   * A required string rather than a node, for the reason `ChoiceCards` states:
   * this package has no locale and both consoles rendering it do, so the label
   * is passed in from the side that has next-intl.
   */
  label: string;
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

export function SegmentedControl<K extends string = string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<K>) {
  const group = useRef<HTMLDivElement>(null);
  // Nothing here is ever blocked: an option that cannot be picked in a row of
  // three is a row of two with a gap in it, and the answer is not rendering it.
  const enabled = options.map(() => true);
  const selected = options.findIndex((option) => option.key === value);
  const tabStop = choiceTabStop(selected, enabled);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const radios = [
      ...(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
    ];
    const focused = radios.findIndex((radio) => radio === document.activeElement);
    const moved = nextChoice(event.key, focused >= 0 ? focused : selected, enabled);
    if (moved === null) return;

    event.preventDefault();
    const option = options[moved];
    if (option === undefined) return;
    onChange(option.key);
    // Selection and focus move together, so the option that answers is the one
    // Tab comes back to. Same contract as ChoiceCards, same reason.
    radios[moved]?.focus();
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-(--radius-md) border p-0.5",
        "border-(--gc-border-hairline) bg-inset",
        AURORA_TRACK,
        className,
      )}
    >
      {options.map((option, at) => {
        const picked = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={picked}
            aria-label={option.ariaLabel}
            tabIndex={at === tabStop ? 0 : -1}
            onClick={() => onChange(option.key)}
            className={cn(
              "h-7 min-w-16 rounded-(--radius-sm) px-2.5 text-xs font-medium",
              AURORA_TRACK_ITEM,
              "aurora:min-w-0 aurora:focus-visible:outline-m-ring",
              "transition-colors duration-(--duration-instant)",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--gc-ring)",
              picked
                ? // The selected segment is raised rather than accented. The
                  // accent means "this can be acted on", and in a group where
                  // every segment can be pressed it would mark the one that
                  // cannot do anything new.
                  `bg-raised text-fg shadow-(--shadow-sm) ${AURORA_TRACK_ON}`
                : `text-fg-secondary hover:text-fg ${AURORA_TRACK_OFF}`,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
