import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * The agreement a person gives before an account is theirs to use.
 *
 * In `packages/ui` because both consoles ask for it and a second copy is how
 * the two products start disagreeing about what consent looks like. The words
 * and the link are props rather than constants here: each service has its own
 * terms, and a component that hard-coded one product's URL would be wrong in
 * the other the day it was reused.
 *
 * **Never pre-checked, and there is no prop to make it so.** A box that arrives
 * ticked records that somebody did not untick it, which is not agreement and
 * would not be worth much if it were ever read back. `required` is on the input
 * so the browser refuses the submit before any of this reaches a server.
 *
 * The label wraps the control, so the whole sentence is the hit target rather
 * than a checkbox the size of a full stop. That is the accessibility half:
 * there is no `id`/`htmlFor` pair to get wrong, and no way to render this with
 * an unlabelled input.
 */
export interface TermsConsentProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "defaultChecked"
> {
  /** The sentence, with the link to the terms already inside it. */
  children: ReactNode;
  className?: string;
}

export function TermsConsent({ children, className, ...input }: TermsConsentProps) {
  return (
    <label className={cn("flex items-start gap-2.5", className)}>
      <input
        {...input}
        type="checkbox"
        required
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded-(--radius-xs) border border-(--gc-border-control) bg-base",
          "accent-(--gc-accent)",
          "focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-(--gc-ring)",
        )}
      />
      <span className="text-xs text-fg-secondary">{children}</span>
    </label>
  );
}
