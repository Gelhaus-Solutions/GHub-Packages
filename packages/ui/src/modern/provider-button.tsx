"use client";

import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import { providerFold } from "../provider-fold.js";

/**
 * A way in through somebody else, full width with the mark before the words
 * (GPlatform Identity sign-in, option A).
 *
 * **The lead is drawn in ink**, the inverse of the card: the provider most
 * people use, first and the strongest thing above the form. The accent stays
 * the form's own Continue, so there is still one primary on the screen.
 *
 * Shaped like the fields under it rather than like a button pill, so the
 * providers and the address read as one column of ways in.
 */
export interface ProviderButtonProps {
  /** The whole label, "Continue with GitHub", in the caller's language. */
  label: string;
  /** A `BrandMark`, or the image an administrator uploaded. Nothing draws the initial. */
  mark?: ReactNode;
  lead?: boolean;
  /** Drawn as held down while the round trip starts. */
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

const FILM =
  "hover:bg-[linear-gradient(var(--gm-hover),var(--gm-hover))] active:bg-[linear-gradient(var(--gm-active),var(--gm-active))]";

export function ProviderButton({
  label,
  mark,
  lead = false,
  busy = false,
  disabled = false,
  onClick,
  className,
}: ProviderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={clsx(
        "inline-flex h-11 w-full items-center justify-center gap-2.5 px-4 select-none",
        "rounded-m-control border text-m-label font-medium aurora:rounded-a-field aurora:text-[15px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
        "disabled:pointer-events-none disabled:opacity-60",
        lead
          ? "border-transparent bg-m-ink text-m-ground hover:bg-m-ink-2"
          : clsx(
              "border-m-control bg-m-plate text-m-ink shadow-m-quiet aurora:border-a-edge-button aurora:bg-a-field aurora:shadow-none",
              FILM,
            ),
        busy && "cursor-progress",
        className,
      )}
    >
      {mark}
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface ProviderChoice {
  /** The provider's slug, stable across renders. */
  id: string;
  label: string;
  mark?: ReactNode;
}

export interface ProviderGridProps {
  providers: readonly ProviderChoice[];
  onChoose: (id: string) => void;
  /** The fold control's words, given how many are hidden. */
  moreLabel: (remaining: number) => string;
  /** The one whose round trip is starting. */
  busyId?: string | null;
  className?: string;
}

/**
 * One column, the first as the lead, folded above six as console's grid is.
 * Nothing at all for an empty list.
 */
export function ProviderGrid({
  providers,
  onChoose,
  moreLabel,
  busyId = null,
  className,
}: ProviderGridProps) {
  const [expanded, setExpanded] = useState(false);
  if (providers.length === 0) return null;
  const fold = providerFold(providers.length, expanded);

  return (
    <div className={clsx("flex flex-col gap-2.5", className)}>
      {providers.slice(0, fold.shown).map((provider, index) => (
        <ProviderButton
          key={provider.id}
          label={provider.label}
          mark={provider.mark}
          lead={index === 0}
          busy={busyId === provider.id}
          disabled={busyId !== null && busyId !== provider.id}
          onClick={() => onChoose(provider.id)}
        />
      ))}
      {fold.remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-9 self-center rounded-m-control px-3 text-m-label text-m-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring"
        >
          {moreLabel(fold.remaining)}
        </button>
      )}
    </div>
  );
}
