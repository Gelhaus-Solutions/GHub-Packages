import { cn } from "../cn.js";

/** The five levels modern keeps. `locked` left the ramp in sheet 22. */
export type StatusLevel = "ok" | "warn" | "crit" | "info" | "idle";

const DOT: Readonly<Record<StatusLevel, string>> = {
  ok: "bg-m-ok",
  warn: "bg-m-warn",
  crit: "bg-m-crit",
  info: "bg-m-info",
  idle: "bg-m-idle",
};

const INK: Readonly<Record<StatusLevel, string>> = {
  ok: "text-m-ok-ink",
  warn: "text-m-warn-ink",
  crit: "text-m-crit-ink",
  info: "text-m-info-ink",
  idle: "text-m-idle-ink",
};

const CHIP: Readonly<Record<StatusLevel, string>> = {
  ok: "bg-m-ok-wash border-m-ok/30",
  warn: "bg-m-warn-wash border-m-warn/30",
  crit: "bg-m-crit-wash border-m-crit/30",
  info: "bg-m-info-wash border-m-info/30",
  idle: "bg-m-idle/10 border-m-idle/30",
};

/**
 * How bad something is, in a word and a colour, in that order.
 *
 * **Colour never carries it alone, so the word is a required prop and not an
 * optional one.** A bare coloured dot is unreadable to anybody who cannot
 * separate the hues, invisible to a screen reader and meaningless in a
 * screenshot pasted into a ticket. Making the word optional would make the
 * unreadable version the convenient one.
 *
 * The dot is `aria-hidden` for the same reason from the other side: the word
 * beside it already carries the state, so announcing a bullet adds nothing.
 * Two elements saying one thing is how a list of eight statuses becomes
 * sixteen things to listen to.
 *
 * The two bars are different because the two jobs are. The ink is read, so it
 * owes 4.5; the dot is a graphic, so it owes 3. They are separate tokens for
 * exactly that reason and not by accident.
 */
export interface StatusProps {
  level: StatusLevel;
  /** Always shown. There is no presentation of this component without it. */
  children: React.ReactNode;
  /**
   * A chip on a wash, for a table cell or a record row where a bare dot and
   * word would not read as one object. Inline everywhere else.
   */
  chip?: boolean;
  className?: string;
}

export function Status({ level, children, chip = false, className }: StatusProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-m-meta",
        chip ? `rounded-m-chip border px-2 py-0.5 ${CHIP[level]}` : "",
        INK[level],
        className,
      )}
    >
      {/*
       * The halo is a spread shadow rather than a border, so the dot's own 3:1
       * against the surface is unchanged and the ring stays decorative. No
       * blur, no spread past 3px, and it never animates.
       */}
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full ring-3 ring-current/17", DOT[level])}
      />
      {children}
    </span>
  );
}
