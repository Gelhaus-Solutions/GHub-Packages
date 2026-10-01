"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn.js";
import {
  FIELD_MESSAGE_TONES,
  fieldBorderTone,
  fieldDescribedBy,
  fieldMessageId,
  isRefused,
  type FieldStatus,
} from "./field-state.js";

/**
 * Form controls, hand-rolled.
 *
 * Two constraints shape these: every control inside a `<form action>` must carry a
 * real named input so server actions keep working, and every control must be fully
 * keyboard operable. Native elements are used where they already win (text inputs).
 * The searchable select that does not is `Combobox`, which is hand-rolled against
 * the ARIA combobox pattern and bridges to FormData with a hidden input.
 */

export interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Colours `hint` with the status ramp, for a field whose value is being
   * checked somewhere else. Ignored when `error` is set, because a refusal
   * outranks a report of one being awaited.
   */
  status?: FieldStatus;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  label,
  hint,
  error,
  status,
  required,
  htmlFor,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn("min-w-0", className)}>
      {label === undefined ? null : (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-secondary mb-1.5">
          {label}
          {required === true ? <span className="text-crit-ink ml-0.5">*</span> : null}
        </label>
      )}
      {children}
      {error !== undefined ? (
        <p id={fieldMessageId(htmlFor)} className="mt-1.5 text-2xs text-crit-ink">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p
          id={fieldMessageId(htmlFor)}
          className={cn(
            "mt-1.5 text-2xs",
            status === undefined ? "text-fg-tertiary" : FIELD_MESSAGE_TONES[status],
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Two heights, and the second one is a target rather than a taste.
 *
 * `md` is 32px and is what a dense console screen wants. `xl` is 44px, for the
 * narrow width, where a person is holding the machine and WCAG 2.2's target size
 * rule is a floor rather than a preference. Matching `Button`'s `xl` so a field
 * and the button under it are the same height, which is the whole reason both
 * arrived at once.
 */
export const CONTROL_SIZES = ["md", "xl"] as const;
export type ControlSize = (typeof CONTROL_SIZES)[number];

const controlSizes: Record<ControlSize, string> = {
  md: "h-8 px-2.5 text-sm",
  xl: "h-11 px-3 text-sm",
};

const controlClasses = [
  "w-full bg-inset text-fg placeholder:text-fg-tertiary",
  "border border-(--gc-border-control) rounded-(--radius-md)",
  "text-sm",
  "transition-colors duration-(--duration-instant)",
  "hover:border-(--gc-border-strong)",
  "focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--gc-accent-wash)]",
  "disabled:opacity-45 disabled:cursor-not-allowed",
];

/**
 * `size` is ours, so the native attribute of that name is dropped.
 *
 * On a text input it is a width hint measured in characters that nothing here
 * has ever set, and on a select it is a row count that turns it into a list box.
 * Leaving both reachable would mean `size="xl"` and `size={20}` are the same
 * prop, which typechecks under a union and does two unrelated things.
 */
type WithoutNativeSize<T> = Omit<T, "size">;

export interface InputProps extends WithoutNativeSize<InputHTMLAttributes<HTMLInputElement>> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Colours the border and the hint. See `FieldStatus`. Outranked by `error`. */
  status?: FieldStatus;
  /**
   * Refused, with the sentence saying so somewhere other than under this field.
   *
   * Same crit border and same `aria-invalid` as `error`, and the hint is left
   * alone. For a form whose refusal is stated once above it, or beside it, and
   * would read as noise repeated into every field it applies to. See
   * `isRefused`.
   */
  invalid?: boolean;
  /**
   * Sits inside the field, at the trailing edge.
   *
   * For a fact about the value that belongs beside it rather than under it: a
   * unit, a currency, a badge naming what a checked identifier came back as. It
   * is not a control and must not contain one. A button inside a text field is
   * reachable by keyboard only after the whole value, which is the wrong order
   * for the one case anybody wants it, and `Button` beside the field is both
   * clearer and already works.
   *
   * The field becomes a flex row when this is set and stays a bare `input` when
   * it is not, so nothing that never asked for it changes shape.
   */
  trailing?: ReactNode;
  /** Set for ids, digests and anything else compared character by character. */
  mono?: boolean;
  size?: ControlSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    status,
    invalid,
    trailing,
    mono = false,
    size = "md",
    className,
    id,
    required,
    "aria-describedby": describedByProp,
    ...props
  },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  const refused = isRefused(error, invalid);
  const tone = fieldBorderTone(refused, status);

  const field = (
    <input
      ref={ref}
      id={inputId}
      required={required}
      aria-invalid={refused ? true : undefined}
      aria-describedby={fieldDescribedBy(
        inputId,
        error !== undefined || hint !== undefined,
        describedByProp,
      )}
      className={cn(
        trailing === undefined
          ? [controlClasses, controlSizes[size], tone]
          : // Inside the shell below, which owns the border, the background and
            // the focus ring. The control keeps its own height and text so a
            // field with a badge in it lines up with one without.
            [
              "min-w-0 flex-1 bg-transparent text-fg placeholder:text-fg-tertiary",
              "border-0 outline-none focus:outline-none",
              "disabled:cursor-not-allowed",
              controlSizes[size].replace("px-2.5", "pl-2.5 pr-2").replace("px-3", "pl-3 pr-2"),
            ],
        mono && "numeric",
        className,
      )}
      {...props}
    />
  );

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      status={status}
      required={required}
      htmlFor={inputId}
    >
      {trailing === undefined ? (
        field
      ) : (
        /*
          `focus-within` rather than `focus`, because the thing being focused is
          the input and the thing that has to show it is the box around it. A
          ring on the input alone would draw inside its own border and leave the
          badge sitting outside a focused control.
        */
        <div
          className={cn(
            controlClasses.map((one) =>
              one
                .replaceAll("focus:", "focus-within:")
                .replace("w-full ", "flex w-full items-center gap-2 ")
                .replace(
                  "disabled:opacity-45 disabled:cursor-not-allowed",
                  "has-[:disabled]:opacity-45",
                ),
            ),
            tone?.replaceAll("focus:", "focus-within:"),
          )}
        >
          {field}
          <span className="shrink-0 pr-1.5">{trailing}</span>
        </div>
      )}
    </FieldShell>
  );
});

