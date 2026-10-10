"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn.js";
import { focusablesIn } from "./focus.js";
import { AURORA_MENU } from "./modern/aurora.js";

/**
 * An anchored overlay, hand-rolled, with the keyboard contract written down.
 *
 * `Dialog` covers the modal case and nothing else does. Everything anchored in
 * either console today is an absolutely positioned div with no focus
 * management: it opens, it does not take focus, Escape does nothing, and Tab
 * walks straight past it into the page behind. That is not a styling gap, it is
 * a control a keyboard cannot use.
 *
 * What this implements, because none of it is inherited from anywhere:
 *
 *   Focus moves into the panel on open and returns to the anchor on close, so
 *   the keyboard lands back on the control that opened it rather than at the
 *   top of the document. Tab is trapped inside while it is open.
 *
 *   Escape closes. So does a pointer press that starts outside the panel and
 *   outside the anchor: starting outside matters, because a drag that begins on
 *   a label inside the panel and releases outside it is a text selection.
 *
 *   Scrolling or resizing repositions it rather than leaving it behind, and it
 *   is clamped into the viewport so a menu opened near the right edge is not
 *   half off screen.
 *
 * Positioned `fixed` through a portal rather than absolutely inside the caller,
 * so no ancestor's `overflow` or stacking context can clip it. A menu opened
 * from a row inside a scrolling table is exactly the case that breaks
 * otherwise, and that is where most of these are opened from.
 *
 * No Radix, no headless library, per this package's own rule: accessibility is
 * implemented here rather than inherited.
 */
export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export interface PopoverProps {
  /** The control it hangs from. Focus returns here, and a press on it is not "outside". */
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  /** Names the overlay for a screen reader, since it is not a dialog. */
  label?: string;
  /** Matches the anchor's width, for a switcher that should not be narrower than it. */
  matchAnchorWidth?: boolean;
  className?: string;
  children: ReactNode;
}

/** Clear of the anchor without floating away from it. */
const OFFSET = 6;
/** Never closer to an edge than this, so a shadow is not cut in half. */
const MARGIN = 8;

