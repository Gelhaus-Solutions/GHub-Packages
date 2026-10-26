"use client";

import { Building2, Network } from "lucide-react";
import { useState } from "react";
import { cn } from "../cn.js";

export type PlaceMarkKind = "organisation" | "group";

export interface PlaceMarkProps {
  kind: PlaceMarkKind;
  /** The uploaded logo. The kind's glyph stands in where there is none or it does not load. */
  src?: string | null;
  /** The side in px: 24 in a row, 30 on the rail's button. */
  size?: number;
  /**
   * Read out as an image with this name, for a mark that stands alone. A mark
   * beside the place's name is decoration and stays hidden, which is the
   * default.
   */
  label?: string;
  className?: string;
}

/**
 * A company's or a group's mark: its uploaded logo, or the kind's glyph until
 * one is uploaded (GPlatform Identity, G62).
 *
 * **Never a letter tile.** Two companies called Nordwind draw the same two
 * letters, and a monogram in a square reads as a logo somebody chose. The glyph
 * says what kind of place it is instead, on the colour `WorkspacePicker`
 * already gives the kind: a building on the accent for a company, a network on
 * the info colour for a group.
 *
 * A logo sits on the plate in the same rounded square with a hairline edge, so
 * a transparent PNG reads on a dark page as on a light one. One that fails to
 * load falls back to the glyph rather than to a broken image, and an address
 * that changes is tried again.
 */
export function PlaceMark({ kind, src, size = 24, label, className }: PlaceMarkProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = typeof src === "string" && src !== "" && src !== failed ? src : null;
  const Glyph = kind === "group" ? Network : Building2;
  return (
    <span
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      data-mark={logo === null ? "glyph" : "logo"}
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-[30%]",
        logo !== null
          ? "bg-m-plate outline-1 -outline-offset-1 outline-[var(--gm-hairline)]"
          : kind === "group"
            ? "bg-[linear-gradient(135deg,var(--gm-info),color-mix(in_oklch,var(--gm-info)_70%,black))] text-m-ink"
            : "bg-[linear-gradient(135deg,var(--gm-accent),color-mix(in_oklch,var(--gm-accent)_75%,black))] text-m-accent-on",
        className,
      )}
    >
      {logo === null ? (
        <Glyph aria-hidden="true" size={Math.round(size * 0.55)} strokeWidth={1.75} />
      ) : (
        <img
          src={logo}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(logo)}
        />
      )}
    </span>
  );
}
