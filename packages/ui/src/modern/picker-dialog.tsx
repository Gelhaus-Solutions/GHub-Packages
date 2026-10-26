"use client";

import { Search } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { choiceTabStop, nextChoice } from "../choice-roving.js";
import { cn } from "../cn.js";
import { AURORA_POPUP, AURORA_SCRIM } from "./aurora.js";
import { buttonClasses } from "./button-classes.js";
import { Button } from "./button.js";
import { FilterButton, type FilterOption } from "./filter-button.js";
import { Input } from "./input.js";
import { useModal } from "./modal.js";
import { Pagination } from "./pagination.js";

/** How long typing has to pause before the search is applied. The sheet's number. */
const SEARCH_PAUSE_MS = 300;
/** Nothing is said for the first second of a load; then the waiting sentence. */
const STILL_WAITING_MS = 1000;

/** One facet of the list: a `FilterButton` in the popup's filter row. */
export interface PickerFacet {
  /** The key the query carries it under: "role". */
  key: string;
  label: string;
  anyLabel: string;
  options: readonly FilterOption[];
}

/** One of the views the list is shown in: "Recent", "Starred", "All". */
export interface PickerView {
  key: string;
  label: string;
}

/** What the popup asks the caller's `load` for. Page 1 is the first. */
export interface PickerQuery {
  search: string;
  facets: Readonly<Record<string, string | null>>;
  page: number;
  /** The view's key. Present only where the popup was given views. */
  view?: string;
}

/** One page of matches, as a paged list endpoint answers. */
export interface PickerPage<T> {
  items: readonly T[];
  total: number;
  perPage: number;
}

/** A column of the rows: its header, its grid track and what a cell shows. */
export interface PickerColumn<T> {
  key: string;
  label: string;
  /** A CSS grid track: "minmax(0, 2fr)", "112px". */
  width: string;
  cell: (item: T) => ReactNode;
}

/** Every word the popup draws itself. No defaults: a component with no locale has none to give. */
export interface PickerLabels {
  /** Names the search field: "Search parties". */
  search: string;
  searchPlaceholder: string;
  /** Names the filter row: "Filter parties". */
  filters: string;
  /** Names the listbox: "Parties". */
  list: string;
  /** Names the row of views: "Which projects". Needed where there are views. */
  views?: string;
  clear: string;
  close: string;
  cancel: string;
  /** The count line once a page has loaded: "212 parties match". */
  count: (total: number) => ReactNode;
  /** The pager's sentence: "Page 1 of 27". */
  page: (page: number, pages: number) => ReactNode;
  back: string;
  next: string;
  /** Nothing matches the search and the facets. */
  empty: string;
  /** Said after a second without an answer: "Still waiting on the server after 1 second." */
  waiting: string;
  failed: string;
  /** The primary with one chosen: "Choose Elbe Kanzlei". */
  choose: (name: string) => string;
  /** The primary before anything is chosen: "Choose a party". */
  chooseNothing: string;
  /** Choosing several: the primary, "Add 3 parties". */
  add?: (count: number) => string;
  /** Choosing several: the tray's count, "3 chosen". */
  chosen?: (count: number) => string;
  /** Choosing several: the toggle that lists only the chosen ones. */
  chosenOnly?: string;
  /** Choosing several: a chip's remove button, "Take Calder Freight off". */
  remove?: (name: string) => string;
}

export interface PickerDialogProps<T> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Loads one page. Aborted when the query changes before it answers. */
  load: (query: PickerQuery, signal: AbortSignal) => Promise<PickerPage<T>>;
  itemKey: (item: T) => string;
  /** The words for an item in the primary and the tray. */
  itemName: (item: T) => string;
  columns: readonly PickerColumn<T>[];
  facets?: readonly PickerFacet[];
  /**
   * Views of the list, one shown at a time, as a row of tabs under the search:
   * "Recent", "Starred", "All". The chosen one's key reaches `load` as `view`.
   */
  views?: readonly PickerView[];
  /** The view it opens on. The first one where this is not given. */
  initialView?: string;
  /** One control at the end of the search row, such as a button that starts a new one. */
  action?: ReactNode;
  /** A line at the start of the foot, where several would hold the chosen: what the list covers. */
  note?: ReactNode;
  /**
   * One quiet control in the foot, before Cancel: a way out of the list to
   * somewhere else, such as making a new one in another product (GPlatform
   * Integrate's New project, canvas O1).
   */
  footAction?: ReactNode;
  /** The search it opens with: what was typed into the field that opened it. */
  initialSearch?: string;
  initialFacets?: Readonly<Record<string, string | null>>;
  /** Choose several, with a tray of the chosen in the foot. */
  several?: boolean;
  /** What is chosen when it opens. */
  chosen?: readonly T[];
  /** The most that can be chosen when choosing several. */
  max?: number;
  /** Why an item cannot be chosen ("Already the party of this agreement"), or null when it can. */
  unavailable?: (item: T) => string | null;
  /** Called with the chosen items. The caller closes the popup. */
  onConfirm: (items: T[]) => void;
  labels: PickerLabels;
  /** Below this width the columns scroll sideways rather than squeeze. */
  minWidth?: number;
}