export function Popover({
  anchor,
  open,
  onClose,
  placement = "bottom-start",
  label,
  matchAnchorWidth = false,
  className,
  children,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<{ top: number; left: number; minWidth?: number } | null>(null);

  const place = useCallback(() => {
    const trigger = anchor.current;
    const box = panel.current;
    if (trigger === null || box === null) return;

    const from = trigger.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    const below = placement.startsWith("bottom");
    const toEnd = placement.endsWith("end");

    let top = below ? from.bottom + OFFSET : from.top - size.height - OFFSET;
    let left = toEnd ? from.right - size.width : from.left;

    // Flip rather than clamp vertically: a menu clamped to the bottom edge
    // covers the control that opened it, which is the one thing on screen the
    // reader is using to keep their place.
    if (below && top + size.height > window.innerHeight - MARGIN) {
      const above = from.top - size.height - OFFSET;
      if (above >= MARGIN) top = above;
    } else if (!below && top < MARGIN) {
      const under = from.bottom + OFFSET;
      if (under + size.height <= window.innerHeight - MARGIN) top = under;
    }

    top = Math.min(
      Math.max(top, MARGIN),
      Math.max(window.innerHeight - size.height - MARGIN, MARGIN),
    );
    left = Math.min(
      Math.max(left, MARGIN),
      Math.max(window.innerWidth - size.width - MARGIN, MARGIN),
    );

    setStyle({ top, left, ...(matchAnchorWidth ? { minWidth: from.width } : {}) });
  }, [anchor, placement, matchAnchorWidth]);

  // Before paint, so the panel is never seen at 0,0 on its way to where it goes.
  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const trigger = anchor.current;

    // Onto the first thing inside, not onto the panel.
    //
    // Both halves of this were found by driving the overlay rather than by
    // reading it, and neither is visible in a screenshot. Focusing the panel
    // container looked correct and left the arrow keys dead: `Menu` listens for
    // them on the element holding the items, and a keydown on the container
    // above it never reaches a handler below it. And the panel is invisible
    // until it has been placed, which was `visibility: hidden` until this was
    // measured; a hidden element cannot take focus, so `focus()` on it did
    // nothing at all, silently, and the keyboard stayed on the button behind.
    const box = panel.current;
    const first = box === null ? undefined : focusablesIn(box)[0];
    (first ?? box)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;

      const focusable = focusablesIn(panel.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Press rather than click, and only when the press began outside. A drag
    // that starts on text inside the panel and releases on the page is a
    // selection, and closing on it loses whatever was being copied.
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (panel.current?.contains(target) === true) return;
      if (trigger?.contains(target) === true) return;
      onClose();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", place);
    // Capture, so a scroll in any ancestor repositions it rather than only a
    // scroll of the document. An overlay anchored to a row in a scrolling table
    // is the case that makes this matter.
    window.addEventListener("scroll", place, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      trigger?.focus?.();
    };
  }, [open, onClose, anchor, place]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panel}
      role="group"
      aria-label={label}
      tabIndex={-1}
      style={{
        top: style?.top ?? 0,
        left: style?.left ?? 0,
        minWidth: style?.minWidth,
      }}
      className={cn(
        "fixed z-50 rounded-(--radius-md) border border-(--gc-border-subtle) bg-overlay shadow-(--shadow-md)",
        "focus:outline-none",
        AURORA_MENU,
        // Invisible until placed, rather than rendered at the origin and seen
        // moving there. Opacity rather than `visibility: hidden`, and the
        // difference is not cosmetic: a hidden element cannot take focus, and
        // the effect above runs while this is still unplaced.
        style === null && "pointer-events-none opacity-0",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** One row of a menu: a command, a link, or a rule between them. */
export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      key: string;
      label: ReactNode;
      /** Runs and closes. Omit for an item that is a link instead. */
      onSelect?: () => void;
      /**
       * A plain anchor, for a link that does not need the app's router.
       *
       * This exists because `render` is a function, and a server component
       * cannot pass a function to a client component: a menu built in a server
       * component could not have links at all. `href` is data, so it can.
       * `render` still wins where it is given, which is how a client caller
       * supplies a router-aware link.
       */
      href?: string;
      /**
       * Rendered by the caller, so the package stays free of a router.
       *
       * **`role` and `onClick` are handed over rather than applied around the
       * result, and that is an accessibility requirement rather than a
       * convenience.** `role="menu"` demands that its children be `menuitem`,
       * `menuitemcheckbox`, `menuitemradio`, `group` or `separator`. Wrapping
       * the caller's element in a `role="none"` div satisfied none of those and
       * axe reported `aria-required-children` at critical in both themes, which
       * is the worst finding in this package to date.
       *
       * The other two branches of `MenuRow` put `role="menuitem"` on the `a` or
       * the `button` they render. This one could not, because the element
       * belongs to the caller, so the role goes to the caller instead. Spread
       * the whole object onto the element you return.
       */
      render?: (props: {
        className: string;
        children: ReactNode;
        role: "menuitem";
        onClick: () => void;
      }) => ReactNode;
      /** For an act that cannot be undone. Never for a heavy word. */
      danger?: boolean;
      disabled?: boolean;
      icon?: ReactNode;
    };

export interface MenuProps extends Omit<PopoverProps, "children"> {
  items: readonly MenuItem[];
}

/**
 * A menu, which is a popover with arrow keys and a role.
 *
 * Arrow keys move within it and Tab leaves, which is what a `menu` role
 * promises and what a list of buttons in a box does not. Home and End go to the
 * ends, because a menu long enough to need arrow keys is long enough that
 * holding one is worse than pressing another.
 */
export function Menu({ items, className, ...popover }: MenuProps) {
  const list = useRef<HTMLDivElement | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key) || list.current === null) return;

    const focusable = focusablesIn(list.current);
    if (focusable.length === 0) return;
    event.preventDefault();

    const at = focusable.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? focusable.length - 1
          : event.key === "ArrowDown"
            ? (at + 1 + focusable.length) % focusable.length
            : (at - 1 + focusable.length) % focusable.length;
    focusable[next]?.focus();
  };

  return (
    // Merged rather than replaced: passing `className` to a `Menu` and having
    // it silently dropped is the kind of prop that looks applied in a review.
    <Popover {...popover} className={cn("py-1 aurora:p-1.5", className)}>
      <div ref={list} role="menu" aria-label={popover.label} onKeyDown={onKeyDown}>
        {items.map((item, index) =>
          item.separator === true ? (
            <div
              key={`rule-${String(index)}`}
              role="separator"
              className="my-1 border-t border-(--gc-border-hairline) aurora:my-1.5 aurora:border-m-hairline"
            />
          ) : (
            <MenuRow key={item.key} item={item} onClose={popover.onClose} />
          ),
        )}
      </div>
    </Popover>
  );
}

function MenuRow({
  item,
  onClose,
}: {
  item: Extract<MenuItem, { separator?: false }>;
  onClose: () => void;
}) {
  const className = cn(
    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm",
    "transition-colors duration-(--duration-instant)",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gc-ring)",
    // Aurora: 36 high, a 10px corner, 13.5.
    "aurora:h-9 aurora:rounded-a-item aurora:px-3 aurora:py-0 aurora:text-[13.5px] aurora:focus-visible:outline-m-ring",
    item.disabled === true
      ? "cursor-not-allowed text-fg-disabled aurora:text-m-ink-off"
      : item.danger === true
        ? "text-crit-ink hover:bg-crit-wash aurora:text-m-crit-ink aurora:hover:bg-m-crit-wash"
        : "text-fg-secondary hover:bg-hover hover:text-fg aurora:text-m-ink-2 aurora:hover:bg-m-hover aurora:hover:text-m-ink",
  );

  const body = (
    <>
      {item.icon === undefined ? null : (
        <span className="flex shrink-0 text-fg-tertiary aurora:text-m-ink-3">{item.icon}</span>
      )}
      <span className="min-w-0 truncate">{item.label}</span>
    </>
  );

  if (item.render !== undefined) {
    /*
      A link. Closing on select rather than on navigation, because a route that
      renders slowly should not leave the menu hanging over the screen it is
      going to.

      Returned bare, with the role and the handler passed into the caller's
      element rather than wrapped around it. The wrapper this replaces was a
      `role="none"` div, which put a non-menuitem between `role="menu"` and its
      content: axe reported `aria-required-children` at critical, in both
      themes, and this branch was the only one of the three that did not put the
      role on the element a person actually operates.
    */
    return item.render({ className, children: body, role: "menuitem", onClick: onClose });
  }

  if (item.href !== undefined) {
    return (
      <a href={item.href} role="menuitem" className={className} onClick={onClose}>
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      className={className}
      onClick={() => {
        item.onSelect?.();
        onClose();
      }}
    >
      {body}
    </button>
  );
}
