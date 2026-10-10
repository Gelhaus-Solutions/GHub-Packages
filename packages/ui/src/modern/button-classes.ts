import { clsx } from "clsx";

/**
 * The modern button recipe, deliberately in a module with no "use client".
 *
 * A server component needs these classes to style a framework `Link` as a
 * button: an anchor nested inside a button is invalid markup and breaks the
 * keyboard, so navigation that looks like a button is a link wearing the recipe
 * instead. A function exported from a client module reaches the server as a
 * reference it cannot call, so the recipe lives here and `button.tsx` imports
 * it rather than the other way round.
 *
 * Drawn for the GPlatform Terms staff console, because console's `Button` is
 * the wrong language for a modern screen: 32px by default, a 5px radius and the
 * console tokens. The two recipes are separate on purpose, the same way the two
 * token files are.
 */

/**
 * Four, and each has one job.
 *
 * - `primary` is the accent fill and there is at most one on a screen. It takes
 *   `accent-on` for its label, which is near-black in dark and white in light,
 *   because white on the dark accent measures 2.36.
 * - `secondary` is the quiet plate, for everything that is not the one thing.
 * - `quiet` is a verb set as a link: no fill, no edge, the accent ink.
 * - `destructive` is the `crit-fill` step with a white label. It is a fill and
 *   not the status crit, which is too light to carry white. It always pairs
 *   with a confirmation in the surrounding flow rather than being scary alone.
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";

/**
 * Two heights, and the same two as `Input`, because a button matches the field
 * beside it.
 *
 * 44 is the default: one primary per screen and every control on a phone, where
 * it is the target a thumb can hit. 36 is for staff forms and rows, where the
 * person is at a keyboard. Console's 32 is not here at all.
 */
export type ButtonSize = 44 | 36;

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fills the width of its container, for a phone column or a card footer. */
  block?: boolean;
  /**
   * Draws the pressed material instead of offering a hover.
   *
   * Only `Button` sets this, from its own `busy` prop. It is a class decision
   * rather than an `aria-busy:` variant so the busy material does not depend on
   * which of two variants Tailwind happens to emit later.
   */
  busy?: boolean;
}

/*
 * A film over the material for hover and press, never a step to the next
 * surface token, which is the rule modern.css states for every surface. A
 * background colour would REPLACE the plate with the film; an image layer sits
 * on top of it, so the plate is still there underneath.
 */
const HOVER_FILM = "hover:bg-[linear-gradient(var(--gm-hover),var(--gm-hover))]";
const PRESS_FILM = "active:bg-[linear-gradient(var(--gm-active),var(--gm-active))]";
const BUSY_FILM = "bg-[linear-gradient(var(--gm-active),var(--gm-active))]";

const BASE = [
  "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
  "rounded-m-control border text-m-label",
  /*
   * The ring is the one thing here that never animates, so there is no
   * `transition-colors` on this recipe at all: in Tailwind v4 that utility
   * includes `outline-color`, and a ring that fades in over 90ms is a ring that
   * is not there when somebody is tabbing fast.
   */
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
  /*
   * Inactive is no material, the rule Pagination already follows: no fill, no
   * edge, no shadow, and the inactive ink, which is the one place `ink-off` is
   * allowed. A greyed label on something that still looks raised is the
   * version people keep pressing.
   *
   * `pointer-events-none` because `hover:` is emitted after `disabled:` and
   * would otherwise put the hover fill back on a disabled primary.
   */
  "disabled:pointer-events-none disabled:border-transparent disabled:bg-transparent",
  "disabled:bg-none disabled:text-m-ink-off disabled:shadow-none disabled:no-underline",
  /*
   * Aurora: every button is a pill, and an inactive one keeps a faint ink
   * fill rather than no material, because on glass an outline-less label
   * reads as a hole. The disabled classes are restated under the variant so
   * they outrank the aurora material on the same element.
   */
  "aurora:rounded-full",
  "aurora:disabled:border-transparent aurora:disabled:bg-m-ink/10 aurora:disabled:shadow-none",
];

const MATERIAL: Readonly<Record<ButtonVariant, string>> = {
  // The primary's fill is chosen with its state below, because at rest and busy
  // it is two different tokens for the same property.
  primary: "border-transparent text-m-accent-on aurora:shadow-a-primary",
  // Aurora's secondary is an outline on the glass, not a plate on it.
  secondary:
    "border-m-control bg-m-plate text-m-ink shadow-m-quiet aurora:border-a-edge-button aurora:bg-transparent aurora:shadow-none",
  quiet: "border-transparent bg-transparent text-m-accent-text",
  destructive: "border-transparent bg-m-crit-fill text-white",
};

/*
 * At rest, and how each answers a pointer. The primary has stated hover and
 * press tokens, so it uses them. The other fills have none and take the film;
 * the quiet verb has no material for a film to sit on, so it underlines like
 * the link it is styled as.
 */
const REST: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-m-accent hover:bg-m-accent-hover active:bg-m-accent-press",
  secondary: `${HOVER_FILM} ${PRESS_FILM}`,
  quiet: "hover:underline",
  destructive: `${HOVER_FILM} ${PRESS_FILM}`,
};

/*
 * Busy is drawn as held down and offers no hover: the primary in its press
 * token, as sheet 09 draws it, and the other fills under the press film. The
 * label stays exactly as it was, because the design rules out a spinner
 * standing in for the words.
 */
const BUSY: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-m-accent-press cursor-progress",
  secondary: `${BUSY_FILM} cursor-progress`,
  quiet: "cursor-progress",
  destructive: `${BUSY_FILM} cursor-progress`,
};

/*
 * Aurora draws its large button at 42 and its standard one at 36, and keeps
 * 44 on a phone, where it is the size of a thumb.
 */
const HEIGHT: Readonly<Record<ButtonSize, string>> = {
  44: "h-11 aurora:h-[42px] aurora:text-[14.5px] aurora:max-sm:h-11",
  36: "h-9 aurora:text-[14px] aurora:max-sm:h-11",
};

/* Sheet 09's paddings: 18 at 44 and 12 at 36. Aurora's: 20 and 16. */
const PADDING: Readonly<Record<ButtonSize, string>> = {
  44: "px-[18px] aurora:px-5",
  36: "px-3 aurora:px-4",
};

/**
 * Class list for a modern button, or for a link wearing one. Safe on the server.
 *
 * **Joined with `clsx`, not merged with `cn`, and the list is built with no
 * two classes competing for one property so it does not need merging.**
 * tailwind-merge does not know modern's type steps: it reads `text-m-label`
 * and `text-m-accent-on` as two text colours and keeps only the last, so the
 * button would lose its type step. The same applies to a caller who passes
 * this through `cn` with a class of their own.
 */
export function buttonClasses({
  variant = "secondary",
  size = 44,
  block = false,
  busy = false,
}: ButtonClassOptions = {}): string {
  return clsx(
    BASE,
    HEIGHT[size],
    // The quiet verb keeps the height, so its target matches the buttons beside
    // it, and drops the side padding to 2px so it lines up with the text.
    variant === "quiet" ? "px-0.5" : PADDING[size],
    MATERIAL[variant],
    busy ? BUSY[variant] : REST[variant],
    block && "w-full",
  );
}
