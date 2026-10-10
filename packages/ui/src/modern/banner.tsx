import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** Which status ramp the banner draws from. `locked` is not in modern. */
export type BannerTone = "info" | "ok" | "warn" | "crit";

const TONE: Readonly<Record<BannerTone, string>> = {
  info: "bg-m-info-wash border-m-info/34",
  ok: "bg-m-ok-wash border-m-ok/34",
  warn: "bg-m-warn-wash border-m-warn/34",
  crit: "bg-m-crit-wash border-m-crit/34",
};

/*
 * Aurora: glass with the level's light falling across it from the top left
 * (14 per cent, gone by 60), an edge in the level at 38, and a dot that glows.
 */
const AURORA_TONE: Readonly<Record<BannerTone, string>> = {
  info: "aurora:border-m-info/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-info)_14%,transparent),transparent_60%)]",
  ok: "aurora:border-m-ok/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-ok)_14%,transparent),transparent_60%)]",
  warn: "aurora:border-m-warn/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-warn)_14%,transparent),transparent_60%)]",
  crit: "aurora:border-m-crit/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-crit)_14%,transparent),transparent_60%)]",
};

const AURORA_DOT: Readonly<Record<BannerTone, string>> = {
  info: "bg-m-info shadow-[0_0_10px_var(--gm-info)]",
  ok: "bg-m-ok shadow-[0_0_10px_var(--gm-ok)]",
  warn: "bg-m-warn shadow-[0_0_10px_var(--gm-warn)]",
  crit: "bg-m-crit shadow-[0_0_10px_var(--gm-crit)]",
};

/**
 * A screen level notice, and the one wash a screen is allowed.
 *
 * **One per screen, and only for a state the screen did not cause.** A card
 * payment that failed on Tuesday, a member of staff who is in the account until
 * half past three. Never the result of the press just made: that belongs to the
 * `Disclosure` that opened under the button, or to the row that changed. A
 * banner answering a press puts the answer at the top of the screen, away from
 * the thing that was pressed, and the reader has to go and find it.
 *
 * **Not dismissable, deliberately.** There is no close button, because the
 * condition is what removes it. A dismissable banner lets somebody clear a card
 * failure from their screen without clearing it from their account, and the
 * next thing they see is the product switching off.
 */
export interface BannerProps {
  title: ReactNode;
  /**
   * One sentence saying what follows from the condition and what settles it.
   *
   * Never set in quiet ink: `ink-3` is the floor against a surface and does not
   * clear it against a wash, where it measures 4.04 on warn. The wash moves the
   * floor, so the text on it steps up.
   */
  children: ReactNode;
  tone?: BannerTone;
  /**
   * Set when the banner appears in response to something rather than being
   * present at load.
   *
   * It is the difference between `status` and `alert`, and `alert` interrupts.
   * A banner that is simply part of the screen must not interrupt: announcing
   * it politely lets a reader finish the sentence they were on. One that
   * arrives afterwards is news, and news that a screen reader reaches at its
   * own pace is news that arrives after the decision it was meant to inform.
   */
  afterLoad?: boolean;
  className?: string;
}

export function Banner({
  title,
  children,
  tone = "info",
  afterLoad = false,
  className,
}: BannerProps) {
  return (
    <div
      role={afterLoad ? "alert" : "status"}
      className={cn(
        "w-full rounded-m-panel border p-4",
        TONE[tone],
        "aurora:flex aurora:items-start aurora:gap-3.5 aurora:a-glass aurora:rounded-a-banner aurora:px-[18px] aurora:py-3.5 aurora:shadow-a-highlight",
        AURORA_TONE[tone],
        className,
      )}
    >
      {/* Decoration: the word in the title carries the level. */}
      <span
        aria-hidden="true"
        className={cn("mt-1.5 hidden size-2 shrink-0 rounded-full aurora:block", AURORA_DOT[tone])}
      />
      <div className="min-w-0 aurora:flex-1">
        <p className="text-m-label text-m-ink aurora:text-[14.5px] aurora:leading-[21px]">
          {title}
        </p>
        <p className="mt-1 text-m-meta text-m-ink-2 aurora:mt-0.5 aurora:text-[13.5px] aurora:leading-5">
          {children}
        </p>
      </div>
    </div>
  );
}
