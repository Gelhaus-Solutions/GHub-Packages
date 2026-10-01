"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { choiceTabStop, nextChoice } from "./choice-roving.js";
import { cn } from "./cn.js";

/**
 * Two or three whole answers, said at full length, one of them picked.
 *
 * The control a dialog needs where the options are not more and less of the
 * same thing. Forgetting a record and destroying a deployment are different
 * operations, and a checkbox labelled "also delete data" is a way of asking
 * about the second one without saying it. So each option carries its own
 * sentence about what it does, and both sentences are in front of somebody at
 * the moment they choose rather than one of them behind a tooltip.
 *
 * Shared because both consoles end things. This one forgets and destroys a
 * customer's own deployments; the platform revokes and contains from the other
 * side, and two copies of this would be the two products disagreeing about how
 * much a person is owed before an irreversible answer.
 *
 * **Nothing is selected when it opens.** A destructive group that opens with an
 * answer already filled in is one people dismiss with the return key, and the
 * answer they dismiss it with is whichever the author happened to list first.
 *
 * **One tab stop, arrows inside.** See `choice-roving.ts`: Tab reaches the
 * group and leaves it, and the arrows choose within it. A group of buttons that
 * each took their own tab stop would walk somebody through every answer on the
 * way out of the dialog, selecting as they went.
 *
 * **`danger` marks what cannot be undone, not what sounds heavy.** It spends the
 * crit colour, and the colour has exactly one meaning: how bad this is. An
 * option that is merely the bigger of two reversible choices does not get it.
 */

export interface ChoiceOption<K extends string = string> {
  key: K;
  /** The answer itself, in the words somebody would use for it. */
  title: ReactNode;
  /** What it does and does not do. The half that makes the title decidable. */
  detail: ReactNode;
  /** Whether picking it cannot be undone. */
  danger?: boolean;
  /**
   * Why this build cannot carry it out, shown in place of the detail.
   *
   * The option stays visible rather than disappearing. An answer that vanishes
   * leaves somebody wondering whether the product can do the thing at all,
   * where one shown with its reason attached answers that.
   */
  blocked?: string | null;
}

export interface ChoiceCardsProps<K extends string = string> {
  /**
   * What the group is asking, for a screen reader.
   *
   * A prop rather than a string in here, because this package has no locale and
   * both consoles that render it do. Passing it in is what keeps the label
   * inside next-intl on the side that has it.
   */
  label: string;
  options: readonly ChoiceOption<K>[];
  /** `null` until somebody answers, which is how it opens. */
  value: K | null;
  onChange: (key: K) => void;
  className?: string;
}

export function ChoiceCards<K extends string = string>({
  label,
  options,
  value,
  onChange,
  className,
}: ChoiceCardsProps<K>) {
  const group = useRef<HTMLDivElement>(null);
  const enabled = options.map((option) => (option.blocked ?? null) === null);
  const selected = options.findIndex((option) => option.key === value);
  const tabStop = choiceTabStop(selected, enabled);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Where the arrows move from is where focus is, not what is selected. The
    // two are the same once somebody has answered and differ exactly once: a
    // group that opens unanswered puts focus on the first option without
    // checking it, and an arrow pressed there has to move off it rather than
    // select it. Reading the selection instead makes the first press a no-op
    // that looks like a broken key.
    const radios = [
      ...(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
    ];
    const focused = radios.findIndex((radio) => radio === document.activeElement);
    const moved = nextChoice(event.key, focused >= 0 ? focused : selected, enabled);
    if (moved === null) return;

    // The arrows own these keys inside a radio group. Left alone, Up and Down
    // would also scroll the dialog out from under the thing being chosen.
    event.preventDefault();
    const option = options[moved];
    if (option === undefined) return;

    onChange(option.key);
    // Selection and focus move together, which is what makes the group one
    // stop: the option that answers is the option Tab comes back to.
    radios[moved]?.focus();
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("space-y-2", className)}
    >
      {options.map((option, at) => {
        const blocked = (option.blocked ?? null) !== null;
        const picked = option.key === value;
        const danger = option.danger === true;

        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={picked}
            disabled={blocked}
            tabIndex={at === tabStop ? 0 : -1}
            onClick={() => onChange(option.key)}
            className={cn(
              "block w-full rounded-(--radius-md) border px-4 py-3 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
              blocked
                ? "cursor-not-allowed border-(--gc-border-hairline) bg-inset opacity-60"
                : picked
                  ? danger
                    ? "border-[color-mix(in_oklch,var(--gc-crit)_55%,transparent)] bg-crit-wash"
                    : "border-(--gc-border-strong) bg-raised"
                  : "border-(--gc-border-subtle) bg-inset hover:border-(--gc-border-strong)",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-2.5 text-xs font-medium",
                danger && !blocked ? "text-crit-ink" : "text-fg",
              )}
            >
              <Radio picked={picked} danger={danger} blocked={blocked} />
              {option.title}
            </span>
            <span className="mt-1.5 block pl-[1.375rem] text-2xs leading-[17px] text-fg-secondary">
              {option.blocked ?? option.detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A ring until it is picked, then filled.
 *
 * Drawn rather than an `input[type=radio]` because a native radio cannot be
 * given the crit colour in both themes without overriding the whole control
 * anyway. It is `aria-hidden` because the button around it already carries the
 * role and the checked state, and a second announcement of both is noise.
 */
function Radio({
  picked,
  danger,
  blocked,
}: {
  picked: boolean;
  danger: boolean;
  blocked: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-3.5 shrink-0 place-items-center rounded-full border",
        picked
          ? danger
            ? "border-crit"
            : "border-accent"
          : blocked
            ? "border-(--gc-border-hairline)"
            : "border-(--gc-border-strong)",
      )}
    >
      {picked ? (
        <span className={cn("size-1.5 rounded-full", danger ? "bg-crit" : "bg-accent")} />
      ) : null}
    </span>
  );
}
