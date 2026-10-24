import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * "3 of 9" and the two records beside this one, for somebody who came from a
 * list and is working down it.
 *
 * It sits in the row above a record's head, at the right, where the apps
 * picker and the account popup sit on every other screen. Going back to the
 * list to open the next request is the round trip it saves, so it appears only
 * when the reader arrived from a list: a record opened from a link has no
 * "next" anybody could name.
 *
 * **The position is text, the neighbours are links.** The figure is in mono
 * because it is compared, and it is not a live region: it changes on a new
 * page, which the page title already announces. A neighbour that does not
 * exist (the first record has no previous one) stays in place as a disabled
 * pill, so the other one does not move under the pointer.
 *
 * This package knows no router: `render` draws each link, as `NavItem`'s does.
 */
export interface RecordPagerLabels {
  /** The landmark's name: "Requests". */
  nav: string;
  /** "3 of 9". */
  position: (position: number, total: number) => string;
  previous: string;
  next: string;
}

export interface RecordPagerProps {
  /** One-based. */
  position: number;
  total: number;
  /** Where the record before this one is, or null at the start. */
  previous: string | null;
  /** Where the record after this one is, or null at the end. */
  next: string | null;
  labels: RecordPagerLabels;
  render: (props: {
    href: string;
    className: string;
    children: ReactNode;
    "aria-label": string;
  }) => ReactNode;
  className?: string;
}

const PILL =
  "grid size-7 place-items-center rounded-full border border-m-control text-m-ink-2 aurora:border-a-edge aurora:bg-m-hover";
const LIVE =
  "hover:border-m-strong hover:text-m-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";
const DEAD = "cursor-default opacity-40";

function Chevron({ back }: { back: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
      <path
        d={back ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function RecordPager({
  position,
  total,
  previous,
  next,
  labels,
  render,
  className,
}: RecordPagerProps) {
  return (
    <nav aria-label={labels.nav} className={cn("flex items-center gap-2", className)}>
      <span className="font-mono text-[12.5px] tabular-nums text-m-ink-3">
        {labels.position(position, total)}
      </span>
      {previous === null ? (
        <span
          aria-disabled="true"
          aria-label={labels.previous}
          role="link"
          className={cn(PILL, DEAD)}
        >
          <Chevron back />
        </span>
      ) : (
        render({
          href: previous,
          "aria-label": labels.previous,
          className: cn(PILL, LIVE),
          children: <Chevron back />,
        })
      )}
      {next === null ? (
        <span aria-disabled="true" aria-label={labels.next} role="link" className={cn(PILL, DEAD)}>
          <Chevron back={false} />
        </span>
      ) : (
        render({
          href: next,
          "aria-label": labels.next,
          className: cn(PILL, LIVE),
          children: <Chevron back={false} />,
        })
      )}
    </nav>
  );
}
