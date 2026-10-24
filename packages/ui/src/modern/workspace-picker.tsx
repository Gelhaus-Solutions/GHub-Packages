"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn.js";
import { AURORA_FIELD, AURORA_MENU } from "./aurora.js";
import { Avatar } from "./avatar.js";

/**
 * The top of a rail: where the reader is, and every other place they can be.
 *
 * One control where products had two. The question a rail answers first is
 * "whose screens are these", and splitting it into a kind (account, company,
 * group, staff) and then a choice inside that kind made somebody with one
 * company open two menus to get to it. Here every place is a row of one list,
 * grouped by kind, so the company is one choice away from the account.
 *
 * **The mark says the kind before the name is read.** A round picture for the
 * person's own account, a square monogram for a company, the same square in
 * the info colour for a group, an amber STAFF chip for staff. Shape and colour
 * both carry it, so it survives a monochrome screen and a colour-blind reader.
 *
 * **A search field once there are more than eight places**, the count at which
 * a list stops being read and starts being scanned. Under that a field is one
 * more stop on the way to the row somebody wanted.
 *
 * **Rows are links, behind a button that says whether it is open.** Every row
 * goes somewhere, so a screen reader announces each as a link and a middle
 * click opens it in a tab. This package knows no router, so `render` draws the
 * link, as `NavItem`'s does. The arrows move between the rows (and the field),
 * Home and End jump, Escape closes and gives focus back to the button, and
 * leaving the picker by Tab or a click outside closes it.
 */
export type WorkspaceKind = "account" | "organisation" | "group" | "staff";

export interface WorkspacePlace {
  /** Unique across the list: the kind and the slug, say. */
  key: string;
  kind: WorkspaceKind;
  name: string;
  /** The line under the name: the reader's standing there ("Owner"), or the account's address. */
  line: string;
  href: string;
  /** The person's picture, for the account row. */
  picture?: string | null;
  /** The stable id an account's tint is picked from. Required for `account`. */
  tintKey?: string;
}

export interface WorkspacePickerLabels {
  /** Read before the current place on the button: "Switch place". */
  open: string;
  /** The search field's label and placeholder. */
  search: string;
  /** Said where the search matches nothing. */
  empty: string;
  /** One heading per kind present. */
  kinds: Record<WorkspaceKind, string>;
  /** The staff chip's word. */
  staff: string;
}

export interface WorkspacePickerProps {
  places: readonly WorkspacePlace[];
  /** The key of the place the screens are about. */
  current: string;
  labels: WorkspacePickerLabels;
  /** Draws a row's link; receives what to spread onto the anchor. */
  render: (props: {
    href: string;
    className: string;
    children: ReactNode;
    "aria-current": "page" | undefined;
    "data-place": string;
    onClick: () => void;
  }) => ReactNode;
  /** A last line under the list, such as a link to start a company. */
  footer?: ReactNode;
  className?: string;
}

/** More places than this and the list gets a search field. */
export const WORKSPACE_SEARCH_FROM = 9;

const ORDER: readonly WorkspaceKind[] = ["account", "organisation", "group", "staff"];

function monogram(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : (words[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

function Mark({
  place,
  size,
  staffWord,
}: {
  place: WorkspacePlace;
  size: number;
  staffWord: string;
}) {
  if (place.kind === "account") {
    return (
      <Avatar
        name={place.name}
        src={place.picture ?? null}
        tintKey={place.tintKey ?? place.key}
        size={size}
      />
    );
  }
  if (place.kind === "staff") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-m-warn px-2 font-mono text-[11px] font-medium tracking-[0.06em] text-[oklch(0.2_0.03_80)]"
      >
        {staffWord}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-[9px] font-semibold leading-none",
        place.kind === "group"
          ? "bg-[linear-gradient(135deg,var(--gm-info),color-mix(in_oklch,var(--gm-info)_70%,black))] text-m-ink"
          : "bg-[linear-gradient(135deg,var(--gm-accent),color-mix(in_oklch,var(--gm-accent)_75%,black))] text-m-accent-on",
      )}
    >
      {monogram(place.name)}
    </span>
  );
}

