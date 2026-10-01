import { useId, type ReactNode } from "react";
import { cn } from "../cn.js";

/** One rule a value has to satisfy, and whether it currently does. */
export interface FormFieldRule {
  /**
   * The sentence. Required, because the dot never appears without the words:
   * a red dot alone puts the whole meaning in a colour, which is the one thing
   * the colour rule forbids and which nobody using a screen reader receives.
   */
  text: ReactNode;
  /** Whether this rule is currently satisfied. */
  met: boolean;
}

/**
 * What the caller needs in order to wire the control it owns.
 *
 * Handed over rather than injected with `cloneElement`, which would work for a
 * bare `<input>` and break silently the moment somebody wraps theirs in a
 * fragment, a styled wrapper or a `Combobox`. An explicit bag is uglier at the
 * call site and it is the version that cannot half-work.
 */
export interface FormFieldControlProps {
  id: string;
  /**
   * The hint, the error and the rules, as ONE space-separated list. A control
   * with several describers needs them in one attribute; a second
   * `aria-describedby` silently replaces the first.
   */
  "aria-describedby": string | undefined;
  /** Present only when refused, because `aria-invalid="false"` is still noise. */
  "aria-invalid": true | undefined;
}

/**
 * Label, control, hint, error and rules as one anatomy. Absorbs `Allowance`.
 *
 * The five slots exist together because they describe one thing and were
 * drifting apart: a password rule list is a hint that happens to be a list, and
 * kept as its own component it ended up beside a field it was not attached to,
 * describing constraints the control never pointed at.
 *
 * **The error replaces the hint rather than joining it.** Both at once gives a
 * person two sentences about the same box, one of which is now wrong, and the
 * wrong one is the calm one they are more likely to believe.
 *
 * **Optional is said in the label, in words. Required is never marked**, because
 * nearly everything is, and an asterisk on almost every field marks nothing
 * while adding a symbol that has to be explained somewhere else.
 *
 * Validation timing is the caller's, and the design is explicit about it: on
 * blur and on submit, never while typing. A sentence that appears on the third
 * keystroke is telling somebody they are wrong before they have finished being
 * right.
 */
export interface FormFieldProps {
  label: ReactNode;
  /** Receives the id and ARIA wiring for the control it renders. */
  children: (control: FormFieldControlProps) => ReactNode;
  /** Shown while the field is resting. Replaced entirely by `error`. */
  hint?: ReactNode;
  /**
   * The refusal. It says what to do: never "invalid input", which tells a
   * person only that the machine is unhappy.
   */
  error?: ReactNode;
  /**
   * Rules, each with its own sentence and state. One `aria-describedby` target
   * rather than a live region: a list that announces on every keystroke talks
   * over the person typing.
   */
  rules?: readonly FormFieldRule[];
  className?: string;
}

export function FormField({ label, children, hint, error, rules, className }: FormFieldProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const rulesId = `${base}-rules`;

  const refused = error !== undefined;
  const hasRules = rules !== undefined && rules.length > 0;

  const describedBy =
    [refused ? errorId : hint === undefined ? undefined : hintId, hasRules ? rulesId : undefined]
      .filter((id): id is string => id !== undefined)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={controlId} className="text-m-control text-m-ink">
        {label}
      </label>

      {children({
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": refused ? true : undefined,
      })}

      {/*
       * Exactly one of these two, never both. The error is the same size as the
       * hint it replaces, so the field does not change height when it is
       * refused and the rest of the form does not jump.
       */}
      {refused ? (
        <p id={errorId} className="text-m-meta text-m-crit-ink">
          {error}
        </p>
      ) : hint === undefined ? null : (
        <p id={hintId} className="text-m-meta text-m-ink-3">
          {hint}
        </p>
      )}

      {hasRules ? (
        <ul id={rulesId} className="flex flex-col gap-1">
          {rules.map((rule, index) => (
            <li key={index} className="flex items-start gap-2 text-m-meta">
              {/*
               * `aria-hidden`, because the sentence beside it already carries
               * the state and a screen reader announcing a bullet adds nothing.
               * The words are never optional, so this decorates rather than
               * informs.
               */}
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  rule.met ? "bg-m-ok" : "bg-m-crit",
                )}
              />
              <span className={rule.met ? "text-m-ink-3" : "text-m-ink-2"}>{rule.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
