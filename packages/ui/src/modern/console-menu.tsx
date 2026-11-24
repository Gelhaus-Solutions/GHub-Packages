"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn.js";

/**
 * The open and close of the shell's two lists: a group of pages under its tab and, on a narrow
 * screen, the workspaces. Both are disclosures of links (the APG's disclosure navigation, not
 * `role="menu"`): the button says whether its list is open, Tab walks the links, and the list
 * closes on Escape (focus back on the button), on a click outside, when focus leaves it and when
 * one of its links is followed. The links are rendered by the shell on the server and arrive as
 * children, so routing stays the caller's.
 */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const target =
        panel.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
        panel.current?.querySelector<HTMLElement>("a[href]");
      target?.focus();
    }
    wasOpen.current = open;
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const rootProps = {
    ref: root,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    },
    onBlur: (event: FocusEvent) => {
      if (open && !root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
    },
  };
  const panelProps = {
    ref: panel,
    hidden: !open,
    onClick: (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a[href]") !== null) setOpen(false);
    },
  };
  return { open, setOpen, button, rootProps, panelProps };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", open ? "rotate-180" : "")}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The scrim under a list shown as a sheet; it only closes the list, so it is hidden from readers. */
function Scrim({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("fixed inset-0 z-40 bg-black/55", className)} />;
}

export interface ConsoleGroupTabProps {
  /** The group's name, the tab's text ("Rules"). */
  label: string;
  /** The label of the group's page you are on, beside the name ("Guest rules"). */
  current?: string;
  /** Words for a warn dot on the tab: something waits on one of its pages. */
  flag?: string;
  /** The list of the group's pages, as the shell renders it. */
  children: ReactNode;
}

/**
 * A page tab that holds several pages (D242 in GFabric): a click opens their list under it, a
 * sheet from the bottom on a phone. The group you are in reads "Rules › Guest rules" and is marked
 * as the current tab is; on a phone only the group's name shows, the page's stays for a reader.
 */
export function ConsoleGroupTab({ label, current, flag, children }: ConsoleGroupTabProps) {
  const id = useId();
  const { open, setOpen, button, rootProps, panelProps } = useDisclosure();
  return (
    <div {...rootProps} className="relative flex">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
        className={cn(
          "inline-flex h-12 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] max-sm:h-11",
          current === undefined
            ? "text-m-ink-2 hover:text-m-ink"
            : "text-m-accent-text shadow-[inset_0_-2px_0_var(--gm-accent-text)]",
        )}
      >
        {label}
        {current === undefined ? null : (
          <>
            <span aria-hidden="true" className="text-m-ink-3 max-sm:hidden">
              ›
            </span>
            <span className="text-m-ink max-sm:sr-only">
              <span className="sr-only">, </span>
              {current}
            </span>
          </>
        )}
        {flag === undefined ? null : (
          <>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-m-warn" />
            <span className="sr-only">, {flag}</span>
          </>
        )}
        <Chevron open={open} />
      </button>
      {open ? <Scrim className="hidden max-sm:block" /> : null}
      <div
        {...panelProps}
        id={id}
        className={cn(
          "absolute top-full left-0 z-50 mt-1 min-w-60 rounded-[8px] border border-m-subtle bg-m-plate p-1.5 shadow-m-plate",
          "max-sm:fixed max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mt-0 max-sm:rounded-none max-sm:rounded-t-[14px] max-sm:p-2.5",
        )}
      >
        <p className="hidden px-2.5 pb-1.5 text-[15px] font-semibold text-m-ink max-sm:block">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

export interface ConsoleWorkspacesButtonProps {
  /** Read before the workspace's name: "Workspaces". */
  label: string;
  /** The workspace you are in, the button's face. */
  workspace: { label: string; icon: ReactNode };
  /** Every workspace, as the shell renders the rail's links. */
  children: ReactNode;
}

/**
 * Below 768px the rail would become a row above the page, which is what pushed a page's title
 * 286px down in GFabric; instead the workspace's blue tab becomes this button, and the
 * workspaces open as a sheet from the bottom.
 */
export function ConsoleWorkspacesButton({
  label,
  workspace,
  children,
}: ConsoleWorkspacesButtonProps) {
  const id = useId();
  const { open, setOpen, button, rootProps, panelProps } = useDisclosure();
  return (
    <div {...rootProps} className="flex md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[8px] bg-m-selected px-2.5 text-[14px] font-medium text-m-accent-text [&_svg]:size-[18px]"
      >
        <span className="sr-only">{label}, </span>
        <span aria-hidden="true" className="inline-flex">
          {workspace.icon}
        </span>
        {workspace.label}
        <Chevron open={open} />
      </button>
      {open ? <Scrim className="" /> : null}
      <div
        {...panelProps}
        id={id}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[14px] border-t border-m-subtle bg-m-plate p-2.5"
      >
        <p className="px-2.5 pb-1.5 text-[15px] font-semibold text-m-ink">{label}</p>
        {children}
      </div>
    </div>
  );
}
