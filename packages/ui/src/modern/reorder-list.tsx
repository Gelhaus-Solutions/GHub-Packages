"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";

/** One row. The caller's own fields ride along and come back typed in `onChange`. */
export interface ReorderListItem {
  /** Stable identity, used as the React key and to find the row again after a move. */
  key: string;
  /** What the row shows: a name, a meta line, a select. Anything but the arrows. */
  content: ReactNode;
  /**
   * The row's own verbs, after the arrows. Remove, Open, Texts. The arrows come
   * first because they are the same in every row and the verbs are not, so a
   * keyboard user tabbing along a row meets the predictable stops before the
   * particular ones.
   */
  verbs?: ReactNode;
}

/** What one press did, for a caller that marks the row or records the change. */
export interface ReorderMove {
  key: string;
  /** Zero-based index before the move. */
  from: number;
  /** Zero-based index after it. */
  to: number;
}

type Direction = "up" | "down";

/**
 * An ordered list whose order is data. Drawn for the GPlatform Terms staff
 * console, where the documents a product covers and the sections of a mail are
 * recorded in the order they are listed, so moving one is a real change.
 *
 * **Two buttons per row, not a drag.** WCAG 2.5.7 asks for a way to reorder
 * without dragging, and buttons are that way for everybody: a keyboard, a
 * switch, a screen reader, a tremor. Dragging would be an addition on top of
 * them and is not built here. The optional grip is decoration and is hidden
 * from assistive technology; leave it off until something can drag, because a
 * grip that does nothing when grabbed is a promise the row cannot keep.
 *
 * **Focus follows the row.** Pressing an arrow moves the row and keeps focus on
 * the same arrow in its new place, so pressing it again keeps going. React
 * moves a keyed node by reinserting it, and a reinserted node loses focus in
 * every browser, so the focus is put back by hand after the caller's re-render
 * rather than trusted to survive it. At an end the arrow just pressed is
 * disabled, and a disabled button cannot hold focus, so focus goes to the other
 * arrow of the same row instead of falling to the top of the page.
 *
 * **Controlled, and local until the page confirms.** The list holds no order of
 * its own: it hands the next order to `onChange` and renders whatever comes
 * back. Nothing is saved by a press, which is what the confirm on the page is
 * for, and why the announcement says where the row is now rather than that
 * anything was changed.
 */
export interface ReorderListProps<Item extends ReorderListItem = ReorderListItem> {
  /** Names the list, for somebody moving by list. "Covered documents, in order". */
  label: string;
  items: readonly Item[];
  /** Receives the whole next order and the move that produced it. */
  onChange: (next: readonly Item[], move: ReorderMove) => void;
  /**
   * The Move up button's accessible name, built by the caller from the row.
   *
   * A function rather than a template string, because the row's name is not
   * always said the way it is shown: the drawing labels "Acceptable use policy"
   * as "Move the acceptable use policy up", and only the caller's locale knows
   * where the article goes. A bare "Move up" is the name of every one of these
   * on a screen with twelve.
   */
  moveUpLabel: (item: Item) => string;
  moveDownLabel: (item: Item) => string;
  /**
   * The polite announcement after a move: "Acceptable use policy, now 2 of 3."
   * Positions are one-based, the way the list shows them.
   */
  announce: (item: Item, position: number, total: number) => string;
  /** The row the caller wants to point at, "just moved" or "added". Drawn on the selected film. */
  markedKey?: string;
  /** Draws the decorative grip. See above for why it is off by default. */
  handle?: boolean;
  className?: string;
}

/*
 * No transition on either arrow. `transition-colors` in Tailwind 4 includes
 * `outline-color`, so it would animate the focus ring, and a ring that fades in
 * is a ring that is not there when somebody is tabbing fast.
 */
const ARROW_BASE =
  "inline-grid size-8 shrink-0 place-items-center rounded-m-chip border aurora:rounded-full " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";

/** A disabled arrow loses its material as well as its ink, the modern rule for inactive. */
const ARROW_ON =
  "border-m-control bg-m-plate text-m-ink shadow-m-quiet aurora:border-a-edge-button aurora:bg-transparent aurora:shadow-none";
const ARROW_OFF = "border-transparent text-m-ink-off";

