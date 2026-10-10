"use client";

import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { FOCUSABLE } from "../focus.js";
import { buttonClasses } from "./button-classes.js";
import { Input } from "./input.js";

/** How long typing has to pause before the search is applied. The sheet's number. */
const SEARCH_PAUSE_MS = 300;

export interface ListFiltersProps {
  /**
   * The search field. `value` is what the address holds; `onChange` is called
   * on Enter and after 300 ms without typing, never per keystroke, and never
   * twice with the same text.
   */
  search?: {
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
  };
  /** The facets: `FilterButton`s, and a `SegmentedControl` where two to four values exclude each other. */
  children?: ReactNode;
  /** Clear, shown only when something is set: pass null or leave it out when nothing is. */
  clear?: { label: string; onClear: () => void } | null;
  /**
   * The count line under the row ("7 of 96 documents"), and the ONLY polite
   * live region in it. Update it once the results have loaded, not when the
   * filter was pressed, so what is said is what the list shows.
   */
  count: ReactNode;
  /** Names the `role="search"` row: "Filter documents". */
  label: string;
  className?: string;
}

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function SearchField({ label, placeholder, value, onChange }: SearchFieldProps) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  /** The last text handed to `onChange`, or the address's own value. */
  const sent = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The address moved. If it is only echoing what this field sent, the field
   * already shows it and may have more typed since, which an overwrite would
   * throw away. If it moved for another reason (Clear, Back, a link), the
   * field follows it.
   */
  if (value !== synced) {
    setSynced(value);
    if (value !== sent.current) setText(value);
  }

  useEffect(() => {
    /*
     * A value this field did not send cancels the typing still waiting to be
     * applied: Clear pressed with "abc" pending must not be undone 300 ms later
     * by the timer putting "abc" back.
     */
    if (value !== sent.current && timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    sent.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function send(next: string) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (next === sent.current) return;
    sent.current = next;
    onChange(next);
  }

  return (
    <label className="relative block min-w-0 flex-[1_1_220px] sm:max-w-[300px] aurora:sm:max-w-[360px]">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-m-ink-3"
        strokeWidth={1.75}
      />
      <Input
        type="search"
        height={36}
        enterKeyHint="search"
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            send(next);
          }, SEARCH_PAUSE_MS);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          send(text);
        }}
        // Aurora: the search is a pill, 34 high, edged in ink at 14 per cent.
        className="pl-[34px] max-sm:h-11 aurora:h-[34px] aurora:rounded-full aurora:border-a-edge-pill aurora:text-[13.5px] aurora:max-sm:h-11"
      />
    </label>
  );
}

/**
 * The one way a list that grows is narrowed: a search field, a facet per
 * filter, Clear, and the count. Drawn for the GPlatform Terms staff console,
 * where documents, products, rollouts, campaigns, a version's people, imports,
 * the audit log and objections all filter the same way.
 *
 * **A `role="search"` row, and every value lives in the address.** The row
 * holds no filter state: the facets are controlled by the page, which writes
 * each choice into the URL (with replace), so a filtered list is a link and
 * Back leaves the list. The only things held here are the ones that must not
 * be in the address yet: the text being typed before it is applied.
 *
 * **The search applies on Enter and after 300 ms of no typing**, never per
 * keystroke: each application loads a page, and a list that reloads on every
 * letter shows four wrong lists before the right one.
 *
 * **The count line is the only live region.** It says "7 of 96 documents" once
 * the results have loaded, which covers every facet and the search at once, so
 * nothing else in the row announces anything.
 *
 * **Clear moves focus before it disappears.** It is drawn only while something
 * is set, so pressing it removes the button that had focus; focus goes to the
 * search field, or the first facet, rather than falling to the top of the page.
 */
export function ListFilters({
  search,
  children,
  clear,
  count,
  label,
  className,
}: ListFiltersProps) {
  const row = useRef<HTMLDivElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);

  function onClear() {
    const into =
      row.current?.querySelector<HTMLInputElement>('input[type="search"]') ??
      [...(row.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find(
        (element) => element !== clearButton.current,
      );
    into?.focus();
    clear?.onClear();
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={row}
        role="search"
        aria-label={label}
        className="flex flex-wrap items-center gap-2.5"
      >
        {search === undefined ? null : (
          <SearchField
            label={search.label}
            placeholder={search.placeholder}
            value={search.value}
            onChange={search.onChange}
          />
        )}
        {children}
        {clear === undefined || clear === null ? null : (
          <button
            ref={clearButton}
            type="button"
            onClick={onClear}
            // Joined, not merged, for the reason `buttonClasses` gives.
            className={clsx(buttonClasses({ variant: "quiet", size: 36 }), "max-sm:h-11")}
          >
            {clear.label}
          </button>
        )}
      </div>
      <p role="status" className="text-m-meta text-m-ink-3">
        {count}
      </p>
    </div>
  );
}
