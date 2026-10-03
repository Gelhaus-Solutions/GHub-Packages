"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../cn.js";
import { Input } from "./input.js";

/** One value of a facet. `hint` is a quiet figure beside it, usually a count. */
export interface FilterOption {
  value: string;
  label: string;
  hint?: string;
}

export interface FilterButtonProps {
  /** The facet's name: "Product". Shown as "Product: Any", and names the listbox. */
  label: string;
  /** The value shown when nothing is set: "Any". */
  anyLabel: string;
  /**
   * The first option's words, where the list wants more than the button:
   * the sheet draws "Any product" in the list and "Product: Any" on the
   * button. Left out, the option says `anyLabel`.
   */
  anyOptionLabel?: string;
  /** The value from the address, or null for any. */
  value: string | null;
  options: readonly FilterOption[];
  /** Called once per choice that changes the value; null is any. */
  onChange: (value: string | null) => void;
  /** The filter field's name when there are more than seven options: "Filter products". */
  filterLabel?: string;
  /**
   * The word drawn at the right of the chosen option ("chosen"). Left out, a
   * check mark is drawn instead. Either way it is hidden from assistive
   * technology, because `aria-selected` already says it.
   */
  chosenLabel?: string;
  /**
   * A value that can be typed as well as picked: a day for a From or To facet,
   * where no list holds every day. Given, the filter field is always drawn, and
   * what `parse` reads from it is offered first after Any (`parse` answers null
   * for text that is not one yet). Its `label` is what the option says.
   */
  typed?: { parse: (text: string) => FilterOption | null; placeholder?: string };
  className?: string;
}

/** More than this many values puts a filter field first. The sheet's number. */
const FILTER_ABOVE = 7;

/** The same film the modern button recipe uses for hover. */
const HOVER_FILM = "hover:bg-[linear-gradient(var(--gm-hover),var(--gm-hover))]";

interface Row {
  value: string | null;
  label: string;
  hint?: string;
}

function matching(options: readonly FilterOption[], query: string): readonly FilterOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
}

/**
 * One facet of a list filter: a button saying "Product: Any" that opens a
 * listbox of the facet's values below it. Drawn for the GPlatform Terms staff
 * console, where every list that grows narrows the same way.
 *
 * **It holds no value.** The value lives in the page's address, so a filtered
 * list is a link and Back leaves the list rather than undoing a filter. This
 * component holds only what the address should not: whether the listbox is
 * open, which option the keyboard is on, and what was typed into the filter
 * field.
 *
 * **A set facet looks set in more than colour.** It takes the selected film and
 * an accent edge, and its value is drawn in ink instead of quiet ink, but the
 * words on the button ("Product: GOpenCNR" against "Product: Any") are what
 * actually say it.
 *
 * Keyboard, the part a drawing cannot show. Enter, Space or Down opens it;
 * with more than seven values focus goes first to a filter field, otherwise to
 * the listbox. Up and Down move, Home and End jump, Enter chooses and closes,
 * Escape closes without choosing, and both return focus to the button. Tab
 * closes and moves on, choosing nothing. A click outside closes. The active
 * option is pointed at with `aria-activedescendant`, so typing in the filter
 * field never stops working while the arrows move, and it carries the focus
 * ring, because the film alone would mark it by colour.
 *
 * **Nothing here is announced.** The count line under the filter row is the
 * one live region (see `ListFilters`): a facet that announced its own change
 * would say a second, earlier sentence about the same press.
 */
