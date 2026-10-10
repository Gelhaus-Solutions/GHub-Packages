import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Checkbox } from "./checkbox.js";

export interface BulkBarProps {
  /** "{n} selected", in the reader's language; announced politely as it changes. */
  selectedText: ReactNode;
  /** Clears the selection: the filled checkbox and the Clear verb both do. */
  onClear: () => void;
  clearLabel?: string;
  clearText?: ReactNode;
  /**
   * The bulk verbs as the caller's buttons, 30 high pills: the one that acts
   * in the accent (`BULK_PRIMARY`), the others edged (`BULK_SECONDARY`).
   */
  children: ReactNode;
  className?: string;
}

/** A bulk verb that acts: a 30px accent pill. */
export const BULK_PRIMARY =
  "inline-flex h-[30px] items-center rounded-full bg-m-accent px-3 text-[13px] font-medium text-m-accent-on hover:bg-m-accent-hover disabled:bg-m-ink/10 disabled:text-m-ink-off max-sm:h-11";
/** A bulk verb that downloads or exports: a 30px pill edged in ink at 14%. */
export const BULK_SECONDARY =
  "inline-flex h-[30px] items-center rounded-full border border-m-ink/14 px-3 text-[13px] text-m-ink hover:bg-m-hover disabled:text-m-ink-off max-sm:h-11";

/**
 * What a table offers while rows are selected (K17). It takes the header
 * row's place: the filled checkbox with a dash clears the selection, the
 * count says how many, and the bulk verbs follow. Bulk verbs act on the
 * selected rows only, never on the whole result.
 */
export function BulkBar({
  selectedText,
  onClear,
  clearLabel = "Clear selection",
  clearText = "Clear",
  children,
  className,
}: BulkBarProps) {
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-m-accent/40 bg-[linear-gradient(90deg,var(--gm-accent-wash),transparent_70%)] px-4 py-1",
        className,
      )}
    >
      <Checkbox checked="mixed" label={clearLabel} onCheckedChange={onClear} />
      <span role="status" className="ml-2 text-[13px] font-medium text-m-ink">
        {selectedText}
      </span>
      <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-m-hairline" />
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex h-[30px] items-center rounded-full px-3 text-[13px] text-m-ink-2 hover:bg-m-hover hover:text-m-ink max-sm:h-11"
      >
        {clearText}
      </button>
    </div>
  );
}