/**
 * The popup behind a picker whose list piles up: parties, represented
 * companies, records, anything there may be five hundred of. Drawn for
 * GPlatform Legal (D157: a field that opens it, facets in a row, the chosen in
 * a bar at the foot, rows in columns), generic for every product.
 *
 * **The server searches, filters and pages.** The caller's `load` gets the
 * search, each facet's value and the page, and answers one page with the total,
 * which is what a paged list endpoint already returns. Nothing here holds the
 * whole list, so a picker over five thousand rows costs what one over fifty
 * does. The search applies on Enter and after 300 ms without typing; a facet
 * or a new search goes back to page 1; a load the query has moved past is
 * aborted, so a slow answer never paints over a newer one.
 *
 * **Views** are a second axis beside the facets, for lists somebody reads
 * from a different end ("Recent", "Starred", "All"): a row of tabs under the
 * search, one at a time, a radio group to a keyboard (one stop, the arrows
 * move), and a change goes back to page 1 like a facet does.
 *
 * **One or several.** One: a click chooses, the primary says whom ("Choose
 * Elbe Kanzlei"), and Enter on the highlighted row chooses it and confirms.
 * Several: a click or Enter ticks and unticks, the foot's tray holds every
 * chosen item as a chip, from any page, and "Chosen only" lists just those.
 *
 * **The modal contract is the root Dialog's**, in modern's material, as Go
 * to's is: a portal to the body, the page behind still and inert through
 * `aria-modal`, Tab trapped, Escape and a click on the scrim closing, focus
 * back where it was. **The search field owns the list**: it is the combobox,
 * keeps focus, and points at the highlighted row with
 * `aria-activedescendant`, so typing never stops working while arrowing.
 *
 * Mounted only while open, so every opening starts from its props.
 */
export function PickerDialog<T>(props: PickerDialogProps<T>) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<PickerPanel {...props} />, document.body);
}

type Load = "loading" | "waiting" | "ready" | "failed";

