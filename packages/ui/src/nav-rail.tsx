import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * The navigation rail, shared because both consoles had already built it.
 *
 * GControl hand-wrote this shape, down to the two-by-fifteen accent bar on the
 * active item, and GPlatform Control was about to hand-write it again for its
 * staff surface. That is the case for it being here rather than in either app:
 * a second copy of a shared component is how two products start disagreeing
 * about what "you are here" looks like, and this one carries a rule that has to
 * hold in both, which is that the rail is the only chrome on screen at every
 * scroll position on every screen.
 *
 * **Why the item does not render its own link.** This package must not know
 * about a router, and a plain `<a href>` in a Next app is a full page load.
 * Rather than a polymorphic `as` prop that has to be typed twice and is wrong
 * once, `NavItem` takes a `render` that receives the classes and the contents
 * and returns whatever the app's framework calls a link. Same precedent as
 * `buttonClasses` and `rowLinkClasses`: this package owns the markup and the
 * classes, the app owns the navigation.
 */
export function NavRail({
  width = 240,
  brand,
  footer,
  children,
  className,
}: {
  /**
   * 240 or 252 labelled, or 56 icon-only where the window is too narrow for
   * words.
   *
   * The two labelled widths are the two the sheets draw. GControl's console
   * rail is 240; GPlatform SSO's account shell and its enterprise door are both
   * 252, one scope up, and a rail twelve pixels narrower than its own design is
   * the kind of difference nobody can name and everybody can see. Kept as a
   * union rather than opened to any number, because the docblock's discipline is
   * the point: labelled or icon-only, and not a dial.
   */
  width?: 240 | 252 | 56;
  /** The wordmark, and anything that belongs with it. */
  brand?: ReactNode;
  /** The signed-in account, and whatever else belongs at the foot. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      style={{ width: `${String(width)}px` }}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-(--gc-border-hairline) bg-base",
        className,
      )}
    >
      {brand}
      {/*
       * `min-h-0` is what makes the overflow real. A flex child's default
       * minimum is its content, so a rail with more links than fit pushes the
       * footer off the bottom instead of scrolling, and it will do it again the
       * next time somebody adds a screen.
       */}
      <nav
        className={cn("min-h-0 flex-1 overflow-y-auto pb-3 pt-2", width === 56 ? "px-2" : "px-3")}
      >
        {children}
      </nav>
      {footer}
    </aside>
  );
}

/**
 * A named group of items, and optionally a guarded one.
 *
 * The groups are the argument for the whole shape. Twelve links in a flat list
 * is twelve things to read every time, and the order stops meaning anything
 * past about six.
 *
 * `guarded` is for the group holding the acts nobody does casually: lockdown,
 * seal, key rotation, emergency. It is drawn as an inset box with its own
 * hairline and a one-line reason, because a heading that reads like the others
 * says these are the same kind of thing as Dashboard and Apps, and they are
 * not. It is a visual boundary and nothing more: it does not gate, and pretending
 * otherwise in the chrome would be the wrong place to put a permission.
 */
export function NavGroup({
  eyebrow,
  eyebrowStyle = "caps",
  guarded = false,
  note,
  collapsed = false,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  /**
   * How the group heading is set.
   *
   * `caps` is GControl's convention and stays the default: uppercase, 10px,
   * tracked, which reads as an instrument label above a list of instruments.
   * `plain` is sentence case at 12.5px in tertiary ink, which is what GPlatform
   * SSO's account sheet draws, and the difference is the whole temperament of
   * the two surfaces. A control room labels its controls; somebody's own
   * account does not shout at them.
   *
   * A prop rather than two components, because everything else about the group
   * is identical and a second copy is how the two consoles start disagreeing
   * about what a rail is.
   */
  eyebrowStyle?: "caps" | "plain";
  /** Set for the group whose items change what a deployment is doing. */
  guarded?: boolean;
  /** One line saying why the group is set apart. Only read where guarded. */
  note?: ReactNode;
  /** In a 56px rail, where a heading has nowhere to go and a rule says it. */
  collapsed?: boolean;
  /**
   * For the rhythm between groups, which the two sheets set differently.
   *
   * Same precedent as `NavRail`'s: this package owns the shape and a product
   * says how much air it wants around it. GControl's groups sit 12px apart and
   * the account sheet draws 22px, and neither is more correct than the other.
   */
  className?: string;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <div
        className={cn(
          "mt-2 border-t border-(--gc-border-hairline) pt-2 first:mt-0 first:border-t-0 first:pt-0",
          className,
        )}
      >
        <div className="flex flex-col gap-px">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 first:mt-0",
        guarded && "rounded-md border border-(--gc-border-hairline) bg-inset px-1.5 pb-1.5 pt-1.5",
        className,
      )}
    >
      {eyebrow === undefined ? null : eyebrowStyle === "plain" ? (
        <div className="px-2.5 pb-2 text-[12.5px] leading-[18px] text-fg-tertiary">{eyebrow}</div>
      ) : (
        // Secondary rather than tertiary. A group heading is read to find a
        // screen, so it is being read rather than glanced at.
        <div className="label-caps px-2.5 pb-[5px] leading-[14px] text-fg-secondary">{eyebrow}</div>
      )}
      <div className="flex flex-col gap-px">{children}</div>
      {note === undefined ? null : (
        <p className="px-2.5 pb-0.5 pt-2 text-3xs leading-[14px] text-fg-tertiary">{note}</p>
      )}
    </div>
  );
}

