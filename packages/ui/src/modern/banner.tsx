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
      className={cn("w-full rounded-m-panel border p-4", TONE[tone], className)}
    >
      <p className="text-m-control text-m-ink">{title}</p>
      <p className="mt-1 text-m-meta text-m-ink-2">{children}</p>
    </div>
  );
}
