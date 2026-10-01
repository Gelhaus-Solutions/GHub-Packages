"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn.js";
import { isFinished, remainingSeconds } from "./countdown-clock.js";
import { formatDuration } from "./metric.js";

/**
 * A wait, ticking, stated as a duration.
 *
 * The resend cooldown on a one-time code screen, the wait on a locked-out
 * screen, and the overlap window while a secret is being rotated. Three places
 * that each had their own timer and each got a different one wrong.
 *
 * **It must reach zero without a reload**, because the screen it is on is one
 * somebody is sitting in front of waiting for exactly that, and a control that
 * needs a refresh to come back is a control that looks broken. `onZero` is how
 * the button beside it re-enables.
 *
 * **It announces once, not every second.** A live region on a ticking number
 * reads the whole thing out sixty times a minute, which is worse than useless:
 * it talks over everything else on the page for the entire wait. So the digits
 * are hidden from assistive technology and one message is announced at the
 * moment that matters, which is when the wait is over. What the wait *is* gets
 * said by the sentence around this, which every screen using it already has:
 * "sign-in is paused for this address for fifteen minutes".
 *
 * `formatDuration` was already here and the ticking part was not, which is the
 * whole of what this adds. `countdown-clock.ts` holds the reason it reads a
 * deadline rather than counting down.
 */

export interface CountdownProps {
  /** How long is left when this mounts. Restarting means passing a new number. */
  seconds: number;
  /** Called once, when the wait is over. This is how the control beside it comes back. */
  onZero?: () => void;
  /**
   * The one thing announced, at zero.
   *
   * Says what is now possible rather than that a timer finished, because a timer
   * finishing is not news to anybody.
   */
  doneLabel?: string;
  className?: string;
}

export function Countdown({ seconds, onZero, doneLabel, className }: CountdownProps) {
  // The deadline, not the count. `countdown-clock.ts` says why.
  const [deadline, setDeadline] = useState(() => Date.now() + seconds * 1000);
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(seconds)));
  /**
   * Starts true when there was never a wait, so the live region mounts holding
   * its message rather than changing into it. A region that is already full
   * when it appears announces nothing, which is right: a countdown of zero has
   * no news in it.
   */
  const [done, setDone] = useState(() => seconds <= 0);

  useEffect(() => {
    setDeadline(Date.now() + seconds * 1000);
    setLeft(Math.max(0, Math.ceil(seconds)));
    setDone(seconds <= 0);
  }, [seconds]);

  useEffect(() => {
    if (isFinished(deadline, Date.now())) {
      setLeft(0);
      return;
    }
    /**
     * Every 250ms rather than every second, with the wall clock read each time.
     * A one second interval is the version that visibly skips a number when the
     * machine is busy; the extra reads cost nothing and the displayed value only
     * changes when the second does.
     */
    const timer = setInterval(() => {
      setLeft(remainingSeconds(deadline, Date.now()));
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [deadline]);

  useEffect(() => {
    if (left > 0 || done) return;
    setDone(true);
    onZero?.();
  }, [done, left, onZero]);

  return (
    <span className={cn("inline-flex items-center font-mono tabular-nums", className)}>
      {/* Hidden from assistive technology on purpose: see the note above. */}
      <span aria-hidden="true">{formatDuration(left)}</span>
      <span role="status" className="sr-only">
        {done ? (doneLabel ?? "The wait is over.") : ""}
      </span>
    </span>
  );
}
