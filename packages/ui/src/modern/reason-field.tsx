"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_FIELD } from "./aurora.js";

/**
 * A reason somebody else will read, with the count that says when it is long
 * enough.
 *
 * For the acts that need a why: a member of staff opening somebody's account,
 * suspending a company, refusing a request. The hint names who reads the
 * reason, because "a reason" written for an audit log and one mailed to the
 * person it is about are different sentences, and the writer should know which
 * one they are writing.
 *
 * **The count is a live region, the act's state is the caller's.** Under the
 * minimum the line says how many characters are missing, in crit ink; at it,
 * how many there are and that it is enough, in ok. `reasonIsEnough` is the
 * same rule as a function, so the button that performs the act stays disabled
 * with the line as its description rather than by a second count.
 */
export interface ReasonFieldLabels {
  /** "12 characters short". */
  short: (missing: number) => string;
  /** "52 characters · enough". */
  enough: (count: number) => string;
}

export interface ReasonFieldProps {
  /** The form field's name, which the server action reads. */
  name: string;
  label: ReactNode;
  /** Who reads it. Always worth saying. */
  hint?: ReactNode;
  /** Characters needed, counted after trimming. 40 by default. */
  minimum?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  labels: ReasonFieldLabels;
  required?: boolean;
  disabled?: boolean;
  /** The id of the count line, for the act's `aria-describedby`. */
  countId?: string;
  className?: string;
}

export const REASON_MINIMUM = 40;

/** Whether a reason is long enough: counted after trimming the ends. */
export function reasonIsEnough(text: string, minimum: number = REASON_MINIMUM): boolean {
  return text.trim().length >= minimum;
}

export function ReasonField({
  name,
  label,
  hint,
  minimum = REASON_MINIMUM,
  value,
  defaultValue = "",
  onChange,
  labels,
  required = false,
  disabled = false,
  countId,
  className,
}: ReasonFieldProps) {
  const base = useId();
  const fieldId = `${base}-field`;
  const hintId = `${base}-hint`;
  const lineId = countId ?? `${base}-count`;
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const count = text.trim().length;
  const enough = count >= minimum;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-[13px] font-medium text-m-ink-2">
        {label}
      </label>
      <textarea
        id={fieldId}
        name={name}
        value={text}
        required={required}
        disabled={disabled}
        aria-describedby={[hint === undefined ? null : hintId, lineId].filter(Boolean).join(" ")}
        aria-invalid={count > 0 && !enough ? true : undefined}
        onChange={(event) => {
          if (value === undefined) setOwn(event.target.value);
          onChange?.(event.target.value);
        }}
        className={cn(
          "min-h-[84px] w-full resize-y rounded-m-control border border-m-control bg-m-inset px-3 py-2.5 text-m-body text-m-ink",
          "placeholder:text-m-ink-3 focus:outline-none focus:border-m-accent disabled:opacity-60",
          AURORA_FIELD,
        )}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-[12.5px] leading-[18px] text-m-ink-3">
          {hint}
        </p>
      )}
      <p
        id={lineId}
        aria-live="polite"
        className={cn(
          "font-mono text-[12.5px] leading-[18px] tabular-nums",
          enough ? "text-m-ok-ink" : "text-m-crit-ink",
        )}
      >
        {enough ? labels.enough(count) : labels.short(minimum - count)}
      </p>
    </div>
  );
}
