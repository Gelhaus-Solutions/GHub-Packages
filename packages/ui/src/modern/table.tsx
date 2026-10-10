import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";
import { Checkbox } from "./checkbox.js";

/*
 * Aurora: a table alone is its own pane of glass. Inside a glass section it
 * goes flat and runs to the pane's edges, so the section's head sits directly
 * over its header row as one object. Spelled out rather than composed,
 * because Tailwind reads class names from the source and cannot see one
 * built from two strings.
 */
const AURORA_IN_SECTION =
  "aurora:in-data-m-body:-mx-[18px] aurora:in-data-m-body:rounded-none aurora:in-data-m-body:border-0 aurora:in-data-m-body:bg-transparent aurora:in-data-m-body:shadow-none aurora:in-data-m-body:backdrop-filter-none";

export interface Column<Row> {
  /** Stable identity for the column, used as the React key. */
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /**
   * Mono with tabular figures. **Inside a data cell is the only place on a
   * modern screen where mono is allowed**, and this flag is where that boundary
   * is drawn: an identifier, a date, a figure or money. A name is not one.
   */
  numeric?: boolean;
  /**
   * The current sort of this column, if the table is sorted by it. Becomes
   * `aria-sort` on the header, which is what tells somebody not looking at the
   * chevron which column is ordering the rows.
   */
  sort?: "ascending" | "descending";
  /** Present when the column can be sorted. The header becomes a button. */
  onSort?: () => void;
}

/**
 * The staff index, and the boundary between modern and console.
 *
 * Console's table habits are deliberately out: no uppercase heads, no lit
 * status cell, no readout band above it and no zebra. The head is sentence case
 * sans, because a column heading is a word being read rather than a label being
 * scanned in an instrument.
 *
 * **A row's action is a link in the last cell, never a click on the whole
 * row.** A row-wide target takes every cell into the link's accessible name, so
 * a screen reader announces the entire record as one string before saying what
 * pressing it does, and text inside the row cannot be selected.
 *
 * **Horizontal scroll before any column is dropped.** A column removed at a
 * narrow width is data a person cannot reach at all, and they have no way to
 * know it was there. A scrollbar is worse looking and strictly more honest.
 */
export interface TableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /**
   * Names the table for somebody moving between them. Visually hidden rather
   * than absent: a table with no caption is announced only as "table", which in
   * a list of three is no help at all.
   */
  caption: ReactNode;
  /**
   * Row selection, for a list with bulk verbs: a checkbox column leads, with
   * "select all on this page" in the header, and while anything is selected
   * `bar` (a `BulkBar`) takes the header row's place. The header cells stay
   * for a screen reader, out of sight. Selected rows take the accent wash.
   * Selecting all means this page, never the whole result.
   */
  selection?: TableSelection<Row>;
  /**
   * The width under which the table scrolls sideways rather than squeezing
   * its columns, so a reference is never broken across lines.
   */
  minWidth?: number;
  className?: string;
}

export interface TableSelection<Row> {
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  /** Names a row's checkbox: its reference. */
  rowLabel: (row: Row) => string;
  /** "Select all on this page". */
  allLabel?: string;
  bar?: ReactNode;
}

export function Table<Row>({
  columns,
  rows,
  rowKey,
  caption,
  selection,
  minWidth,
  className,
}: TableProps<Row>) {
  const keys = rows.map(rowKey);
  const chosen =
    selection === undefined ? 0 : keys.filter((key) => selection.selected.has(key)).length;
  const barred = selection?.bar !== undefined && selection.selected.size > 0;
  const toggle = (key: string, on: boolean): void => {
    if (selection === undefined) return;
    const next = new Set(selection.selected);
    if (on) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  };
  return (
    // The one place `sunken` appears on a signed-in screen: the well the table
    // sits in. Clipped corners so the hairlines do not cross the radius.
    <div
      data-m-flush=""
      className={cn(
        "overflow-x-auto rounded-m-card bg-m-sunken",
        AURORA_GLASS,
        AURORA_IN_SECTION,
        className,
      )}
    >
      {barred ? selection.bar : null}
      <table
        className="w-full border-collapse text-left"
        style={minWidth === undefined ? undefined : { minWidth: `${String(minWidth)}px` }}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={barred ? "[&>th]:sr-only" : undefined}>
            {selection === undefined ? null : (
              <th
                scope="col"
                className="h-[42px] w-10 border-b border-m-subtle pr-0 pl-5 aurora:h-9 aurora:border-b-0 aurora:pl-4"
              >
                <Checkbox
                  checked={chosen === 0 ? false : chosen === keys.length ? true : "mixed"}
                  label={selection.allLabel ?? "Select all on this page"}
                  onCheckedChange={(on) => {
                    const next = new Set(selection.selected);
                    for (const key of keys) {
                      if (on) next.add(key);
                      else next.delete(key);
                    }
                    selection.onChange(next);
                  }}
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={column.sort === undefined ? undefined : column.sort}
                className={cn(
                  "h-[42px] border-b border-m-subtle px-5 text-m-label text-m-ink-2",
                  "aurora:h-9 aurora:border-b-0 aurora:px-4 aurora:text-[12px] aurora:leading-4 aurora:font-normal aurora:text-m-ink-3",
                  column.numeric === true ? "text-right" : "",
                )}
              >
                {column.onSort === undefined ? (
                  column.header
                ) : (
                  <button type="button" onClick={column.onSort} className="text-m-label">
                    {column.header}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const on = selection?.selected.has(key) === true;
            return (
              <tr key={key} className={on ? "bg-m-accent-wash" : undefined}>
                {selection === undefined ? null : (
                  <td className="h-11 w-10 border-b border-m-hairline pr-0 pl-5 aurora:h-[52px] aurora:border-t aurora:border-b-0 aurora:pl-4">
                    <Checkbox
                      checked={on}
                      label={selection.rowLabel(row)}
                      onCheckedChange={(next) => toggle(key, next)}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "h-11 border-b border-m-hairline px-5 text-m-meta text-m-ink",
                      // Aurora rows are taller and ruled above, so the header
                      // row is separated from the first one and the last row
                      // ends on the pane's own edge.
                      "aurora:h-[52px] aurora:border-t aurora:border-b-0 aurora:px-4 aurora:py-2 aurora:text-[13.5px] aurora:leading-[19px]",
                      column.numeric === true ? "text-right font-mono tabular-nums" : "",
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