/**
 * A count beside an item.
 *
 * `countStatus` is the whole reason this is not just a number. A count takes a
 * status only when it is a state rather than a total: seven apps is seven apps,
 * and two of them wanting a decision is a different kind of fact. Colouring a
 * total would spend the status ramp on arithmetic.
 */
const countInk: Record<Status, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  crit: "text-crit-ink",
  info: "text-info-ink",
  locked: "text-locked-ink",
  idle: "text-fg-tertiary",
};

export interface NavItemProps {
  label: ReactNode;
  /** A 16px lucide icon at stroke-width 1.75, or nothing in a rail with none. */
  icon?: ReactNode;
  active?: boolean;
  count?: number;
  /** Set only where the number is a state somebody has to answer. */
  countStatus?: Status;
  /**
   * Something other than a number in the trailing slot.
   *
   * For the item whose value is a state rather than a total. GPlatform SSO's
   * support access is the case that asked for it: the rail says "Open" while
   * somebody is signed in as the reader and "Granted" while nobody is, and the
   * item shows nothing at all when there is no consent. A count cannot say any
   * of that, and an item reading "0" tells somebody a number they did not ask
   * for.
   *
   * Deliberately a slot rather than a string plus a status, because what goes
   * in it is a dot beside a word and both consoles would otherwise reinvent the
   * dot. It replaces the count where both are set: two things in one slot is a
   * caller's mistake rather than a layout to define.
   */
  trailing?: ReactNode;
  /** In a 56px rail the label becomes the accessible name and the title. */
  collapsed?: boolean;
  /**
   * Renders the link. Receives the classes and the contents, returns whatever
   * the app's framework calls an anchor.
   */
  render: (props: {
    className: string;
    children: ReactNode;
    "aria-current": "page" | undefined;
    title?: string;
  }) => ReactNode;
}

export function NavItem({
  label,
  icon,
  active = false,
  count,
  countStatus,
  trailing,
  collapsed = false,
  render,
}: NavItemProps) {
  const className = cn(
    "group relative flex h-[30px] items-center rounded-(--radius-md) text-sm",
    "transition-colors duration-(--duration-instant)",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
    collapsed ? "w-full justify-center px-0" : "gap-2.5 px-2.5",
    active ? "bg-selected text-fg" : "text-fg-secondary hover:bg-hover hover:text-fg",
  );

  return render({
    className,
    "aria-current": active ? "page" : undefined,
    title: collapsed && typeof label === "string" ? label : undefined,
    children: (
      <>
        {/* A left rule rather than a filled pill: it reads as an instrument
            marker and survives a long label without shifting anything beside
            it. */}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-[15px] w-0.5 -translate-y-1/2 rounded-full bg-accent"
          />
        ) : null}
        {icon === undefined ? null : (
          <span
            className={cn(
              "flex shrink-0",
              active ? "text-fg-accent" : "text-fg-tertiary group-hover:text-fg-secondary",
            )}
          >
            {icon}
          </span>
        )}
        {collapsed ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
        {collapsed ? null : trailing !== undefined ? (
          // A slot rather than a number, and it wins where a caller set both.
          // Nothing here decides what goes in it beyond where it sits.
          <span className="ml-auto flex shrink-0 items-center">{trailing}</span>
        ) : count === undefined ? null : (
          <span
            className={cn(
              "numeric ml-auto text-3xs",
              countStatus === undefined ? "text-fg-tertiary" : countInk[countStatus],
            )}
          >
            {count}
          </span>
        )}
      </>
    ),
  });
}