export function ReorderList<Item extends ReorderListItem = ReorderListItem>({
  label,
  items,
  onChange,
  moveUpLabel,
  moveDownLabel,
  announce,
  markedKey,
  handle = false,
  className,
}: ReorderListProps<Item>) {
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<{ key: string; to: number; direction: Direction } | null>(null);
  const [message, setMessage] = useState("");

  function move(from: number, direction: Direction) {
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    pending.current = { key: moved.key, to, direction };
    onChange(next, { key: moved.key, from, to });
  }

  useEffect(() => {
    /*
     * Runs when the caller hands the new order back, not on the press. Focusing
     * and announcing at the press would describe an order the list is not yet
     * showing, and would be wrong outright if the caller declined the move.
     * The index check is the same guard from the other side: a pending move
     * that the new items do not reflect is dropped rather than applied to some
     * later, unrelated change.
     */
    const target = pending.current;
    pending.current = null;
    if (target === null) return;
    const item = items[target.to];
    if (item === undefined || item.key !== target.key) return;

    setMessage(announce(item, target.to + 1, items.length));

    const atEnd = target.direction === "up" ? target.to === 0 : target.to === items.length - 1;
    const direction: Direction = atEnd
      ? target.direction === "up"
        ? "down"
        : "up"
      : target.direction;
    arrows.current.get(`${target.key}:${direction}`)?.focus();
    // Only a new order runs this. `announce` and the labels are fresh closures
    // on every render, and listing them would re-focus on any re-render at all.
  }, [items]);

  function arrow(item: Item, index: number, direction: Direction) {
    const enabled = direction === "up" ? index > 0 : index < items.length - 1;
    const Glyph = direction === "up" ? ArrowUp : ArrowDown;
    const ref = `${item.key}:${direction}`;
    return (
      <button
        type="button"
        ref={(node) => {
          if (node === null) arrows.current.delete(ref);
          else arrows.current.set(ref, node);
        }}
        disabled={!enabled}
        aria-label={direction === "up" ? moveUpLabel(item) : moveDownLabel(item)}
        onClick={() => {
          move(index, direction);
        }}
        className={cn(ARROW_BASE, enabled ? ARROW_ON : ARROW_OFF)}
      >
        <Glyph aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <div className={className}>
      {/*
       * `role="list"` restates what `ol` already is, on purpose: Safari drops
       * list semantics from a list styled with `list-style: none`, which
       * Tailwind's preflight does to every list, and VoiceOver then stops
       * saying "3 of 5" on the very list whose order is the point.
       */}
      <ol role="list" aria-label={label} className="flex flex-col gap-2">
        {items.map((item, index) => {
          const marked = item.key === markedKey;
          return (
            <li
              key={item.key}
              className={cn(
                "flex flex-wrap items-center gap-3.5 rounded-m-panel border px-3.5 py-3",
                // A transparent edge on the resting row, so the marked row's
                // real edge does not shift the list by two pixels.
                marked
                  ? "border-m-accent/40 bg-m-selected aurora:rounded-a-choice"
                  : `border-transparent bg-m-plate shadow-m-plate ${AURORA_GLASS} aurora:rounded-a-choice`,
              )}
            >
              {handle ? (
                <GripVertical
                  aria-hidden="true"
                  className="size-4 shrink-0 text-m-ink-3"
                  strokeWidth={1.75}
                />
              ) : null}
              {/*
               * The position is shown and also read. The list announces "2 of
               * 3" only where the reader moves by list item; the figure is the
               * same fact for somebody reading the row from left to right.
               */}
              <span className="w-[18px] shrink-0 font-mono text-m-meta tabular-nums text-m-ink-3">
                {index + 1}
              </span>
              <div className="min-w-[200px] flex-1">{item.content}</div>
              <div className="flex shrink-0 gap-1">
                {arrow(item, index, "up")}
                {arrow(item, index, "down")}
              </div>
              {item.verbs === undefined ? null : <div className="shrink-0">{item.verbs}</div>}
            </li>
          );
        })}
      </ol>
      {/*
       * Present and empty from the first paint, because a live region that is
       * inserted together with its first message is not announced by most
       * screen readers: they only watch regions that already exist.
       */}
      <p role="status" className="sr-only">
        {message}
      </p>
    </div>
  );
}
