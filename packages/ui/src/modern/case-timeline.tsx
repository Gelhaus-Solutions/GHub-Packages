"use client";

import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { SegmentedControl } from "../segmented-control.js";
import { Status, type StatusLevel } from "./status.js";

/**
 * What an entry is. It decides the dot, which is decoration: the sentence (or
 * the chip at the right) says the kind in words.
 */
export type TimelineKind = "step" | "mail" | "link" | "file" | "note" | "clock" | "alert" | "done";

/** Which entries are shown: all of them, or one family. */
export type TimelineShow = "all" | "steps" | "mail" | "files";
export type TimelineOrder = "newest" | "oldest";

export interface TimelineEntry {
  key: string;
  /** The instant, as an ISO string, for ordering and for `<time>`. */
  at: string;
  /** The instant as the reader sees it, with its zone: "5 Oct, 09:30 CEST". */
  atText: string;
  kind: TimelineKind;
  /** What happened, as a sentence. */
  what: ReactNode;
  detail?: ReactNode;
  /** Who did it, or what recorded it: "The clock, recorded by itself". */
  who?: ReactNode;
  /** The files it carries, as the caller's links (a name and its hash). */
  files?: readonly ReactNode[];
  /** A state word at the right: a mail's delivery, an export's result. */
  status?: { level: StatusLevel; word: string };
  /** The category chip at the right when there is no status ("Clock", "Mail"). */
  category?: string;
}

export interface CaseTimelineProps {
  entries: readonly TimelineEntry[];
  order: TimelineOrder;
  onOrderChange: (order: TimelineOrder) => void;
  show: TimelineShow;
  onShowChange: (show: TimelineShow) => void;
  /** Names the list. */
  label?: string;
  /** The words, for a page in another language. */
  words?: Partial<{
    order: string;
    newest: string;
    oldest: string;
    show: string;
    all: string;
    steps: string;
    mail: string;
    files: string;
    empty: string;
  }>;
  className?: string;
}

const WORDS = {
  order: "Order",
  newest: "Newest first",
  oldest: "Oldest first",
  show: "Show",
  all: "Everything",
  steps: "Steps",
  mail: "Mail",
  files: "Files",
  empty: "Nothing of this kind yet.",
};

/*
 * The families the chips filter by. A link is mail's sibling (it went out in
 * one), and every recorded step, clock event and alert is a step.
 */
const FAMILY: Readonly<Record<TimelineKind, Exclude<TimelineShow, "all">>> = {
  step: "steps",
  done: "steps",
  alert: "steps",
  clock: "steps",
  note: "steps",
  mail: "mail",
  link: "mail",
  file: "files",
};

const DOT: Readonly<Record<TimelineKind, string>> = {
  step: "bg-m-accent shadow-[0_0_8px_var(--gm-accent)]",
  mail: "bg-m-info",
  file: "border-[1.5px] border-m-ink-3",
  link: "border-[1.5px] border-m-info",
  note: "bg-m-idle",
  clock: "bg-m-warn",
  alert: "bg-m-crit shadow-[0_0_8px_var(--gm-crit)]",
  done: "bg-m-ok shadow-[0_0_8px_var(--gm-ok)]",
};

const CHIP =
  "inline-flex h-[30px] items-center rounded-full border px-3 text-[13px] leading-none whitespace-nowrap max-sm:h-11";

/**
 * The ordered, filterable record of a case (K7): every step, mail, link, file
 * and clock event, newest or oldest first, by family. Each entry is recorded
 * once and never edited, so nothing in a row is an input; files are the
 * caller's links.
 *
 * An ordered list, the time read first. Order and family are the caller's
 * state, because they belong in the address (`?order=`, `?show=`): the
 * component sorts and filters what it is given and reports the choice. On a
 * phone the time moves above the sentence and the chip column goes.
 */
export function CaseTimeline({
  entries,
  order,
  onOrderChange,
  show,
  onShowChange,
  label = "Timeline",
  words,
  className,
}: CaseTimelineProps) {
  const say = { ...WORDS, ...words };
  const shown = entries
    .filter((entry) => show === "all" || FAMILY[entry.kind] === show)
    .sort((a, b) => (order === "newest" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 pb-3">
        <SegmentedControl
          label={say.order}
          value={order}
          onChange={onOrderChange}
          options={[
            { key: "newest", label: say.newest },
            { key: "oldest", label: say.oldest },
          ]}
        />
        <div role="group" aria-label={say.show} className="flex flex-wrap gap-1.5">
          {(["all", "steps", "mail", "files"] as const).map((one) => (
            <button
              key={one}
              type="button"
              aria-pressed={show === one}
              onClick={() => onShowChange(one)}
              className={cn(
                CHIP,
                show === one
                  ? "border-m-accent/55 bg-m-accent-wash font-medium text-m-ink"
                  : "border-dashed border-m-ink/22 text-m-ink-2 hover:border-solid hover:text-m-ink",
              )}
            >
              {say[one]}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-m-hairline py-3.5 text-m-body text-m-ink-3 aurora:in-data-m-body:-mx-[18px] aurora:in-data-m-body:px-[18px]">
          {say.empty}
        </p>
      ) : (
        <ol aria-label={label} data-m-flush="" className="aurora:in-data-m-body:-mx-[18px]">
          {shown.map((entry) => (
            <li
              key={entry.key}
              className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-3 border-t border-m-hairline px-4 py-[11px] sm:grid-cols-[136px_10px_minmax(0,1fr)_auto]"
            >
              <time
                dateTime={entry.at}
                className="hidden font-mono text-[12px] leading-[19px] whitespace-nowrap text-m-ink-2 tabular-nums sm:block"
              >
                {entry.atText}
              </time>
              <span
                aria-hidden="true"
                className={cn("mt-[5px] size-[9px] rounded-full", DOT[entry.kind])}
              />
              <div className="min-w-0">
                <time
                  dateTime={entry.at}
                  className="block font-mono text-[11.5px] leading-4 text-m-ink-3 tabular-nums sm:hidden"
                >
                  {entry.atText}
                </time>
                <p className="text-[14px] leading-5 text-m-ink">{entry.what}</p>
                {entry.detail === undefined ? null : (
                  <p className="mt-0.5 text-[13px] leading-[19px] text-m-ink-2">{entry.detail}</p>
                )}
                {entry.files === undefined || entry.files.length === 0 ? null : (
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {entry.files.map((file, index) => (
                      <span
                        key={index}
                        className="inline-flex h-6 items-center rounded-full border border-m-hairline px-2.5 font-mono text-[11.5px] text-m-ink-2"
                      >
                        {file}
                      </span>
                    ))}
                  </p>
                )}
                {entry.who === undefined ? null : (
                  <p className="mt-0.5 text-[12.5px] leading-[18px] text-m-ink-3">{entry.who}</p>
                )}
              </div>
              {entry.status === undefined && entry.category === undefined ? null : (
                <span className="hidden justify-end sm:flex">
                  {entry.status === undefined ? (
                    <span className="inline-flex h-[22px] items-center rounded-full border border-m-hairline px-[9px] text-[11.5px] leading-none whitespace-nowrap text-m-ink-2">
                      {entry.category}
                    </span>
                  ) : (
                    <Status level={entry.status.level} chip>
                      {entry.status.word}
                    </Status>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
