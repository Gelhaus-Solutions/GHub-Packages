import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * A range and a total, and two buttons. No page numbers.
 *
 * **Never a page count somebody has to divide to understand.** "Page 3 of 9"
 * asks a person to multiply to find out where they are in 214 records; "showing
 * 51 to 75 of 214" tells them. Under ten pages there is nothing a numbered
 * control buys that Back and Next do not.
 *
 * **Inactive is expressed as no material**, which is the rule everywhere in
 * modern rather than a choice here: a disabled button loses its highlight as
 * well as its ink, so it stops looking like a raised thing at all. A greyed
 * label on a control that still looks pressable is the version people keep
 * clicking.
 */
export interface PaginationProps {
  /**
   * The whole sentence, from the caller. It contains three numbers and a noun
   * and it is different in every language, so a component with no locale has no
   * business assembling it.
   */
  summary: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  /** Required: a control whose label this component invented would be wrong. */
  backLabel: ReactNode;
  nextLabel: ReactNode;
  className?: string;
}

export function Pagination({
  summary,
  onBack,
  onNext,
  backLabel,
  nextLabel,
  className,
}: PaginationProps) {
  const button = (onPress: (() => void) | undefined, label: ReactNode) => (
    <button
      type="button"
      disabled={onPress === undefined}
      onClick={onPress}
      className={cn(
        "h-9 rounded-m-control px-3 text-m-label",
        onPress === undefined
          ? // No border, no plate, no shadow. Nothing raised is left.
            "text-m-ink-off aurora:rounded-full"
          : "border border-m-control bg-m-plate text-m-ink shadow-m-quiet aurora:rounded-full aurora:border-a-edge-button aurora:bg-transparent aurora:shadow-none aurora:hover:bg-m-hover",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      {/*
       * Mono on the figures is the caller's job inside `summary`, because only
       * the caller knows which parts of its sentence are numbers.
       */}
      <p className="text-m-meta text-m-ink-3">{summary}</p>
      <div className="flex gap-2">
        {button(onBack, backLabel)}
        {button(onNext, nextLabel)}
      </div>
    </div>
  );
}
