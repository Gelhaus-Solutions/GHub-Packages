import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn.js";

export interface CheckboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "role" | "type" | "children"
> {
  checked: boolean | "mixed";
  /** What ticking it means: "Select all on this page", or the row's reference. */
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * A 16px checkbox for selecting rows: a 5px corner and the control edge
 * empty, accent filled with a check when ticked, and a dash when some but not
 * all are (`"mixed"`). A button with `role="checkbox"`, because a table row's
 * selection is not a form value; Space and Enter toggle it, as a button.
 */
export function Checkbox({ checked, label, onCheckedChange, className, ...rest }: CheckboxProps) {
  const on = checked !== false;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(checked !== true)}
      className={cn(
        "relative grid size-4 shrink-0 place-items-center rounded-[5px] text-m-accent-on",
        // A 24px target around the 16px box.
        "before:absolute before:-inset-1 before:content-['']",
        on ? "bg-m-accent" : "border border-m-control hover:border-m-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
        className,
      )}
      {...rest}
    >
      {checked === true ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : checked === "mixed" ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 12h12" />
        </svg>
      ) : null}
    </button>
  );
}
