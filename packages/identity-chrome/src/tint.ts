/**
 * The coloured initial's seven tints (sheet 32), and how one is picked.
 *
 * Tints of the seven product mark hues at L 0.84, C 0.07, with the initial in
 * mark ink at 600: ink on tint measures 9.8 to 11.2, so the initial passes 4.5
 * at any size on every host.
 *
 * **Picked by a stable id, never by the name**, so a person keeps their colour
 * when they change their name and two people of the same name do not share one.
 * Identity picks it from the Identity's id and sends only the result; a product
 * hashes its own user id the same way for somebody with no Identity. Identity
 * keeps a copy of `avatarTint` in step by hand, because this package is public
 * and Identity does not depend on it: the vectors in `tint.test.ts` are the
 * contract between the two.
 */

/** Tide, Harbour, Iris, Rose, Ember, Amber, Moss: the order the index counts in. */
export const AVATAR_TINTS = [
  "oklch(0.84 0.06 200)",
  "oklch(0.84 0.06 258)",
  "oklch(0.84 0.07 296)",
  "oklch(0.85 0.07 355)",
  "oklch(0.85 0.07 33)",
  "oklch(0.87 0.08 70)",
  "oklch(0.85 0.07 148)",
] as const;

/** Mark ink: the initial on every tint. */
export const AVATAR_INK = "#141c1e";

/** Which of the seven tints a stable id gets: FNV-1a over its UTF-16 code units, modulo seven. */
export function avatarTint(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % AVATAR_TINTS.length;
}
