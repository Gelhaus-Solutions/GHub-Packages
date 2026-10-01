/**
 * What counts as focusable, in one place.
 *
 * Every overlay in this package has to answer the same question: which elements
 * inside me can take focus, so I can put focus on the first one, trap Tab
 * between the first and the last, and hand focus back when I close. The
 * selector was written out inside the dialog, and a popover needing the same
 * answer is exactly how two copies of it start disagreeing about whether a
 * `[tabindex="-1"]` element counts.
 *
 * Deliberately without "use client": this is a string and a filter over a DOM
 * node, so a module that imports it does not become a client module by doing so.
 */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The focusable elements inside a container, in tab order, minus the hidden.
 *
 * `offsetParent === null` is the cheap test for "not rendered": it catches
 * `display: none` on the element or any ancestor, which is what a collapsed
 * group or a closed section inside an overlay actually is. An element that
 * cannot be seen must not be a stop on the way round the trap, or Tab appears
 * to do nothing for a keystroke or two and the trap looks broken.
 */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null,
  );
}
