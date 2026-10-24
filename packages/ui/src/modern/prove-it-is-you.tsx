"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";
import { Button } from "./button.js";

/**
 * Proving it is you, inside the act that asked, never on a page of its own.
 *
 * A sensitive act on a session that has been open a while asks the person to
 * prove themselves again before it happens. The block appears where the act's
 * button was, everything above it stays on screen and editable, and once it is
 * proved the act carries on: a route would need a return address and would
 * lose a half filled form on the way.
 *
 * **Presentational: the ceremony belongs to the app.** A passkey prompt, a
 * password check and their freshness rules are the identity service's, so this
 * draws the four states and the app passes the controls in: `passkey` first
 * (a primary button), `password` (the app's own fields and submit) with a way
 * between the two, `none` for a session that never had a password, and
 * `failed` laid over whichever was tried.
 *
 * Focus moves to it when it appears, because it is the next thing to do and
 * a screen reader would otherwise stay on a button that no longer acts.
 */
export type ProveWay = "passkey" | "password" | "none";

export interface ProveItIsYouProps {
  way: ProveWay;
  /** "Prove it is you". */
  title: ReactNode;
  /** One line under the title: what is about to happen and why it asks. */
  line: ReactNode;
  /** The passkey button, for `passkey`. */
  passkey?: { label: string; onPress: () => void; busy?: boolean };
  /** The app's password field and its submit, for `password`. */
  password?: ReactNode;
  /** The way to the other method: "Use the password instead". */
  switchTo?: { label: string; onPress: () => void };
  /** What `none` says: "This session never had a password, so sign in again to go on." */
  none?: ReactNode;
  /** Set after a try that did not prove it. */
  failed?: ReactNode;
  className?: string;
}

export function ProveItIsYou({
  way,
  title,
  line,
  passkey,
  password,
  switchTo,
  none,
  failed,
  className,
}: ProveItIsYouProps) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    root.current?.focus();
  }, []);

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="group"
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 rounded-m-panel border border-m-subtle bg-m-plate p-4 outline-none",
        AURORA_GLASS,
        "aurora:px-[18px] aurora:py-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-[30px] shrink-0 place-items-center rounded-full bg-m-accent-wash text-m-accent-text"
        >
          <svg viewBox="0 0 16 16" className="size-4">
            <rect
              x="3.5"
              y="7"
              width="9"
              height="6.5"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M5.5 7V5.25a2.5 2.5 0 015 0V7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={titleId} className="text-[14px] font-semibold leading-5 text-m-ink">
            {title}
          </p>
          <p className="text-[13px] leading-[19px] text-m-ink-2">{line}</p>
        </div>
      </div>
      {failed === undefined ? null : (
        <p role="alert" className="text-[12.5px] leading-[18px] text-m-crit-ink">
          {failed}
        </p>
      )}
      {way === "passkey" && passkey !== undefined ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size={36}
            busy={passkey.busy === true}
            onClick={passkey.onPress}
          >
            {passkey.label}
          </Button>
          {switchTo === undefined ? null : (
            <button
              type="button"
              onClick={switchTo.onPress}
              className="text-[13px] text-m-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring"
            >
              {switchTo.label}
            </button>
          )}
        </div>
      ) : null}
      {way === "password" ? (
        <div className="flex flex-col gap-3">
          {password}
          {switchTo === undefined ? null : (
            <button
              type="button"
              onClick={switchTo.onPress}
              className="self-start text-[13px] text-m-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring"
            >
              {switchTo.label}
            </button>
          )}
        </div>
      ) : null}
      {way === "none" ? <p className="text-[13px] leading-[19px] text-m-ink-2">{none}</p> : null}
    </div>
  );
}
