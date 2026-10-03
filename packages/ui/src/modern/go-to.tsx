"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";
import { focusablesIn } from "../focus.js";
import { Input } from "./input.js";

/** One thing Go to can open: a product, a sign-up, a document, a version, a campaign. */
export interface GoToOption {
  /** Stable across result sets, so the active option is recognised as the same one. */
  id: string;
  label: string;
  /** Quiet words after the label: "12 documents", "GOpenCSR, draft". */
  hint?: string;
  href: string;
  /** Set the label in mono: a version id or a key, compared character by character. */
  mono?: boolean;
}

/** A labelled run of options: "Products", "Documents", "Versions". */
export interface GoToGroup {
  label: string;
  options: readonly GoToOption[];
}

export interface GoToProps {
  open: boolean;
  /** Escape, a click on the scrim, or the caller after it navigated. */
  onClose: () => void;
  /** The dialog's name, "Go to". Not drawn: the field is the whole of the dialog. */
  title: string;
  /** The field's name. */
  inputLabel: string;
  placeholder: string;
  /** The field is controlled; the caller fetches results for it. */
  query: string;
  onQueryChange: (query: string) => void;
  groups: readonly GoToGroup[];
  /**
   * "Look up this person", offered when the query is an address or an account
   * id, with `hint` "Recorded in the audit log under your name". Drawn last, as
   * its own option, and read with its hint, because choosing it is recorded.
   */
  person?: { label: string; hint: string; href: string } | null;
  /**
   * Said once the results have settled: "6 matches", or the empty sentence.
   * The caller sets it when its fetch lands, not per keystroke.
   */
  status: string;
  /** Drawn when a query has no option: "No product, document or version matches." */
  emptyLabel: string;
  /** The caller navigates. Enter on the active option, or a click on one. */
  onChoose: (option: { href: string }) => void;
}

interface Choice {
  key: string;
  href: string;
}

/**
 * Go to: open any product, sign-up, document, version or campaign by name, key
 * or id, from every screen. Drawn for the GPlatform Terms staff console, where
 * the usual job is one question about one thing.
 *
 * **A modal with a combobox in it, hand-rolled on the shared pieces.** The
 * console's root `Dialog` and `Combobox` are console's language (a 32px field,
 * a titled panel) and the combobox is a select that commits a value into a
 * form, where this navigates. So the modal contract is the root Dialog's,
 * implemented again in modern's material and on the same `focus.ts`: a portal
 * to the body, the page behind not scrolling and inert through `aria-modal`,
 * Tab trapped, Escape and a click on the scrim closing, and focus returned to
 * whatever had it before. The combobox contract is the root Combobox's: the
 * field owns `role="combobox"` and keeps focus, the active option is pointed at
 * with `aria-activedescendant`, Up and Down move across every group and wrap,
 * Enter opens the active option.
 *
 * **Group labels are presentation.** Each group is a `role="group"` named by
 * its label, and the visible label is hidden from assistive technology so it is
 * not read as an option. **People are never searched as you type**: the caller
 * offers `person` as an explicit choice, last, because that lookup is recorded,
 * and the option is read with its audit sentence.
 *
 * **One status, said when results settle.** The live region is empty from the
 * dialog's first paint, so the caller's "6 matches" is announced when it
 * arrives rather than lost with the region's own insertion.
 */
