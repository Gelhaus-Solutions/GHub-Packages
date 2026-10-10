import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";

/** The level a panel is tinted with, when it carries one. */
export type GlassTone = "accent" | "ok" | "info" | "warn" | "crit";

/*
 * The tone's light across the pane from the top left and an edge in it: a
 * card is 10 per cent at 38, an aside 8 at 24. Off Aurora a tone is the wash
 * and the edge alone, which is what modern's banners already do.
 */
const TONE: Readonly<Record<GlassTone, string>> = {
  accent:
    "bg-m-accent-wash border-m-accent/38 aurora:border-m-accent/38 aurora:bg-[linear-gradient(150deg,color-mix(in_oklch,var(--gm-accent)_10%,transparent),transparent_65%)]",
  ok: "bg-m-ok-wash border-m-ok/38 aurora:border-m-ok/38 aurora:bg-[linear-gradient(150deg,color-mix(in_oklch,var(--gm-ok)_10%,transparent),transparent_65%)]",
  info: "bg-m-info-wash border-m-info/38 aurora:border-m-info/38 aurora:bg-[linear-gradient(150deg,color-mix(in_oklch,var(--gm-info)_10%,transparent),transparent_65%)]",
  warn: "bg-m-warn-wash border-m-warn/38 aurora:border-m-warn/38 aurora:bg-[linear-gradient(150deg,color-mix(in_oklch,var(--gm-warn)_10%,transparent),transparent_65%)]",
  crit: "bg-m-crit-wash border-m-crit/38 aurora:border-m-crit/38 aurora:bg-[linear-gradient(150deg,color-mix(in_oklch,var(--gm-crit)_10%,transparent),transparent_65%)]",
};

const PAD = {
  /* Rows and tables run to the edges and carry their own padding. */
  none: "",
  /* Facts and lists of pairs. */
  facts: "px-[18px] py-4",
  /* Forms, cards and confirmations. */
  form: "px-5 py-[18px]",
} as const;

export interface GlassPanelProps {
  children: ReactNode;
  /**
   * The element. `section` (the default) is a group with a name, so give it
   * `label` or a heading inside; `aside` is the reference beside a form;
   * `article` a document; `figure` a mail or a chart with its caption.
   */
  as?: "section" | "div" | "aside" | "article" | "figure";
  /** How far the content sits from the edge. */
  pad?: keyof typeof PAD;
  /**
   * A level the whole pane is about: a destructive confirmation is `crit`,
   * the reference beside a form `accent`. Most panes have none.
   */
  tone?: GlassTone;
  /** The pane's accessible name, when nothing inside it names it. */
  label?: string;
  id?: string;
  className?: string;
}

/**
 * A pane of glass with nothing decided about what is in it: facts, a form,
 * an aside, a card. `Section` is the one with a heading and a list; this is
 * everything else that sits on the same material.
 *
 * Off Aurora it is modern's plate panel, so a screen built from it reads the
 * same in a product that never imports the glass.
 */
export function GlassPanel({
  children,
  as: Element = "section",
  pad = "facts",
  tone,
  label,
  id,
  className,
}: GlassPanelProps) {
  return (
    <Element
      id={id}
      aria-label={label}
      className={cn(
        "min-w-0 rounded-m-panel border border-m-subtle bg-m-plate shadow-m-plate",
        AURORA_GLASS,
        tone === undefined ? "" : TONE[tone],
        PAD[pad],
        className,
      )}
    >
      {children}
    </Element>
  );
}
