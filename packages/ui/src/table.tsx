import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * Tables. Rows are the primary object in a control plane, so they get a hover
 * affordance, a sticky header, and numeric columns that align. No zebra
 * striping: hairlines carry the structure and stripes fight with status colour.
 *
 * The three things this grew for are all one problem, which is that a list of
 * forty rows could not say which two of them wanted an answer. Severity was a
 * badge in the middle of a row, competing with every other badge; a row needing
 * a decision sorted wherever its name put it; and every row weighed the same.
 *
 *   - `TGutter` marks a row in the margin, where nothing else is drawn.
 *   - `TGroupHeader` puts the rows that need an answer above the ones that do
 *     not, and names what the group is rather than only counting it.
 *   - `TR attention` gives those rows a little more room, because they carry a
 *     sentence the settled ones do not.
 *
 * The rule underneath all three: **a row is never tinted**. A washed row makes
 * the text on it harder to read at exactly the moment somebody needs to read
 * it, and it leaves the status competing with whatever badges the row already
 * had. The mark goes in the margin instead, which is empty by construction.
 */
export function TableWrap({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    // `tabIndex` because this scrolls. A region that overflows horizontally and
    // takes no focus can be scrolled with a mouse and not with a keyboard,
    // which is WCAG 2.1.1, and axe names it `scrollable-region-focusable`.
    //
    // Always, rather than only when it actually overflows. Whether it does
    // depends on the viewport and the widest cell, neither of which is known
    // here, and this is a server component with nothing to measure with. The
    // cost is a tab stop on a table that happens to fit; the alternative is a
    // table nobody can read at 900px without a mouse.
    <div tabIndex={0} className={cn("w-full overflow-x-auto", className)} {...props}>
      {children}
    </div>
  );
}

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-sm", className)} {...props}>
      {children}
    </table>
  );
}

export function THead({
  className,
  children,
  surface = "raised",
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & {
  /**
   * What the header sits on, because sticky needs an opaque fill and a
   * transparent one shows the rows sliding under it.
   *
   * `raised` is a table inside a `Panel`, which is still most of them. `base`
   * is a table on the sheet, which is what the redesign asks for once a screen
   * is a masthead and ruled sections rather than a stack of cards. The default
   * flips the day the last panel goes.
   */
  surface?: "raised" | "base";
}) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 text-left backdrop-blur-sm",
        surface === "base" ? "bg-base/95" : "bg-raised/95",
        className,
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TH({
  className,
  children,
  numeric = false,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "label-caps px-3 py-[7px] whitespace-nowrap",
        "border-b border-(--gc-border-hairline)",
        numeric && "text-right",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

/** The header cell over the state gutter. Empty by contract, not by omission. */
export function TGutterHead() {
  return <th className="w-[26px] border-b border-(--gc-border-hairline) px-0" />;
}

const gutterBar: Record<Status, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  crit: "bg-crit",
  info: "bg-info",
  locked: "bg-locked",
  idle: "bg-idle",
};

/**
 * The state gutter: a mark in the margin on a row that wants an answer.
 *
 * Every row in a grouped table carries this cell, and most of them carry it
 * empty. That is deliberate rather than wasteful: a column that appears and
 * disappears would shift every other column between one group and the next, and
 * the whole point of the mark is that the eye can run down one fixed line to
 * find the rows that matter.
 */
export function TGutter({ status }: { status?: Status }) {
  return (
    <td className="w-[26px] px-0">
      {status === undefined ? null : (
        <span
          aria-hidden="true"
          className={cn("ml-[11px] block h-[34px] w-[3px] rounded-full", gutterBar[status])}
        />
      )}
    </td>
  );
}

export function TBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-(--gc-border-hairline)", className)} {...props}>
      {children}
    </tbody>
  );
}

/**
 * A band across the table naming the rows under it.
 *
 * The clause is the part worth insisting on. A header reading "NEEDS A DECISION
 * 2" tells a reader the number they can already count; one reading "a deploy
 * nobody placed, and a deployment the host disagrees with" tells them what kind
 * of thing they are about to read and whether it is worth reading now. A group
 * that cannot be described in a clause is probably not a group.
 *
 * `day` is the same band with a date in it, for a log where the grouping is
 * time rather than urgency. Same component because it is the same thing: an
 * inset rule saying what the rows beneath it have in common.
 */