export interface TextareaProps extends WithoutNativeSize<InputHTMLAttributes<HTMLTextAreaElement>> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Refused, with the sentence elsewhere. See `Input`'s. */
  invalid?: boolean;
  rows?: number;
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    invalid,
    rows = 4,
    mono = false,
    className,
    id,
    required,
    "aria-describedby": describedByProp,
    ...props
  },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  const refused = isRefused(error, invalid);

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={refused ? true : undefined}
        aria-describedby={fieldDescribedBy(
          inputId,
          error !== undefined || hint !== undefined,
          describedByProp,
        )}
        className={cn(
          controlClasses,
          // A textarea is sized by its rows, so it takes the padding of the
          // dense control and none of its height.
          "px-2.5 h-auto py-2 leading-relaxed",
          // This was missing, so a refused textarea printed its message in crit
          // and kept an ordinary border. The message was the only thing saying
          // anything was wrong, and on a long form it is below the fold of the
          // control it belongs to.
          fieldBorderTone(refused, undefined),
          mono && "numeric text-xs",
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps extends WithoutNativeSize<SelectHTMLAttributes<HTMLSelectElement>> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Refused, with the sentence elsewhere. See `Input`'s. */
  invalid?: boolean;
  options: readonly { value: string; label: string }[];
  size?: ControlSize;
}

/**
 * The native select, kept deliberately rather than left over.
 *
 * A styled native element is the right answer for a short, fixed list: it is
 * one tag, it is perfectly accessible without any work from us, and it gets the
 * platform's own picker on a phone. `Combobox` is for the case this is bad at,
 * which is a list long enough that somebody needs to search it.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    invalid,
    options,
    size = "md",
    className,
    id,
    required,
    "aria-describedby": describedByProp,
    ...props
  },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  const refused = isRefused(error, invalid);

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      {/*
       * `appearance-none` and our own chevron, because without it the control
       * keeps the operating system's: a grey bevelled dropdown sitting in a row
       * of controls that are all drawn from the tokens. It was already reserving
       * `pr-8` for a chevron that nothing drew.
       *
       * The arrow is `aria-hidden` and does not take pointer events, so the
       * whole control stays one native select. That is the point of styling one
       * rather than building a listbox: a native select gets the platform's
       * keyboard handling, its type-ahead and its touch picker for free, and
       * every one of those is worse when reimplemented.
       */}
      <span className="relative block">
        <select
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={refused ? true : undefined}
          aria-describedby={fieldDescribedBy(
            inputId,
            error !== undefined || hint !== undefined,
            describedByProp,
          )}
          className={cn(
            controlClasses,
            controlSizes[size],
            "appearance-none pr-8",
            fieldBorderTone(refused, undefined),
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </FieldShell>
  );
});

