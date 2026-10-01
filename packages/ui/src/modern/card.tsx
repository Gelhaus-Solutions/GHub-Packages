"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../cn.js";

/** True inside a card, which is how a nested one knows to flatten. */
const InsideCard = createContext(false);

/**
 * What content lives on. Renamed from `Panel`, because here it is a surface
 * rather than an instrument housing.
 *
 * **No header bar, no title slot, no footer rule.** A card with a heading puts
 * the heading inside it and that is all the structure there is. Every chrome
 * slot a card grows is a place two screens can disagree about what belongs
 * there, and the disagreement is always found by a customer.
 *
 * **Never nested in another card, and this enforces it by FLATTENING rather
 * than by throwing.** A nested card is a visual mistake, and a component that
 * turned a visual mistake into a crashed page would be a worse one. So a card
 * inside a card renders its children with no plate, no edge and no padding of
 * its own: the layout stays right, the second plate never appears, and the
 * outer card keeps its shape.
 *
 * It flattens rather than warns because a warning is only read by whoever is
 * looking at a console at the time, and this composes: a card is exactly the
 * thing somebody drops into a slot without knowing what is already there.
 */
export interface CardProps {
  children: ReactNode;
  /**
   * 40 rather than 24, for a card that is the only thing on its screen. Sheet
   * 22 gives both and nothing between them.
   */
  roomy?: boolean;
  className?: string;
}

export function Card({ children, roomy = false, className }: CardProps) {
  const nested = useContext(InsideCard);

  if (nested) return <>{children}</>;

  return (
    <InsideCard.Provider value={true}>
      <div
        className={cn(
          "rounded-m-card border border-m-subtle bg-m-plate shadow-m-card",
          roomy ? "p-10" : "p-6",
          className,
        )}
      >
        {children}
      </div>
    </InsideCard.Provider>
  );
}
