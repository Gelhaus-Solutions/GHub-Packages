import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * What a change gains and what it costs, one sentence each.
 *
 * **The strings come from the resolver and are never composed in the view.**
 * That is the entire reason this is shared rather than written twice. The
 * platform shows these to staff before reissuing a licence at a lower tier, and
 * this console shows the same sentences to the customer on their own instance
 * when a lease narrows. Two view layers formatting the same downgrade is how
 * the two products start disagreeing about what it costs, in front of the
 * person paying for it.
 *
 * So this component takes sentences and arranges them. It does not build one,
 * it has no access to a grant or a tier, and it must not grow a prop that lets
 * a caller pass a template: the moment it can format, one side will format
 * differently.
 *
 * **Losses only is warn, gains only is ok, both is both, and nothing renders
 * nothing.** An empty box saying "no changes" is a box somebody has to read to
 * discover it says nothing, and on a confirmation screen it reads as though the
 * change was not understood.
 */
export interface ChangeListProps {
  /** What the change adds. Sentences from the resolver, never composed here. */
  gains?: readonly ReactNode[];
  /** What it takes away. The half a person is entitled to see before agreeing. */
  losses?: readonly ReactNode[];
  title?: ReactNode;
  /**
   * The two column headings.
   *
   * Props rather than literals because every user-visible string in this
   * product goes through next-intl, and a component in the design system has
   * no locale of its own: the caller has one and this does not. They were
   * hardcoded English, so a console that translated `title`, `foot` and every
   * sentence in both columns still shipped two English headings above them.
   *
   * This is not the template prop the note above forbids. A fixed heading
   * cannot format a change, which is the thing that would let the two products
   * describe the same downgrade differently. It is the same shape as `title`.
   */
  gainsLabel?: ReactNode;
  lossesLabel?: ReactNode;
  /** One line under both columns: when it applies, what is kept, what is not. */
  foot?: ReactNode;
  className?: string;
}

export function ChangeList({
  gains,
  losses,
  title,
  gainsLabel = "You gain",
  lossesLabel = "You lose",
  foot,
  className,
}: ChangeListProps) {
  const gained = gains ?? [];
  const lost = losses ?? [];

  // Nothing rather than an empty box. A caller that has no change to show
  // should render no block at all, and making that this component's decision
  // means no caller has to remember it.
  if (gained.length === 0 && lost.length === 0) return null;

  const tone = lost.length === 0 ? "ok" : gained.length === 0 ? "warn" : "mixed";

  return (
    <div
      className={cn(
        "rounded-(--radius-md) border px-4 py-3",
        tone === "ok" && "border-[color-mix(in_oklch,var(--gc-ok)_30%,transparent)] bg-ok-wash",
        tone === "warn" &&
          "border-[color-mix(in_oklch,var(--gc-warn)_35%,transparent)] bg-warn-wash",
        // Both: neither colour, because tinting it one of them would say the
        // change is on balance good or bad, which is the reader's judgement to
        // make and the whole reason both lists are shown.
        tone === "mixed" && "border-(--gc-border-hairline) bg-inset",
        className,
      )}
    >
      {title === undefined ? null : (
        <p
          className={cn(
            "mb-2 text-sm font-medium tracking-[-0.01em]",
            tone === "ok" ? "text-ok-ink" : tone === "warn" ? "text-warn-ink" : "text-fg",
          )}
        >
          {title}
        </p>
      )}

      <div className={cn("grid gap-x-8 gap-y-3", tone === "mixed" && "sm:grid-cols-2")}>
        {gained.length === 0 ? null : (
          <Column heading={gainsLabel} items={gained} mark="ok" ink="text-ok-ink" />
        )}
        {lost.length === 0 ? null : (
          <Column heading={lossesLabel} items={lost} mark="warn" ink="text-warn-ink" />
        )}
      </div>

      {foot === undefined ? null : (
        // Secondary, not tertiary. This block's ground is a status wash in two
        // of its three tones, and tertiary is calibrated against the plain
        // surfaces: over `--gc-warn-wash` it measures 3.49:1 in dark. The foot
        // is where the caller says when the change applies and what survives
        // it, which is not a line to lose.
        <p className="mt-3 border-t border-(--gc-border-hairline) pt-2.5 text-2xs leading-[17px] text-fg-secondary">
          {foot}
        </p>
      )}
    </div>
  );
}

function Column({
  heading,
  items,
  mark,
  ink,
}: {
  heading: ReactNode;
  items: readonly ReactNode[];
  mark: "ok" | "warn";
  ink: string;
}) {
  return (
    <div className="min-w-0">
      <p className={cn("label-caps mb-1.5", ink)}>{heading}</p>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-2xs leading-[17px] text-fg-secondary">
            <span
              aria-hidden="true"
              className={cn(
                "mt-[6px] size-1 shrink-0 rounded-full",
                mark === "ok" ? "bg-ok" : "bg-warn",
              )}
            />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
