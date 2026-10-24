"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { Button } from "./button.js";

/**
 * A secret on screen for the only time it will be: the value, Copy, and the
 * line that says it will not be shown again.
 *
 * A new token, a client secret, a directory's bearer token. The service keeps
 * a digest and can never show the value a second time, so this is the one
 * chance and the block says so in the warn colour rather than in a footnote.
 *
 * **Copy says it copied, out loud.** The button reads "Copied" for two seconds
 * and a polite live region says the same, so somebody who cannot see the
 * button change still knows the clipboard holds it. A browser that refuses the
 * clipboard leaves the value selectable, which is why it is in mono and wraps
 * anywhere rather than overflowing: a long secret has no word to break at.
 */
export interface ShownOnceLabels {
  /** The Copy button. */
  copy: string;
  /** Said and shown once the value is on the clipboard. */
  copied: string;
  /** "This is the only time it is shown. Store it somewhere safe now." */
  warning: ReactNode;
}

export interface ShownOnceProps {
  secret: string;
  /** What the secret is, for the Copy button's accessible name: "the token for the backup job". */
  what: string;
  labels: ShownOnceLabels;
  className?: string;
}

export function ShownOnce({ secret, what, labels, className }: ShownOnceProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused: the value stays on screen to select by hand.
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-m-control border border-[color-mix(in_oklch,var(--gm-accent)_40%,transparent)] bg-m-sunken px-4 py-3.5",
        "aurora:rounded-a-choice",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-[13.5px] leading-5 text-m-ink">
          {secret}
        </code>
        <Button
          variant="primary"
          size={36}
          onClick={() => void copy()}
          aria-label={`${labels.copy}: ${what}`}
        >
          {copied ? labels.copied : labels.copy}
        </Button>
      </div>
      <p className="text-[12.5px] leading-[18px] text-m-warn-ink">{labels.warning}</p>
      <span aria-live="polite" className="sr-only">
        {copied ? labels.copied : ""}
      </span>
    </div>
  );
}
