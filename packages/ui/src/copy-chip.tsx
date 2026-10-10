"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn.js";

/**
 * A short mono string, and one press to take it away with you.
 *
 * In `packages/ui` because both consoles are full of strings whose only purpose
 * is to be used somewhere else: a compose project name, an image digest, an
 * unseal case reference, the command an operator has to run on a host the
 * broker could not reach. Every one of those is currently rendered as text
 * somebody selects by hand, on a screen where a mis-selected character is a
 * command that fails or, worse, one that acts on the wrong project. A second
 * copy of this in each app is how the two would end up disagreeing about
 * whether the feedback is a tick, a tooltip or nothing at all.
 *
 * It is a `button` rather than a chip with an icon in it, and that is the whole
 * accessibility argument. The affordance is the entire element, so it is one
 * tab stop, it activates on Enter and Space without being told to, and it
 * carries a real accessible name rather than a glyph beside an unlabelled span.
 * A copy icon that is only a click target is invisible to anybody not using a
 * mouse, which for a screen about an incident is exactly the wrong population
 * to exclude.
 *
 * The clipboard is allowed to refuse. It is a permissioned API, it is absent
 * over plain HTTP on anything but localhost, and a customer's console is
 * reached at a LAN address as often as not. So a refusal is a state this says
 * out loud rather than a promise silently broken: the string is on the screen
 * either way, and "press this" quietly doing nothing is the failure that costs
 * somebody a minute of pressing it again.
 */
export interface CopyChipProps {
  /** The string, shown and copied. Short: this is a chip, not a code block. */
  value: string;
  /**
   * What it is, for the button's accessible name.
   *
   * "Copy" alone is the name of every one of these on a screen with six, and a
   * screen reader listing them then offers six identical buttons. Named, they
   * are "copy the command for gdocs" and "copy the case reference".
   */
  label: string;
  className?: string;
}

/** How long the tick stays before the chip goes back to offering the copy. */
const CONFIRM_MS = 1600;

export function CopyChip({ value, label, className }: CopyChipProps) {
  const [state, setState] = useState<"idle" | "copied" | "refused">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleared on unmount, because the chip lives in a list that a revalidate
  // replaces underneath it and a timer setting state on a gone component is a
  // warning in the console of a screen somebody is reading during an incident.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Not thrown onwards and not logged. The string is already on the screen,
      // so the recovery is "select it yourself", which is what the chip now
      // says. There is nothing here an operator can do about the permission.
      setState("refused");
    }
    timer.current = setTimeout(() => setState("idle"), CONFIRM_MS);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      // The value is in the name as well as the label, because the chip's own
      // text is the thing being copied and a button announced as only "copy the
      // command" leaves a reader pressing it to find out what it holds.
      aria-label={`${label}: ${value}`}
      className={cn(
        "numeric inline-flex h-[26px] min-w-0 shrink-0 items-center gap-2 rounded-(--radius-sm)",
        "border border-(--gc-border-hairline) bg-inset px-[9px] text-3xs text-fg-secondary",
        "transition-colors hover:border-(--gc-border-subtle) hover:text-fg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
        "aurora:rounded-full aurora:border-m-hairline aurora:bg-a-well aurora:px-2.5 aurora:text-[12px] aurora:text-m-ink-2 aurora:hover:text-m-ink aurora:focus-visible:outline-m-ring",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      {state === "copied" ? (
        <Check className="size-3 shrink-0 text-ok-ink" aria-hidden="true" />
      ) : (
        <Copy className="size-3 shrink-0 text-fg-tertiary" aria-hidden="true" />
      )}
      {/*
        Announced rather than only coloured, and out of the flow so the chip
        does not change width when it changes state. A tick is the whole
        feedback for anybody who can see it and no feedback at all otherwise.
      */}
      <span className="sr-only" role="status">
        {state === "copied"
          ? "copied"
          : state === "refused"
            ? "this browser would not let the page copy it, so select it by hand"
            : ""}
      </span>
    </button>
  );
}
