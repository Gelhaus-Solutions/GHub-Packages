"use client";

import { useState, type ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * The seven tints as utilities, in the order `avatarTint` counts: Tide,
 * Harbour, Iris, Rose, Ember, Amber, Moss (`--gm-avatar-1` to `-7`).
 */
const TINTS = [
  "bg-m-avatar-1",
  "bg-m-avatar-2",
  "bg-m-avatar-3",
  "bg-m-avatar-4",
  "bg-m-avatar-5",
  "bg-m-avatar-6",
  "bg-m-avatar-7",
] as const;

/**
 * Which of the seven tints a stable id gets: FNV-1a over its UTF-16 code
 * units, modulo seven.
 *
 * The same hash `@ghub/identity-chrome` and GPlatform Identity use, kept in
 * step by their shared test vectors, so one person has one colour in every
 * product whoever does the hashing.
 */
export function avatarTint(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % TINTS.length;
}

/** The first letter, whole even outside the basic plane, or "?" for a blank name. */
function initialOf(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? "?";
}

export interface AvatarProps {
  /** Whose it is. Only its first letter is drawn, and only where there is no picture. */
  name: string;
  /** The picture. The coloured initial stands in where there is none or it does not load. */
  src?: string | null;
  /**
   * The stable id the tint is picked from: the Identity id, else the product's
   * own user id. **Never the name**, so a person keeps their colour when they
   * change their name and two people called Mira do not share one.
   */
  tintKey: string;
  /** The side in px: 32 in a row, 72 on a card. */
  size?: number;
  /**
   * Read out as an image with this name, for an avatar that stands alone. An
   * avatar beside the person's name is decoration and stays hidden, which is
   * the default, so a row is not announced as "M, Mira Kessler".
   */
  label?: string;
  /** Something at the lower right, such as the pencil that changes the picture. */
  badge?: ReactNode;
  className?: string;
}

/**
 * A person's picture, or their initial on a colour of their own (GPlatform
 * Identity, sheet 32).
 *
 * **The tint is a request sheet 21 M5 granted for avatars only.** Seven tints
 * of the product mark hues, with the initial in mark ink at 600: 9.8 to 11.2 to
 * 1 on every tint, so the initial passes at any size on a light page and a
 * dark one, and the same avatar is right on both.
 *
 * A picture that fails to load falls back to the initial rather than to a
 * broken image, and an address that changes is tried again.
 */
export function Avatar({ name, src, tintKey, size = 32, label, badge, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const picture = typeof src === "string" && src !== "" && src !== failed ? src : null;
  const face = (
    <span
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full leading-none font-semibold text-m-avatar-ink",
        TINTS[avatarTint(tintKey)],
      )}
    >
      {picture === null ? (
        initialOf(name)
      ) : (
        <img
          src={picture}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(picture)}
        />
      )}
    </span>
  );
  if (badge === undefined) {
    return <span className={cn("inline-flex shrink-0", className)}>{face}</span>;
  }
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {face}
      <span className="absolute -right-1 -bottom-0.5">{badge}</span>
    </span>
  );
}