export function WorkspacePicker({
  places,
  current,
  labels,
  render,
  footer,
  className,
}: WorkspacePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const here = places.find((place) => place.key === current) ?? places[0];
  const searchable = places.length >= WORKSPACE_SEARCH_FROM;

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle === ""
      ? places
      : places.filter(
          (place) =>
            place.name.toLocaleLowerCase().includes(needle) ||
            place.line.toLocaleLowerCase().includes(needle),
        );
  }, [places, query]);

  // Leaving the picker closes it, whether by Tab or by a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent | FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && root.current?.contains(target) === true) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  // A fresh open starts from the whole list.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (here === undefined) return null;

  /** The field (where there is one) and the rows, in the order the arrows walk. */
  const stops = (): HTMLElement[] => [
    ...(panel.current?.querySelectorAll<HTMLElement>("input[type=search], [data-place]") ?? []),
  ];

  const focusStop = (index: number) => {
    const all = stops();
    if (all.length === 0) return;
    all[Math.max(0, Math.min(index, all.length - 1))]?.focus();
  };

  const openAndFocus = () => {
    setOpen(true);
    // After the panel renders: the field when there is one, else the current row.
    window.requestAnimationFrame(() => {
      const all = stops();
      const at = all.findIndex((stop) => stop.getAttribute("aria-current") === "page");
      focusStop(searchable ? 0 : Math.max(0, at));
    });
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus();
    }
  };

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = stops();
    const at = all.findIndex((stop) => stop === document.activeElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "ArrowDown":
        event.preventDefault();
        focusStop(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusStop(at <= 0 ? 0 : at - 1);
        return;
      case "Home":
        if (document.activeElement instanceof HTMLInputElement) return;
        event.preventDefault();
        focusStop(searchable ? 1 : 0);
        return;
      case "End":
        if (document.activeElement instanceof HTMLInputElement) return;
        event.preventDefault();
        focusStop(all.length - 1);
        return;
      default:
        return;
    }
  };

  const kinds = ORDER.filter((kind) => shown.some((place) => place.kind === kind));

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? setOpen(false) : openAndFocus())}
        onKeyDown={onButtonKey}
        className={cn(
          "flex min-h-12 w-full items-center gap-2.5 rounded-m-control border p-2 text-left",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
          here.kind === "staff"
            ? "border-[color-mix(in_oklch,var(--gm-warn)_30%,transparent)] bg-[linear-gradient(120deg,color-mix(in_oklch,var(--gm-warn)_14%,transparent),transparent_70%)]"
            : "border-m-control bg-m-inset hover:border-m-strong",
          "aurora:rounded-a-choice",
          here.kind === "staff" ? "" : "aurora:border-a-edge aurora:bg-m-hover",
        )}
      >
        <span className="sr-only">{labels.open}: </span>
        <Mark place={here} size={30} staffWord={labels.staff} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium leading-[18px] text-m-ink">
            {here.name}
          </span>
          <span className="truncate text-[12px] leading-4 text-m-ink-3">{here.line}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 text-m-ink-3">
          <path d="M4 6l4-3 4 3M4 10l4 3 4-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          onKeyDown={onPanelKey}
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+4px)] z-30 flex max-h-[70vh] flex-col gap-1 overflow-y-auto",
            "rounded-m-panel border border-m-subtle bg-m-overlay p-1.5 shadow-m-overlay",
            AURORA_MENU,
          )}
        >
          {searchable ? (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={labels.search}
              placeholder={labels.search}
              className={cn(
                "h-10 w-full rounded-m-control border border-m-control bg-m-inset px-3 text-m-label text-m-ink placeholder:text-m-ink-3",
                "focus:outline-none focus:border-m-accent",
                AURORA_FIELD,
              )}
            />
          ) : null}
          {kinds.length === 0 ? (
            <p role="status" className="px-2.5 py-2 text-[13px] text-m-ink-3">
              {labels.empty}
            </p>
          ) : (
            kinds.map((kind) => (
              <div key={kind} role="group" aria-label={labels.kinds[kind]}>
                <p
                  aria-hidden="true"
                  className="px-2.5 pb-1 pt-2 text-[12px] leading-4 text-m-ink-3"
                >
                  {labels.kinds[kind]}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {shown
                    .filter((place) => place.kind === kind)
                    .map((place) => {
                      const isHere = place.key === here.key;
                      return (
                        <li key={place.key}>
                          {render({
                            href: place.href,
                            "data-place": place.key,
                            "aria-current": isHere ? "page" : undefined,
                            onClick: () => setOpen(false),
                            className: cn(
                              "flex min-h-11 items-center gap-2.5 rounded-m-control px-2 py-1.5",
                              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-m-ring",
                              isHere ? "bg-m-selected" : "hover:bg-m-hover",
                              "aurora:rounded-a-item",
                              isHere ? "aurora:bg-a-raised aurora:shadow-a-raised" : "",
                            ),
                            children: (
                              <>
                                <Mark place={place} size={24} staffWord={labels.staff} />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span
                                    className={cn(
                                      "truncate text-[13.5px] leading-[18px] text-m-ink",
                                      isHere ? "font-medium" : "",
                                    )}
                                  >
                                    {place.name}
                                  </span>
                                  <span className="truncate text-[12px] leading-4 text-m-ink-3">
                                    {place.line}
                                  </span>
                                </span>
                                {isHere ? (
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 16 16"
                                    className="size-4 shrink-0 text-m-ink"
                                  >
                                    <path
                                      d="M3.5 8.5l3 3 6-7"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.75"
                                    />
                                  </svg>
                                ) : null}
                              </>
                            ),
                          })}
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))
          )}
          {footer === undefined ? null : (
            <div className="mt-1 border-t border-m-hairline px-1 pt-1.5">{footer}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
