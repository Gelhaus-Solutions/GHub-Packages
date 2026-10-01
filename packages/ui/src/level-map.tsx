"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "./cn.js";
import { Menu, type MenuItem } from "./popover.js";
import type { Status } from "./status.js";
import { StatusDot } from "./status.js";

/**
 * A breadcrumb where every segment switches among its siblings.
 *
 * **The argument, which is the whole component.** A breadcrumb offers exactly
 * one move: up. Every real question at a nested level is sideways. Standing on
 * a database inside a deployment inside an app, nobody wants the app; they want
 * the other database, or the same database on the other deployment. Getting
 * there today means going up two levels and coming back down two, reading two
 * lists on the way, and the trail was showing the names of both of those lists
 * the entire time.
 *
 * So each segment is a button that opens its own siblings, and the trail
 * becomes the navigation instead of a description of where the navigation
 * already took you. App, deployment and database are the same three-level
 * nesting on both sides of the link, with breadcrumbs and nothing else.
 *
 * **`slots` keeps depth legible.** A trail that renders only the levels it has
 * changes length as you move, so the eye has to re-find its place at every
 * step. Passing a fixed number of slots draws the empty ones as a quiet
 * placeholder, and the shape of the trail then means something on its own: a
 * gap says "you have not chosen a database yet", which is a different fact from
 * "this thing has no database".
 */
export interface LevelSibling {
  id: string;
  label: string;
  /** A quieter second line: what it is, where the label is an id. */
  hint?: string;
  /** Where it stands, if that is something the chooser should know. */
  status?: Status;
  /**
   * Where this sibling goes, as data rather than as a function.
   *
   * This is the server-safe path and the one to reach for. A trail is drawn on
   * a server-rendered screen, and a server component cannot pass a function to
   * a client component, which this is: a `hrefFor` written in a page would fail
   * at render with "Functions cannot be passed directly to Client Components",
   * having passed both typecheck and build. `hrefFor` remains for a caller that
   * is already a client component.
   */
  href?: string;
}

export interface Level {
  /** What kind of thing this level is. Shown when the slot is empty. */
  kind: string;
  /** The one you are standing on, or nothing if this slot is unfilled. */
  label?: ReactNode;
  /** Mono, where the label is an identifier rather than a name. */
  mono?: boolean;
  /** How many things are inside this one. */
  count?: number;
  icon?: ReactNode;
  /** The others at this level. Fewer than two and the segment is not a switcher. */
  siblings?: readonly LevelSibling[];
  /**
   * Where a sibling goes, for a client caller that wants its router's link.
   *
   * Prefer `href` on each sibling: this is a function, so a server component
   * cannot pass it. Where both are given this wins.
   */
  hrefFor?: (sibling: LevelSibling) => string;
}

export function LevelMap({
  levels,
  slots,
  ariaLabel = "Location",
  className,
}: {
  /**
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl, and a design-system component has no locale of its own.
   * The caller has one and this does not.
   */
  ariaLabel?: string;
  levels: readonly Level[];
  /**
   * How many segments to draw, including empty ones.
   *
   * Defaults to what was passed. Set it to the depth of the deepest thing on
   * the screen so the trail keeps its shape as somebody moves through it.
   */
  slots?: number;
  className?: string;
}) {
  const drawn = Math.max(slots ?? levels.length, levels.length);

  return (
    <nav aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {Array.from({ length: drawn }, (_, index) => {
        const level = levels[index];
        return (
          <div key={index} className="flex items-center gap-0.5">
            {index === 0 ? null : (
              <span aria-hidden="true" className="px-0.5 text-fg-disabled">
                /
              </span>
            )}
            {level === undefined ? (
              <EmptySlot kind="" />
            ) : level.label === undefined ? (
              <EmptySlot kind={level.kind} />
            ) : (
              <Segment level={level} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * A slot with nothing in it yet.
 *
 * Deliberately not a button. There is nothing to switch between until something
 * above it is chosen, and a control that opens an empty list is worse than no
 * control: it invites a click and then explains nothing.
 */
function EmptySlot({ kind }: { kind: string }) {
  return (
    <span className="px-1.5 py-1 text-2xs text-fg-tertiary">
      {kind === "" ? "..." : `no ${kind}`}
    </span>
  );
}

function Segment({ level }: { level: Level }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const siblings = level.siblings ?? [];
  const hrefOf = (sibling: LevelSibling) => level.hrefFor?.(sibling) ?? sibling.href;
  // One sibling is not a choice, and drawing a switcher that opens a list of
  // the thing you are already on is a control that does nothing. Neither is a
  // list whose rows go nowhere, so every sibling has to resolve to a link.
  const switchable = siblings.length > 1 && siblings.every((s) => hrefOf(s) !== undefined);

  const items: MenuItem[] = siblings.map((sibling) => ({
    key: sibling.id,
    href: hrefOf(sibling),
    label: (
      <span className="flex min-w-0 items-start gap-2">
        {sibling.status === undefined ? null : (
          <span className="mt-1 flex shrink-0">
            <StatusDot status={sibling.status} size="sm" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{sibling.label}</span>
          {sibling.hint === undefined ? null : (
            <span className="block truncate text-2xs text-fg-tertiary">{sibling.hint}</span>
          )}
        </span>
      </span>
    ),
  }));

  const body = (
    <>
      {level.icon === undefined ? null : (
        <span className="flex shrink-0 text-fg-tertiary">{level.icon}</span>
      )}
      <span
        className={cn(
          "min-w-0 truncate text-2xs font-medium text-fg-secondary",
          level.mono === true && "numeric",
        )}
      >
        {level.label}
      </span>
      {level.count === undefined ? null : (
        <span className="numeric shrink-0 text-3xs text-fg-tertiary">{level.count}</span>
      )}
    </>
  );

  if (!switchable) {
    return <span className="flex items-center gap-1.5 px-1.5 py-1">{body}</span>;
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-(--radius-sm) px-1.5 py-1",
          "transition-colors duration-(--duration-instant) hover:bg-hover",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--gc-ring)",
        )}
      >
        {body}
        <span aria-hidden="true" className="flex shrink-0 text-fg-disabled">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <Menu
        anchor={anchor}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        label={`Other ${level.kind}s`}
        items={items}
        className="max-h-72 w-64 overflow-y-auto"
      />
    </>
  );
}