export interface SwitchProps {
  name: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /**
   * On, and not yours to turn off.
   *
   * The state a restrictive allowlist verb is in: emergency stop cannot be
   * switched off, because a containment action the target can veto is not
   * containment. It draws in `--gc-locked`, which means held by somebody else,
   * rather than in the accent, so it is not mistaken for an ordinary setting
   * that happens to be on. Distinct from `disabled`, which is not available and
   * is dimmed to say so.
   */
  locked?: boolean;
  className?: string;
}

/**
 * Switch. A real checkbox underneath, visually hidden, so it posts in FormData and
 * behaves correctly for keyboard and assistive tech without any ARIA theatre.
 */
export function Switch({
  name,
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  locked = false,
  className,
}: SwitchProps) {
  const id = useId();
  const isDisabled = disabled || locked;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={checked}
          disabled={isDisabled}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          aria-hidden="true"
          className={cn(
            "block h-4 w-7 rounded-full border transition-colors duration-(--duration-quick) cursor-pointer",
            "border-(--gc-border-control) bg-inset",
            locked
              ? "peer-checked:bg-locked peer-checked:border-transparent"
              : "peer-checked:bg-accent peer-checked:border-transparent",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--gc-ring)",
            isDisabled && "cursor-not-allowed",
            // Dimmed for off, and never for locked. `disabled` means the control
            // is not available; `locked` means it is on and held that way by
            // somebody else, which is the token's whole meaning. Fading the most
            // actively enforced setting on the instance says the opposite of
            // what is true, and it read as an ordinary accent switch that
            // somebody had greyed out.
            disabled && !locked && "opacity-60",
          )}
        >
          <span
            className={cn(
              "block size-3 translate-x-0.5 translate-y-[1.5px] rounded-full bg-fg-tertiary",
              "transition-transform duration-(--duration-quick) ease-(--ease-out-quick)",
              checked && "translate-x-[13px] bg-accent-fg",
            )}
          />
        </label>
      </span>

      <div className="min-w-0">
        {label === undefined ? null : (
          <label
            htmlFor={id}
            className={cn("block text-sm text-fg", !isDisabled && "cursor-pointer")}
          >
            {label}
          </label>
        )}
        {description === undefined ? null : (
          <p className="mt-0.5 text-2xs text-fg-tertiary">{description}</p>
        )}
      </div>
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  hint?: ReactNode;
}

/**
 * Checkbox. A tick in a list, which is not the same thing as a `Switch`.
 *
 * A switch says a setting is on or off and takes effect when you flip it. A
 * checkbox says this item is one of the ones you mean, and several of them make
 * up one answer that is saved together. Using the switch for both made a list of
 * databases read as a list of features somebody was turning on.
 *
 * A real input underneath, visually hidden, so it posts in FormData and behaves
 * for keyboard and assistive tech with no ARIA standing in for it. The mark is
 * drawn in CSS rather than shipped as an icon, so it inherits the accent and
 * cannot go missing.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, id, disabled, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="relative inline-flex shrink-0 mt-[3px]">
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <label
          htmlFor={inputId}
          aria-hidden="true"
          className={cn(
            "grid size-3.5 place-items-center rounded-(--radius-sm) border cursor-pointer",
            "border-(--gc-border-control) bg-inset transition-colors duration-(--duration-instant)",
            "peer-checked:border-transparent peer-checked:bg-accent",
            // The tick lives inside this label, which is the input's sibling, so
            // the state has to reach it through a child selector. `peer-checked`
            // on the span itself would compile to a sibling rule and never match.
            "peer-checked:[&>span]:opacity-100",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--gc-ring)",
            disabled === true && "cursor-not-allowed opacity-60",
          )}
        >
          {/* Two borders rotated into a tick. It is one element, it scales with
              the box, and it is the accent foreground so it stays legible on the
              filled state in both themes. */}
          <span className="block size-[9px] rotate-45 -translate-y-[1px] border-b-2 border-r-2 border-accent-fg opacity-0" />
        </label>
      </span>

      <div className="min-w-0">
        {label === undefined ? null : (
          <label
            htmlFor={inputId}
            className={cn("block text-xs text-fg", disabled !== true && "cursor-pointer")}
          >
            {label}
          </label>
        )}
        {hint === undefined ? null : <p className="mt-0.5 text-2xs text-fg-tertiary">{hint}</p>}
      </div>
    </div>
  );
});
