import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn.js";

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "role" | "type" | "children" | "onChange"
> {
  checked: boolean;
  /** What it turns on, as the row would say it: "Fristen-Sync in this project". */
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * An on/off switch for a setting that takes effect at once, in a row of a
 * list (Integrate's K3): a 32 by 18px track, the control edge with the knob
 * at the start when off, accent filled with the knob at the end when on. A
 * button with `role="switch"`; Space and Enter flip it, as a button. It saves
 * through `onCheckedChange`, so it is not a form value: a form choosing
 * between two states wants `SegmentedControl` or a `Checkbox`.
 */
export function Switch({ checked, label, onCheckedChange, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border p-px",
        "transition-colors motion-reduce:transition-none",
        // A 24px target around the 18px track.
        "before:absolute before:-inset-x-0.5 before:-inset-y-1 before:content-['']",
        checked ? "border-m-accent bg-m-accent" : "border-m-control hover:border-m-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block size-3.5 rounded-full transition-transform motion-reduce:transition-none",
          checked ? "translate-x-3.5 bg-m-accent-on" : "bg-m-control",
        )}
      />
    </button>
  );
}