export function TGroupHeader({
  label,
  count,
  clause,
  colSpan,
  variant = "group",
}: {
  label: ReactNode;
  /** How many rows are under it. Mono, because it is a number. */
  count?: number;
  /** What the group is, in a clause rather than a sentence. */
  clause?: ReactNode;
  colSpan: number;
  variant?: "group" | "day";
}) {
  return (
    <tr className="bg-inset">
      <td colSpan={colSpan} className="py-1.5 pl-[26px] pr-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              variant === "day"
                ? "numeric text-2xs text-fg-secondary"
                : "label-caps font-semibold text-fg-secondary",
            )}
          >
            {label}
          </span>
          {count === undefined ? null : (
            <span className="numeric text-3xs text-fg-tertiary">{count}</span>
          )}
          {clause === undefined ? null : (
            <span className="text-2xs text-fg-tertiary">· {clause}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TR({
  className,
  children,
  interactive = false,
  attention = false,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  interactive?: boolean;
  /**
   * A row that wants an answer. Slightly more room, because it carries a
   * sentence saying why and a settled row carries only its values.
   */
  attention?: boolean;
}) {
  return (
    <tr
      className={cn(
        // The row supplies its cells' vertical padding rather than each cell
        // choosing: density is a property of the row, and a table where one
        // cell disagreed with its neighbours about it would be ragged.
        attention ? "[&>td]:py-[9px]" : "[&>td]:py-2",
        interactive &&
          // `relative` is what lets `rowLinkClasses` stretch its hit area over
          // the whole row. Without it the overlay sizes itself to the table.
          // `group` is what lets the chevron brighten with the row.
          "group relative cursor-pointer transition-colors duration-(--duration-instant) hover:bg-hover",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

/**
 * The link that makes a whole row clickable.
 *
 * A row that lights up on hover is a row people click, and they do not aim at
 * the first column. Putting an anchor in every cell is invalid once a cell
 * holds a button, and an `onClick` on the row throws away everything an anchor
 * gives you: middle-click, open in a new tab, copy link, keyboard focus, and
 * the status bar telling you where you are about to go.
 *
 * So there is exactly one real anchor, in the cell that names the thing, and a
 * transparent `::after` stretched over the row from it. The row is the hit
 * area, the anchor is still an anchor, and assistive technology reads one link
 * per row rather than seven.
 *
 * The row it sits in must be `interactive`, which supplies the `relative` this
 * positions against. Anything else in the row that needs clicking of its own,
 * a button or a form, has to sit above the overlay: `relative z-10` on that
 * cell does it, and `TD` takes a className.
 *
 * Deliberately in a module with no "use client", like `buttonClasses`, so a
 * server component can put these classes on a framework `Link`.
 */
export function rowLinkClasses(className?: string): string {
  return cn(
    "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
    "after:absolute after:inset-0 after:content-['']",
    className,
  );
}

export function TD({
  className,
  children,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-fg-secondary",
        numeric && "numeric text-right text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/**
 * The chevron at the end of a clickable row.
 *
 * Quiet until the row is under the pointer, because twelve chevrons down the
 * right edge of a settled list is twelve arrows pointing at nothing in
 * particular. It brightens with the row rather than on its own hover, so the
 * affordance belongs to the whole row, which is what is actually clickable.
 */
export function TChevron() {
  return (
    <td className="w-6 px-3 text-fg-disabled transition-colors duration-(--duration-instant) group-hover:text-fg-tertiary">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </td>
  );
}

/**
 * Primary cell content, a quieter second line, and where a row needs an answer,
 * the sentence saying why.
 *
 * The sentence is in the naming cell rather than in a column of its own because
 * it is about the row rather than about one of its values, and because a column
 * wide enough to hold it would be empty on every settled row. It takes the
 * status colour, which is the same colour the gutter mark on that row is drawn
 * in: two marks, one claim.
 *
 * `tone` has three states rather than two because the table has three. In an
 * ungrouped list every name is the thing itself and reads at full strength. In
 * a grouped one the settled names step back so the rows that want an answer are
 * the ones the eye lands on, which only works if stepping back is deliberate
 * rather than the default.
 */
export function CellStack({
  primary,
  secondary,
  secondaryMono = false,
  note,
  noteStatus,
  tone,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  /** Set where the second line is an id, a digest, a version or a slug. */
  secondaryMono?: boolean;
  /** Why this row wants an answer. One sentence, and it names the next step. */
  note?: ReactNode;
  noteStatus?: Status;
  /** Unset outside a grouped table, where every name reads at full strength. */
  tone?: "attention" | "settled";
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "truncate",
          tone === "attention" && "font-medium text-fg",
          tone === "settled" && "text-fg-secondary",
          tone === undefined && "text-fg",
        )}
      >
        {primary}
      </div>
      {secondary === undefined ? null : (
        <div
          className={cn("mt-0.5 truncate text-2xs text-fg-tertiary", secondaryMono && "numeric")}
        >
          {secondary}
        </div>
      )}
      {note === undefined ? null : (
        <p
          className={cn(
            "mt-1 max-w-[46ch] text-2xs",
            noteStatus === undefined ? "text-fg-tertiary" : noteInk[noteStatus],
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

const noteInk: Record<Status, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  crit: "text-crit-ink",
  info: "text-info-ink",
  locked: "text-locked-ink",
  idle: "text-fg-tertiary",
};
