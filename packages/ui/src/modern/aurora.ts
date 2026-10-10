/**
 * Aurora's material, as class lists a component adds beside its own.
 *
 * Every class here is under the `aurora:` variant, which only exists in an app
 * that imports `@ghub/tokens/aurora.css`. Anywhere else Tailwind does not know
 * the variant and emits nothing for these classes, so a modern component
 * renders exactly as it did before they were added. Where the variant does
 * exist, the classes still match only under an element stamped `data-aurora`.
 *
 * Kept in a module with no "use client", for the reason `button-classes.ts`
 * is: a server component composes these too.
 */

/**
 * A pane of glass: a section, a table on its own, a panel, a tile. The film
 * and frost (`a-glass`), the 18px corner, a 1px ink edge and the lit top edge
 * with its long soft drop.
 */
export const AURORA_GLASS =
  "aurora:a-glass aurora:rounded-a-glass aurora:border aurora:border-a-edge aurora:shadow-a-glass";

/**
 * The same pane inside another one: no film, no frost, no edge, no corner,
 * because glass on glass reads as a smudge. For a table or a list a glass
 * section already holds.
 */
export const AURORA_FLAT =
  "aurora:bg-transparent aurora:backdrop-filter-none aurora:rounded-none aurora:border-0 aurora:shadow-none";

/**
 * Glass inside a glass section goes flat, runs to the section's edges and is
 * ruled above by a hairline: a list, a row, a panel of rows. Keyed to the
 * `data-m-body` hook a `Section` puts on its body. A list that holds such rows
 * takes `AURORA_LIST_IN_SECTION`, so the rows meet at their rules rather than
 * standing apart, and a `data-m-flush` hook so the pane ends on its last row.
 */
export const AURORA_IN_SECTION =
  "aurora:in-data-m-body:-mx-[18px] aurora:in-data-m-body:rounded-none aurora:in-data-m-body:border-0 aurora:in-data-m-body:border-t aurora:in-data-m-body:border-m-hairline aurora:in-data-m-body:bg-transparent aurora:in-data-m-body:shadow-none aurora:in-data-m-body:backdrop-filter-none";
export const AURORA_LIST_IN_SECTION = "aurora:in-data-m-body:gap-0";

/**
 * A field: a 12px corner on the inset at 70 per cent, and an accent edge with
 * a 4px accent-wash ring on focus. The resting edge is left to the field,
 * because a refused field draws it in crit and an aurora class here would
 * outrank that. A refused field keeps its crit edge while focused too, with
 * a crit ring instead of the accent one.
 */
export const AURORA_FIELD =
  "aurora:rounded-a-field aurora:bg-a-field aurora:shadow-none aurora:text-m-ink aurora:focus:border-m-accent aurora:focus:shadow-[0_0_0_4px_var(--gm-accent-wash)] aurora:aria-invalid:focus:border-m-crit aurora:aria-invalid:focus:shadow-[0_0_0_4px_var(--gm-crit-wash)]";

/**
 * A popover or a menu: thicker glass than a section (82 per cent, blur 24),
 * a 16px corner and the deep drop that says it floats over everything.
 */
export const AURORA_MENU =
  "aurora:a-glass-menu aurora:rounded-a-banner aurora:border aurora:border-a-edge-pill aurora:shadow-a-menu";

/**
 * A segmented track (padding 3, ink 6 per cent with an ink 8 edge), and the
 * raised current item inside it.
 */
export const AURORA_TRACK =
  "aurora:rounded-full aurora:p-[3px] aurora:gap-0.5 aurora:border aurora:bg-a-track aurora:border-a-edge-track";
export const AURORA_TRACK_ITEM =
  "aurora:h-7 aurora:rounded-full aurora:px-[13px] aurora:text-[13px] aurora:leading-none aurora:border-0";
export const AURORA_TRACK_ON =
  "aurora:bg-a-raised-strong aurora:shadow-a-raised-strong aurora:text-m-ink aurora:font-medium";
export const AURORA_TRACK_OFF =
  "aurora:bg-transparent aurora:shadow-none aurora:text-m-ink-2 aurora:font-normal aurora:hover:text-m-ink";
