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
  // Aurora draws idle as the hover film with ink-2, not a grey wash.
  idle: "bg-m-idle/10 border-m-idle/30 aurora:bg-m-hover aurora:text-m-ink-2",
};

/*
 * Aurora's pill: 22 high, no edge, 12/500. The large one beside a record's
 * title is 26 high and keeps an edge in its level at 35 per cent.
 */
const AURORA_PILL =
  "aurora:h-[22px] aurora:rounded-full aurora:border-transparent aurora:px-[9px] aurora:py-0 aurora:gap-1.5 aurora:text-[12px] aurora:leading-none aurora:font-medium aurora:whitespace-nowrap";
const AURORA_LARGE: Readonly<Record<StatusLevel, string>> = {
  ok: "aurora:border-m-ok/35",
  warn: "aurora:border-m-warn/35",
  crit: "aurora:border-m-crit/35",
  info: "aurora:border-m-info/35",
  idle: "aurora:border-m-idle/35",
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
  /**
   * The chip beside a page's title (`PageHead`'s `status`): a step larger,
   * and in Aurora edged in its level. Implies `chip`.
   */
  large?: boolean;
  className?: string;
}

export function Status({ level, children, chip = false, large = false, className }: StatusProps) {
  const pill = chip || large;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-m-meta",
        pill ? `rounded-m-chip border px-2 py-0.5 ${CHIP[level]} ${AURORA_PILL}` : "",
        large
          ? `aurora:h-[26px] aurora:gap-[7px] aurora:px-[11px] aurora:text-[12.5px] ${AURORA_LARGE[level]}`
          : "",
        INK[level],
        pill && level === "idle" ? "aurora:text-m-ink-2" : "",
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
        className={cn(
          "size-1.5 shrink-0 rounded-full ring-3 ring-current/17",
          // A pill's dot carries no halo in Aurora; the pill is the halo.
          pill ? "aurora:ring-0" : "",
          large ? "aurora:size-[7px]" : "",
          DOT[level],
        )}
      />
      {children}
    </span>
  );
}
