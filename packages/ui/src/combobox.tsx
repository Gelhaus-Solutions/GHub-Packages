"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn.js";
import { FieldShell } from "./input.js";
import { AURORA_FIELD, AURORA_MENU } from "./modern/aurora.js";

/**
 * A searchable select, hand-rolled, with a hidden named input behind it.
 *
 * Both consoles push two hundred rows through a native `select` today. That is
 * survivable, which is why this is wave two rather than wave one, but it stops
 * being survivable on the generated settings form, where the option list is
 * whatever a module declares.
 *
 * **The hidden input is the whole integration story.** Everything visible here
 * is a `div` and a `ul`, which `FormData` cannot see, so the value is mirrored
 * into a real `<input type="hidden" name>`. A server action reads it exactly as
 * it reads a native select, and nothing about the form's submission path
 * changes. That constraint is why this is not built on a text input with a
 * datalist: a datalist submits whatever was typed, including something that is
 * not an option.
 *
 * **No Radix and no headless library**, per the package's own rule:
 * accessibility here is implemented rather than inherited. The pattern is the
 * ARIA combobox with a listbox popup. The input owns `role="combobox"`, the
 * list owns `role="listbox"`, and the active option is pointed at with
 * `aria-activedescendant` rather than by moving focus, so typing never stops
 * working while arrowing through the list.
 *
 * Keyboard, which is the part an image cannot show:
 *
 *   - Down and Up move the active option, opening the list if it is closed.
 *   - Home and End jump to the first and last match.
 *   - Enter commits the active option. Escape closes and restores the committed
 *     label, so a half-typed query never survives as a value.
 *   - Tab leaves and commits nothing, which is the honest reading of moving on.
 *   - Typing filters, and the active option resets to the first match, because
 *     an active option that has been filtered out is a keystroke that appears
 *     to do nothing.
 */
export interface ComboboxOption {
  value: string;
  label: string;
  /** A quieter second line: what this option is, where the label is an id. */
  hint?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  /** The name the server action reads. This is what the hidden input carries. */
  name: string;
  options: readonly ComboboxOption[];
  /** Controlled where supplied. Leave it out and the component owns the value. */
  value?: string;
  onChange?: (value: string) => void;
  /** The starting value when this is uncontrolled. */
  defaultValue?: string;
  placeholder?: string;
  /** What the list says when nothing matches. Name the thing being searched. */
  emptyLabel?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Renders an option's row. The default is the label over the hint. */
  renderOption?: (option: ComboboxOption, active: boolean) => ReactNode;
  className?: string;
}

