import type { ReactNode } from "react";
import { cn } from "../cn.js";

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
  className?: string;
}

export function Table<Row>({ columns, rows, rowKey, caption, className }: TableProps<Row>) {
  return (
    // The one place `sunken` appears on a signed-in screen: the well the table
    // sits in. Clipped corners so the hairlines do not cross the radius.
    <div className={cn("overflow-x-auto rounded-m-card bg-m-sunken", className)}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={column.sort === undefined ? undefined : column.sort}
                className={cn(
                  "h-[42px] border-b border-m-subtle px-5 text-m-control text-m-ink-2",
                  column.numeric === true ? "text-right" : "",
                )}
              >
                {column.onSort === undefined ? (
                  column.header
                ) : (
                  <button type="button" onClick={column.onSort} className="text-m-control">
                    {column.header}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "h-11 border-b border-m-hairline px-5 text-m-meta text-m-ink",
                    column.numeric === true ? "text-right font-mono tabular-nums" : "",
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