export function FilterButton({
  label,
  anyLabel,
  anyOptionLabel,
  value,
  options,
  onChange,
  filterLabel,
  chosenLabel,
  typed,
  className,
}: FilterButtonProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [alignEnd, setAlignEnd] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const filterField = useRef<HTMLDivElement>(null);

  const filtered = options.length > FILTER_ABOVE || typed !== undefined;
  const read = query.trim() === "" ? null : (typed?.parse(query) ?? null);
  const listed = matching(options, query).filter((option) => option.value !== read?.value);
  const rows: readonly Row[] = [
    { value: null, label: anyOptionLabel ?? anyLabel },
    ...(read === null ? [] : [read]),
    ...listed,
  ];
  // A typed value is not among the options; the button says it as `parse` words it.
  const chosen =
    value === null
      ? undefined
      : (options.find((option) => option.value === value) ?? typed?.parse(value) ?? undefined);
  const set = value !== null;

  function show() {
    setQuery("");
    setAlignEnd(false);
    const at = value === null ? 0 : options.findIndex((option) => option.value === value) + 1;
    setActive(Math.max(0, at));
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (returnFocus) button.current?.focus();
  }

  function choose(row: Row) {
    close(true);
    // Choosing the value already set closes the list and writes nothing: the
    // address already says it, and a navigation to the same address is a
    // page that flickers for no reason.
    if (row.value !== value) onChange(row.value);
  }

  /*
   * Focus goes in after the render that mounted the popup. The filter field
   * comes first when there is one, because a list of thirty products is
   * narrowed by typing, not by thirty presses of Down.
   */
  useEffect(() => {
    if (!open) return;
    if (filtered) filterField.current?.querySelector("input")?.focus();
    else list.current?.focus();
  }, [open, filtered]);

  /*
   * A popup that would run past the right edge of the screen opens toward the
   * left instead, so a facet at the end of a narrow row cannot make the page
   * scroll sideways. Measured before paint, so it never flashes on the wrong
   * side first.
   */
  useLayoutEffect(() => {
    if (!open || popup.current === null) return;
    const rect = popup.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) setAlignEnd(true);
  }, [open]);

  // Pointer-down on the document rather than a backdrop, for the reason the
  // root Combobox gives: a transparent backdrop eats the first click behind it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current !== null && !root.current.contains(event.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Keep the active option in view; `nearest`, so a list that fits never jumps.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      show();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLElement>, inField: boolean) {
    const last = rows.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => Math.min(current + 1, last));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(last);
        return;
      case "Enter": {
        event.preventDefault();
        const row = rows[active];
        if (row !== undefined) choose(row);
        return;
      }
      case " ": {
        // In the filter field a space is a space; on the list it chooses.
        if (inField) return;
        event.preventDefault();
        const row = rows[active];
        if (row !== undefined) choose(row);
        return;
      }
      case "Escape":
        // Stopped here, so a facet inside a dialog closes before the dialog does.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
      default:
    }
  }

  function onPopupBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next !== null && root.current?.contains(next) === true) return;
    if (next !== null) close(false);
  }

  const activeId = rows[active] === undefined ? undefined : optionId(active);

  return (
    <div ref={root} className={cn("relative inline-block", className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (open) close(true);
          else show();
        }}
        onKeyDown={onButtonKeyDown}
        className={cn(
          // 36 at a desk, 44 on a phone, where it is the target a thumb hits.
          "inline-flex h-9 items-center gap-1.5 rounded-m-control border pr-2.5 pl-3 whitespace-nowrap shadow-m-quiet max-sm:min-h-11",
          "text-m-label text-m-ink",
          HOVER_FILM,
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
          set ? "border-m-accent/55 bg-m-selected" : "border-m-control bg-m-plate",
        )}
      >
        <span>{`${label}:`}</span>
        <span className={cn("font-normal", set ? "text-m-ink" : "text-m-ink-2")}>
          {chosen?.label ?? (set ? value : anyLabel)}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-m-ink-3"
          strokeWidth={1.75}
        />
      </button>

      {!open ? null : (
        <div
          ref={popup}
          onBlur={onPopupBlur}
          className={cn(
            "absolute top-full z-50 mt-1 w-[260px] max-w-[calc(100vw-2rem)] min-w-full",
            "rounded-m-panel border border-m-subtle bg-m-overlay p-1.5 shadow-m-overlay",
            alignEnd ? "right-0" : "left-0",
          )}
        >
          {filtered ? (
            <div ref={filterField} className="px-1 pt-1 pb-1.5">
              <Input
                height={36}
                type="text"
                role="combobox"
                autoComplete="off"
                aria-label={filterLabel ?? label}
                aria-controls={listId}
                aria-expanded={true}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                {...(typed?.placeholder === undefined ? {} : { placeholder: typed.placeholder })}
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  // The first match rather than Any, which is always there and
                  // is never what somebody typing a name is looking for.
                  const reads = next.trim() !== "" && (typed?.parse(next) ?? null) !== null;
                  setActive(
                    next.trim() !== "" && (reads || matching(options, next).length > 0) ? 1 : 0,
                  );
                }}
                onKeyDown={(event) => {
                  onListKeyDown(event, true);
                }}
              />
            </div>
          ) : null}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={filtered ? undefined : -1}
            aria-activedescendant={filtered ? undefined : activeId}
            onKeyDown={
              filtered
                ? undefined
                : (event) => {
                    onListKeyDown(event, false);
                  }
            }
            className="max-h-72 overflow-y-auto focus:outline-none"
          >
            {rows.map((row, index) => {
              const selected = row.value === value;
              return (
                <li
                  key={row.value === null ? "" : `=${row.value}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  // Kept from taking focus, so the field or the list keeps it
                  // and the click lands on the option it started on.
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    choose(row);
                  }}
                  onPointerMove={() => {
                    if (active !== index) setActive(index);
                  }}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-m-chip px-2.5 py-2",
                    "text-m-label font-normal text-m-ink",
                    selected ? "bg-m-selected" : "",
                    index === active ? "outline-2 -outline-offset-2 outline-m-ring" : "",
                  )}
                >
                  <span className="min-w-0">
                    {row.label}
                    {row.hint === undefined ? null : (
                      <span className="ml-1.5 text-m-meta text-m-ink-3">{row.hint}</span>
                    )}
                  </span>
                  {!selected ? null : chosenLabel === undefined ? (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 text-m-ink-2"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <span aria-hidden="true" className="shrink-0 text-m-meta text-m-ink-2">
                      {chosenLabel}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