export function Combobox({
  name,
  options,
  value,
  onChange,
  defaultValue = "",
  placeholder = "Search",
  emptyLabel = "Nothing matches",
  label,
  hint,
  error,
  required = false,
  disabled = false,
  renderOption,
  className,
}: ComboboxProps) {
  const generated = useId();
  const inputId = `${generated}-input`;
  const listId = `${generated}-list`;

  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const committed = value ?? uncontrolled;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const committedOption = options.find((option) => option.value === committed);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.hint ?? "").toLowerCase().includes(needle),
    );
  }, [options, query]);

  // An active index left pointing past the end of a filtered list is a Down
  // press that appears to do nothing. It is clamped on every change rather than
  // reset, so narrowing a search keeps the highlight where it can.
  useEffect(() => {
    setActive((current) => (current >= matches.length ? 0 : current));
  }, [matches.length]);

  function commit(option: ComboboxOption) {
    if (option.disabled === true) return;
    if (value === undefined) setUncontrolled(option.value);
    onChange?.(option.value);
    setQuery("");
    setOpen(false);
    input.current?.focus();
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  // Pointer-down rather than click, and on the document rather than a backdrop:
  // a transparent backdrop would swallow the first click on whatever is behind
  // it, so dismissing the list would cost a click somewhere else.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current !== null && !root.current.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Keep the active option in view when it moves by keyboard. `nearest` rather
  // than `center` so a list that fits does not jump on every arrow press.
  useEffect(() => {
    if (!open || list.current === null) return;
    const element = list.current.children[active];
    if (element instanceof HTMLElement) element.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActive(Math.max(0, matches.length - 1));
      return;
    }
    if (event.key === "Enter") {
      if (!open) return;
      // Only swallow Enter when it is doing something. A combobox inside a form
      // that ate every Enter would stop the form being submitted from the
      // keyboard, which is how most people submit a one-field form.
      const option = matches[active];
      if (option === undefined) return;
      event.preventDefault();
      commit(option);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
    }
  }

  const shown = open ? query : (committedOption?.label ?? "");

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      {/*
       * The bridge to FormData. Everything visible above it is a div and a ul,
       * which a form cannot see; this is what a server action actually reads.
       */}
      <input type="hidden" name={name} value={committed} />

      <div ref={root} className="relative">
        <input
          ref={input}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          value={shown}
          placeholder={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required ? true : undefined}
          aria-invalid={error === undefined ? undefined : true}
          aria-activedescendant={
            open && matches[active] !== undefined ? `${generated}-opt-${String(active)}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full bg-inset text-fg placeholder:text-fg-tertiary",
            "border border-(--gc-border-control) rounded-(--radius-md)",
            "h-8 px-2.5 pr-8 text-sm",
            "transition-colors duration-(--duration-instant)",
            "hover:border-(--gc-border-strong)",
            "focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--gc-accent-wash)]",
            "disabled:opacity-45 disabled:cursor-not-allowed",
            AURORA_FIELD,
            "aurora:h-10 aurora:px-3 aurora:pr-8 aurora:text-[14px] aurora:placeholder:text-m-ink-3 aurora:hover:border-m-strong aurora:max-sm:h-11",
            error !== undefined &&
              "border-crit focus:border-crit focus:shadow-[0_0_0_3px_var(--gc-crit-wash)]",
          )}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-tertiary aurora:right-3 aurora:text-m-ink-3"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>

        {!open ? null : (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className={cn(
              "absolute z-50 mt-1 max-h-64 w-full overflow-y-auto py-1",
              "rounded-(--radius-md) border border-(--gc-border-subtle) bg-overlay shadow-md",
              AURORA_MENU,
              "aurora:p-1.5",
            )}
          >
            {matches.length === 0 ? (
              // Not a disabled option and not an empty list. A list with nothing
              // in it reads as a component that failed to load.
              <li className="px-2.5 py-2 text-2xs text-fg-tertiary aurora:text-[12.5px] aurora:text-m-ink-3">
                {emptyLabel}
              </li>
            ) : (
              matches.map((option, index) => {
                const isActive = index === active;
                const selected = option.value === committed;

                return (
                  <li
                    key={option.value}
                    id={`${generated}-opt-${String(index)}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled === true ? true : undefined}
                    // Pointer-down rather than click: the input's blur would
                    // otherwise close the list before the click landed.
                    onPointerDown={(event) => {
                      event.preventDefault();
                      commit(option);
                    }}
                    onPointerEnter={() => {
                      setActive(index);
                    }}
                    className={cn(
                      "cursor-pointer px-2.5 py-1.5 text-sm",
                      "aurora:flex aurora:min-h-9 aurora:flex-col aurora:justify-center aurora:rounded-a-item aurora:px-3 aurora:text-[13.5px]",
                      option.disabled === true &&
                        "cursor-not-allowed text-fg-disabled aurora:text-m-ink-off",
                      isActive && option.disabled !== true && "bg-hover aurora:bg-m-hover",
                      selected && "bg-selected aurora:bg-m-selected",
                    )}
                  >
                    {renderOption === undefined ? (
                      <>
                        <span className="block truncate text-fg-secondary aurora:text-m-ink">
                          {option.label}
                        </span>
                        {option.hint === undefined ? null : (
                          <span className="block truncate text-2xs text-fg-tertiary aurora:text-[12px] aurora:text-m-ink-3">
                            {option.hint}
                          </span>
                        )}
                      </>
                    ) : (
                      renderOption(option, isActive)
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