function PickerPanel<T>({
  onClose,
  title,
  description,
  load,
  itemKey,
  itemName,
  columns,
  facets = [],
  views,
  initialView,
  action,
  note,
  footAction,
  initialSearch = "",
  initialFacets = {},
  several = false,
  chosen: chosenAtOpen = [],
  max,
  unavailable,
  onConfirm,
  labels,
  minWidth = 760,
}: PickerDialogProps<T>) {
  const id = useId();
  const titleId = `${id}-title`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const [text, setText] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [values, setValues] = useState<Readonly<Record<string, string | null>>>(initialFacets);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<string | undefined>(initialView ?? views?.[0]?.key);
  const [chosenOnly, setChosenOnly] = useState(false);
  const [chosen, setChosen] = useState<ReadonlyMap<string, T>>(
    () => new Map(chosenAtOpen.map((item) => [itemKey(item), item])),
  );
  const [result, setResult] = useState<PickerPage<T> | null>(null);
  const [state, setState] = useState<Load>("loading");
  const [active, setActive] = useState(0);

  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLLabelElement>(null);
  const viewRow = useRef<HTMLDivElement>(null);
  const loader = useRef(load);
  const closed = useRef(unavailable);
  useEffect(() => {
    loader.current = load;
    closed.current = unavailable;
  });

  // The modal contract (`useModal`), focus starting in the search: the popup is a
  // question, and the field asks it.
  const scrim = useModal({
    panel,
    onClose,
    focus: () => field.current?.querySelector("input") ?? null,
  });

  // Typing applies after a pause, and goes back to the first page.
  useEffect(() => {
    if (text === search) return;
    const timer = setTimeout(() => {
      setSearch(text);
      setPage(1);
    }, SEARCH_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text, search]);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    const slow = setTimeout(() => {
      setState((now) => (now === "loading" ? "waiting" : now));
    }, STILL_WAITING_MS);
    // `view` only where there are views, so a popup without them asks what it always asked.
    const query: PickerQuery =
      view === undefined
        ? { search, facets: values, page }
        : { search, facets: values, page, view };
    void loader
      .current(query, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setResult(next);
        setState("ready");
        // The first row that can be chosen, so Enter after a search opens what was found
        // rather than landing on a row shown only for where the others sit.
        const open = next.items.findIndex((item) => closed.current?.(item) == null);
        setActive(open === -1 ? 0 : open);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState("failed");
      });
    return () => {
      controller.abort();
      clearTimeout(slow);
    };
  }, [search, values, page, view]);

  const rows: readonly T[] = chosenOnly ? [...chosen.values()] : (result?.items ?? []);
  const pages = result === null ? 1 : Math.max(1, Math.ceil(result.total / result.perPage));
  const full = several && max !== undefined && chosen.size >= max;
  const anySet = search !== "" || Object.values(values).some((value) => value !== null);

  // Held inside the rows, so a shorter page or an untick in "Chosen only" never points past the end.
  const at = Math.min(active, Math.max(0, rows.length - 1));
  const activeId = rows[at] === undefined ? null : optionId(at);
  useEffect(() => {
    if (activeId !== null)
      document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  function blocked(item: T): boolean {
    if (unavailable?.(item) != null) return true;
    return full && !chosen.has(itemKey(item));
  }

  function toggle(item: T) {
    if (blocked(item)) return;
    const key = itemKey(item);
    if (!several) {
      setChosen(new Map([[key, item]]));
      return;
    }
    setChosen((now) => {
      const next = new Map(now);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }

  function remove(key: string) {
    setChosen((now) => {
      const next = new Map(now);
      next.delete(key);
      return next;
    });
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at + step + rows.length) % rows.length);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Typed but not applied yet: Enter applies it, as on every list.
    if (text !== search) {
      setSearch(text);
      setPage(1);
      return;
    }
    const item = rows[at];
    if (item === undefined || blocked(item)) return;
    if (several) toggle(item);
    else onConfirm([item]);
  }

  const viewList = views ?? [];
  const viewAt = viewList.findIndex((one) => one.key === view);
  const viewEnabled = viewList.map(() => true);
  const viewStop = choiceTabStop(viewAt, viewEnabled);

  function pickView(key: string) {
    setView(key);
    setPage(1);
  }

  function onViewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const radios = [
      ...(viewRow.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
    ];
    const focused = radios.findIndex((radio) => radio === document.activeElement);
    const moved = nextChoice(event.key, focused >= 0 ? focused : viewAt, viewEnabled);
    if (moved === null) return;
    event.preventDefault();
    const next = viewList[moved];
    if (next === undefined) return;
    pickView(next.key);
    radios[moved]?.focus();
  }

  function clearAll() {
    setText("");
    setSearch("");
    setValues(Object.fromEntries(facets.map((facet) => [facet.key, null])));
    setPage(1);
    field.current?.querySelector("input")?.focus();
  }

  const tracks = `18px ${columns.map((column) => column.width).join(" ")}`;
  const grid: CSSProperties = { gridTemplateColumns: tracks };
  const picked = [...chosen.values()];
  const one = picked[0];

  const status =
    state === "failed"
      ? labels.failed
      : state === "waiting"
        ? labels.waiting
        : state === "loading" || result === null
          ? null
          : chosenOnly
            ? (labels.chosen?.(chosen.size) ?? null)
            : labels.count(result.total);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:pt-[8vh]",
        AURORA_SCRIM,
      )}
      {...scrim}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "flex w-full max-w-[920px] flex-col overflow-hidden rounded-m-card border border-m-subtle bg-m-overlay shadow-m-overlay",
          AURORA_POPUP,
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-[18px] pb-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-m-ink"
            >
              {title}
            </h2>
            {description === undefined ? null : (
              <p className="mt-0.5 text-m-meta text-m-ink-3">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[20px] leading-none text-m-ink-2 hover:bg-m-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div
          role="group"
          aria-label={labels.filters}
          className="flex flex-wrap items-center gap-2 px-5 pb-2.5"
        >
          <label ref={field} className="relative block min-w-0 flex-[1_1_240px] sm:max-w-[360px]">
            <span className="sr-only">{labels.search}</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-m-ink-3"
              strokeWidth={1.75}
            />
            <Input
              type="text"
              role="combobox"
              autoComplete="off"
              enterKeyHint="search"
              height={36}
              placeholder={labels.searchPlaceholder}
              value={text}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              {...(activeId === null ? {} : { "aria-activedescendant": activeId })}
              onChange={(event) => {
                setText(event.target.value);
              }}
              onKeyDown={onFieldKeyDown}
              className="pl-[34px] max-sm:h-11 aurora:h-[34px] aurora:rounded-full aurora:border-a-edge-pill aurora:text-[13.5px] aurora:max-sm:h-11"
            />
          </label>
          {facets.map((facet) => (
            <FilterButton
              key={facet.key}
              label={facet.label}
              anyLabel={facet.anyLabel}
              options={facet.options}
              value={values[facet.key] ?? null}
              onChange={(value) => {
                setValues((now) => ({ ...now, [facet.key]: value }));
                setPage(1);
              }}
            />
          ))}
          {several && labels.chosenOnly !== undefined ? (
            <button
              type="button"
              aria-pressed={chosenOnly}
              onClick={() => {
                setChosenOnly((now) => !now);
              }}
              className={cn(
                "inline-flex h-9 items-center rounded-m-control border px-3 text-m-label whitespace-nowrap text-m-ink max-sm:min-h-11",
                "aurora:h-[30px] aurora:rounded-full aurora:text-[13px]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
                chosenOnly
                  ? "border-m-accent/55 bg-m-selected aurora:bg-m-accent-wash"
                  : "border-m-control bg-m-plate hover:bg-m-hover aurora:border-dashed aurora:border-a-edge-dashed aurora:bg-transparent",
              )}
            >
              {labels.chosenOnly}
            </button>
          ) : null}
          {anySet ? (
            <button
              type="button"
              onClick={clearAll}
              className={cn(buttonClasses({ variant: "quiet", size: 36 }), "max-sm:h-11")}
            >
              {labels.clear}
            </button>
          ) : null}
          {action === undefined ? null : (
            <span className="ml-auto flex items-center">{action}</span>
          )}
        </div>

        {viewList.length === 0 ? null : (
          <div
            ref={viewRow}
            role="radiogroup"
            aria-label={labels.views}
            onKeyDown={onViewKeyDown}
            className="mx-5 mb-2 flex gap-[22px] overflow-x-auto border-b border-m-hairline"
          >
            {viewList.map((one, at) => {
              const on = one.key === view;
              return (
                <button
                  key={one.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={at === viewStop ? 0 : -1}
                  onClick={() => {
                    pickView(one.key);
                  }}
                  className={cn(
                    "-mb-px border-b-2 pt-1.5 pb-2.5 text-[13.5px] leading-5 whitespace-nowrap max-sm:min-h-11",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
                    on
                      ? "border-m-accent font-medium text-m-ink"
                      : "border-transparent text-m-ink-2 hover:text-m-ink",
                  )}
                >
                  {one.label}
                </button>
              );
            })}
          </div>
        )}

        <p role="status" className="min-h-[18px] px-5 pb-2 text-m-meta text-m-ink-3">
          {status}
        </p>

        <div className="overflow-x-auto border-t border-m-hairline">
          <div style={{ minWidth }}>
            <div
              aria-hidden="true"
              className="grid gap-3.5 px-5 pt-2 pb-1.5 text-[12px] leading-4 text-m-ink-3"
              style={grid}
            >
              <span />
              {columns.map((column) => (
                <span key={column.key}>{column.label}</span>
              ))}
            </div>
            {state === "ready" && rows.length === 0 ? (
              <p className="px-5 pt-2 pb-4 text-m-meta text-m-ink-3">{labels.empty}</p>
            ) : null}
            <ul
              id={listId}
              role="listbox"
              aria-label={labels.list}
              {...(several ? { "aria-multiselectable": true } : {})}
              className={cn(
                "flex max-h-[min(52vh,520px)] flex-col gap-0.5 overflow-y-auto px-2 pb-1.5",
                state === "loading" && result !== null && "opacity-60",
              )}
            >
              {rows.map((item, index) => {
                const key = itemKey(item);
                const on = chosen.has(key);
                const reason = unavailable?.(item) ?? null;
                const off = blocked(item);
                return (
                  <li
                    key={key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={on}
                    {...(off ? { "aria-disabled": true } : {})}
                    // The field keeps focus; the click lands on the row it started on.
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      toggle(item);
                    }}
                    onDoubleClick={() => {
                      if (!several && !off) onConfirm([item]);
                    }}
                    onPointerMove={() => {
                      if (at !== index) setActive(index);
                    }}
                    style={grid}
                    className={cn(
                      "grid cursor-pointer items-center gap-x-3.5 rounded-m-chip px-3 py-2 text-[13px] leading-[19px] text-m-ink-2 aurora:rounded-a-item",
                      on &&
                        "bg-m-selected shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--gm-accent)_45%,transparent)]",
                      index === at && "outline-2 -outline-offset-2 outline-m-ring",
                      off && "cursor-not-allowed text-m-ink-off",
                    )}
                  >
                    {several ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-4 place-items-center rounded-[5px] text-m-accent-on",
                          on ? "bg-m-accent" : "border border-m-control",
                        )}
                      >
                        {on ? (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m5 12 5 5L20 7" />
                          </svg>
                        ) : null}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[18px] rounded-full border-[1.5px]",
                          on
                            ? "border-m-accent shadow-[inset_0_0_0_3px_var(--gm-overlay),inset_0_0_0_8px_var(--gm-accent)]"
                            : "border-m-control",
                        )}
                      />
                    )}
                    {columns.map((column) => (
                      <span key={column.key} className="min-w-0">
                        {column.cell(item)}
                      </span>
                    ))}
                    {reason === null ? null : (
                      <span className="text-m-meta text-m-ink-3" style={{ gridColumn: "2 / -1" }}>
                        {reason}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {chosenOnly || pages <= 1 ? null : (
          <div className="px-5 pt-1 pb-2.5">
            <Pagination
              summary={labels.page(page, pages)}
              backLabel={labels.back}
              nextLabel={labels.next}
              {...(page > 1
                ? {
                    onBack: () => {
                      setPage(page - 1);
                    },
                  }
                : {})}
              {...(page < pages
                ? {
                    onNext: () => {
                      setPage(page + 1);
                    },
                  }
                : {})}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 border-t border-m-hairline bg-m-plate/50 px-5 py-3 aurora:bg-transparent">
          <div className="flex min-w-0 flex-[1_1_240px] flex-wrap items-center gap-1.5">
            {note !== undefined && !(several && picked.length > 0) ? (
              <span className="text-m-meta text-m-ink-3">{note}</span>
            ) : null}
            {several && picked.length > 0 ? (
              <>
                <span className="mr-1 text-m-label text-m-ink">
                  {labels.chosen?.(picked.length)}
                </span>
                {picked.map((item) => (
                  <span
                    key={itemKey(item)}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-m-accent/40 bg-m-accent-wash pr-1 pl-[11px] text-[13px] whitespace-nowrap text-m-ink"
                  >
                    {itemName(item)}
                    <button
                      type="button"
                      aria-label={labels.remove?.(itemName(item)) ?? itemName(item)}
                      onClick={() => {
                        remove(itemKey(item));
                      }}
                      className="grid size-6 place-items-center rounded-full text-[15px] leading-none text-m-ink-2 hover:bg-m-hover focus-visible:outline-2 focus-visible:outline-m-ring"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                ))}
              </>
            ) : null}
          </div>
          {footAction}
          <Button variant="secondary" size={36} onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            size={36}
            disabled={picked.length === 0}
            onClick={() => {
              onConfirm(picked);
            }}
          >
            {one === undefined
              ? labels.chooseNothing
              : several
                ? (labels.add?.(picked.length) ?? labels.chooseNothing)
                : labels.choose(itemName(one))}
          </Button>
        </div>
      </div>
    </div>
  );
}
