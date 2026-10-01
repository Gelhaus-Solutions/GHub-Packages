"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./cn.js";
import { providerFold } from "./provider-fold.js";

/**
 * The ways in that belong to somebody else.
 *
 * Up to twelve family-wide providers, plus whatever an organisation has
 * configured for its own people. `Button` with `iconLeft` draws one of these
 * perfectly well, which is why the button is the smaller half of this file. The
 * grid is the part worth sharing, because the rules that matter only show up at
 * the counts nobody develops against.
 *
 * **It folds above six.** Twelve buttons is a scroll on a phone, on a screen
 * where the thing somebody actually came to do is above them. Five are shown
 * and the control names how many are left, rather than saying "more": a reader
 * deciding whether to look is deciding about a number.
 *
 * **One column at every count.** The proposal that asked for this suggested two
 * columns above six; the artboards are one column throughout and the fold is
 * what solves the length instead. Followed the drawing, because two columns of
 * 44px targets at the narrow width is how the fold got proposed in the first
 * place.
 *
 * **An organisation's own provider is not in here.** It sits above the fields
 * with a strong border rather than the accent, and the caller places it, because
 * it is a different claim: a company that has configured its own OIDC has made
 * it the way its people get in, where Google is merely available. Rendering it
 * in this list would sort it among twelve things that are noise to that reader.
 */

export interface ProviderButtonProps {
  /** What this provider is called, as its administrator named it. */
  label: string;
  /**
   * The provider's mark.
   *
   * Anything renderable, so an admin-configured provider carries its own from
   * the API and adding one costs no release here. Falls back to a monogram of
   * the first character, which is what the design draws for the twelve.
   */
  icon?: ReactNode;
  onClick?: () => void;
  /**
   * The one an organisation configured, which is placed above the fields rather
   * than in the grid.
   *
   * A strong border rather than the accent. The accent means "this is the thing
   * to press on this screen" and there is already one of those; this says "this
   * is how your company signs in", which is a statement about the reader rather
   * than about the screen.
   */
  emphasis?: "default" | "organisation";
  /** Said under the label, for the organisation's own provider only. */
  description?: ReactNode;
  className?: string;
}

export function ProviderButton({
  label,
  icon,
  onClick,
  emphasis = "default",
  description,
  className,
}: ProviderButtonProps) {
  const own = emphasis === "organisation";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-(--radius-md) border px-3 text-left",
        "text-sm font-medium transition-colors duration-(--duration-instant)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
        own
          ? "min-h-11 py-2 border-(--gc-border-strong) bg-inset text-fg hover:bg-hover"
          : "h-11 border-(--gc-border-control) bg-transparent text-fg hover:bg-hover",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-(--radius-sm) overflow-hidden",
          "border border-(--gc-border-hairline) bg-overlay",
          "font-mono text-3xs text-fg-tertiary",
        )}
      >
        {icon ?? label.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description === undefined ? null : (
          <span className="mt-0.5 block text-2xs font-normal text-fg-tertiary">{description}</span>
        )}
      </span>
    </button>
  );
}

export interface Provider {
  /** Stable across renders. The slug, not the display name. */
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface ProviderGridProps {
  providers: readonly Provider[];
  onChoose: (id: string) => void;
  /**
   * The fold control's words, given the number still hidden.
   *
   * A function rather than a string because the count is this component's to
   * work out and the sentence is the caller's to translate. This package has no
   * locale and both consoles rendering it do.
   */
  moreLabel: (remaining: number) => string;
  className?: string;
}

export function ProviderGrid({ providers, onChoose, moreLabel, className }: ProviderGridProps) {
  const [expanded, setExpanded] = useState(false);
  const fold = providerFold(providers.length, expanded);
  const shown = providers.slice(0, fold.shown);

  // A heading over nothing is worse than nothing, so an empty list renders
  // nothing at all rather than an empty container the caller has to test for.
  if (providers.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {shown.map((provider) => (
        <ProviderButton
          key={provider.id}
          label={provider.label}
          icon={provider.icon}
          onClick={() => onChoose(provider.id)}
        />
      ))}
      {fold.remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "flex h-11 w-full items-center justify-center rounded-(--radius-md) border px-3",
            "border-(--gc-border-hairline) bg-inset text-sm font-medium text-fg-secondary",
            "transition-colors duration-(--duration-instant) hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
          )}
        >
          {moreLabel(fold.remaining)}
        </button>
      ) : null}
    </div>
  );
}