export function GoTo({
  open,
  onClose,
  title,
  inputLabel,
  placeholder,
  query,
  onQueryChange,
  groups,
  person,
  status,
  emptyLabel,
  onChoose,
}: GoToProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const overlayPressed = useRef(false);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  const choices: Choice[] = [
    ...groups.flatMap((group) =>
      group.options.map((option) => ({ key: `option:${option.id}`, href: option.href })),
    ),
    ...(person == null ? [] : [{ key: "person", href: person.href }]),
  ];

  /*
   * A new result set puts the keyboard back on its first option. Compared by
   * the options' ids rather than by the arrays, which a caller rebuilds on
   * every render, so typing a letter that leaves the same results in place does
   * not throw the active option away.
   */
  const signature = choices.map((choice) => choice.key).join("\n");
  const [seen, setSeen] = useState(signature);
  const [active, setActive] = useState(0);
  if (signature !== seen) {
    setSeen(signature);
    setActive(0);
  }

  useEffect(() => {
    if (!open) return;

    const restore = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus starts in the field: the dialog is a question, and the field asks it.
    field.current?.querySelector("input")?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;
      const focusable = focusablesIn(panel.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined || focusable.length === 1) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (choices.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + choices.length) % choices.length);
      return;
    }
    if (event.key === "Enter") {
      const choice = choices[active];
      if (choice === undefined) return;
      event.preventDefault();
      onChoose({ href: choice.href });
    }
  }

  if (!open || typeof document === "undefined") return null;

  let index = -1;
  function optionProps(href: string) {
    index += 1;
    const at = index;
    const isActive = at === active;
    return {
      id: optionId(at),
      role: "option" as const,
      "aria-selected": isActive,
      // The field keeps focus; the click lands on the option it started on.
      onMouseDown: (event: { preventDefault: () => void }) => {
        event.preventDefault();
      },
      onClick: () => {
        onChoose({ href });
      },
      onPointerMove: () => {
        if (active !== at) setActive(at);
      },
      className: cn(
        "cursor-pointer rounded-m-chip px-2.5 py-2 text-m-ink",
        // The film says which option Enter opens; the ring says it without colour.
        isActive ? "bg-m-selected outline-2 -outline-offset-2 outline-m-ring" : "",
      ),
    };
  }

  const shown = groups.filter((group) => group.options.length > 0);
  const empty = shown.length === 0 && query.trim() !== "";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:pt-[12vh]"
      onMouseDown={(event) => {
        overlayPressed.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        // Both ends on the scrim: a drag out of the field is a selection.
        if (overlayPressed.current && event.target === event.currentTarget) close.current();
        overlayPressed.current = false;
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[560px] overflow-hidden rounded-m-card border border-m-subtle bg-m-overlay shadow-m-overlay"
      >
        <div ref={field} className="p-2.5">
          <Input
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-label={inputLabel}
            aria-controls={listId}
            aria-expanded={choices.length > 0}
            aria-autocomplete="list"
            aria-activedescendant={choices[active] === undefined ? undefined : optionId(active)}
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            onKeyDown={onFieldKeyDown}
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label={title}
          className="max-h-[min(60vh,28rem)] overflow-y-auto px-1.5 text-m-label font-normal"
        >
          {shown.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div aria-hidden="true" className="px-2.5 pt-1.5 pb-1 text-m-micro text-m-ink-3">
                {group.label}
              </div>
              {group.options.map((option) => (
                <div key={option.id} {...optionProps(option.href)}>
                  <span className={option.mono === true ? "font-mono text-m-meta" : undefined}>
                    {option.label}
                  </span>
                  {option.hint === undefined ? null : (
                    <>
                      {" "}
                      <span className="text-m-meta text-m-ink-3">{option.hint}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {person == null ? null : (
            <div {...optionProps(person.href)}>
              <span className="block">{person.label}</span>
              {/*
               * A space between the two lines, so the option's name is two
               * phrases and not "personRecorded": a name is computed from the
               * text, and not every reader adds a break for a block.
               */}{" "}
              <span className="block text-m-meta text-m-ink-3">{person.hint}</span>
            </div>
          )}
        </div>
        {empty ? <p className="px-4 pt-1 text-m-meta text-m-ink-3">{emptyLabel}</p> : null}
        <div className="h-2" />
        <p role="status" className="sr-only">
          {status}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** The same film the modern button recipe uses for hover. */
const HOVER_FILM = "hover:bg-[linear-gradient(var(--gm-hover),var(--gm-hover))]";

export interface GoToButtonProps {
  /** "Go to". The button's words and, in compact, its name. */
  label: string;
  /** The key that opens Go to from anywhere, "/", drawn as a key cap. */
  shortcut?: string;
  onOpen: () => void;
  /** Icon only below `sm`, 44 square: the top bar on a phone. */
  compact?: boolean;
  className?: string;
}

/**
 * What opens Go to: drawn as a field, because it is the place you type to go
 * somewhere, and a button, because pressing it opens a dialog rather than
 * taking text. 36 tall on a 10 radius, the control edge on the inset well with
 * the inset shadow, a search glyph, the label in quiet ink, and the shortcut in
 * a mono key cap.
 *
 * The key cap is hidden from assistive technology and the shortcut is said
 * through `aria-keyshortcuts` instead, so the name stays "Go to" rather than
 * "Go to slash".
 */
export function GoToButton({
  label,
  shortcut,
  onOpen,
  compact = false,
  className,
}: GoToButtonProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts={shortcut}
      // In compact the words are hidden on a phone, so the name is set outright
      // and is the same words: what is seen is what is said.
      aria-label={compact ? label : undefined}
      onClick={onOpen}
      className={cn(
        "flex h-9 items-center gap-2 rounded-m-control border border-m-control bg-m-inset pr-2 pl-2.5 shadow-m-inset",
        "text-m-label font-normal text-m-ink-3",
        HOVER_FILM,
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
        compact ? "max-sm:size-11 max-sm:justify-center max-sm:p-0" : "",
        className,
      )}
    >
      <Search aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={1.75} />
      <span className={cn("flex-1 text-left", compact ? "max-sm:hidden" : "")}>{label}</span>
      {shortcut === undefined ? null : (
        <kbd
          aria-hidden="true"
          className={cn(
            "rounded-[4px] border border-m-hairline px-[5px] font-mono text-m-micro font-normal text-m-ink-3",
            compact ? "max-sm:hidden" : "",
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/** Input types that do not take text, so "/" pressed in one is not typing. */
const NOT_TEXT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function takesText(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  // `isContentEditable` is the platform's answer, and the attribute walk is the
  // fallback for an environment that does not compute it.
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return (
    target.closest(
      '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
    ) !== null
  );
}

/**
 * Opens Go to on "/" pressed anywhere outside a field.
 *
 * Not in a text field, a textarea, a select or anything contenteditable, where
 * "/" is a character somebody is typing. Not with Control, Meta or Alt held,
 * which is a shortcut of the browser's or the system's. Shift is allowed,
 * because "/" is Shift+7 on a German keyboard. Not while another modal is open,
 * whose own keyboard contract a second dialog on top would break. And not when
 * something earlier already handled the key.
 */
export function useSlashToOpen(onOpen: () => void): void {
  const latest = useRef(onOpen);

  useEffect(() => {
    latest.current = onOpen;
  });

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (takesText(event.target)) return;
      if (document.querySelector('[aria-modal="true"]') !== null) return;
      event.preventDefault();
      latest.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
