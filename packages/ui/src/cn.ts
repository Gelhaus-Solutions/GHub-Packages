import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told about the type steps the tokens add.
 *
 * It knows Tailwind's own sizes and nothing else, so it reads `text-m-meta`
 * or `text-2xs` as a colour, and beside a real colour (`text-m-ink-2`) it
 * keeps only the later of the two "colours" and drops the size without a
 * word. Every modern component that sets a step and an ink on one element
 * lost its step that way. Listing the steps here as font sizes keeps both.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "2xs",
            "3xs",
            "m-display",
            "m-title",
            "m-heading",
            "m-lede",
            "m-body",
            "m-label",
            "m-meta",
            "m-micro",
          ],
        },
      ],
    },
  },
});

/** clsx plus tailwind-merge, the same helper every app in the house uses. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
