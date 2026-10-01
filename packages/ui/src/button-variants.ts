import { cva, type VariantProps } from "class-variance-authority";

/**
 * The button class recipe, deliberately in a module with no "use client".
 *
 * Server components need these classes to style a framework `Link` as a button:
 * an anchor nested inside a button is invalid markup and breaks keyboard
 * behaviour, so navigation wears the clothes instead. Keeping the recipe out of
 * the client component is what makes that callable from the server.
 *
 * The accent is reserved for the primary action on a screen, and there is at most
 * one. `danger` is for anything that stops or destroys, and it always pairs with a
 * confirmation in the surrounding flow rather than being scary on its own.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "font-medium tracking-[-0.01em] select-none",
    "border transition-colors duration-(--duration-instant) ease-(--ease-out-quick)",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
    "disabled:pointer-events-none disabled:opacity-45",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-accent-fg border-transparent",
          "hover:bg-accent-hover active:bg-accent-press",
          "shadow-[0_0_0_1px_var(--gc-accent-glow)]",
        ],
        secondary: [
          "bg-raised text-fg border-(--gc-border-control)",
          "hover:bg-overlay hover:border-(--gc-border-strong)",
          "active:bg-active",
        ],
        ghost: [
          "bg-transparent text-fg-secondary border-transparent",
          "hover:bg-hover hover:text-fg",
        ],
        danger: [
          // `crit-ink` rather than `crit`: this is a label, and the split the
          // ink tokens exist for is that the status colour is the graphic at
          // 3:1 while the text owes 4.5:1. Measured 3.75:1 rendered in light
          // with `text-crit`. The border keeps `--gc-crit`, which is the half
          // that really is a graphic.
          "bg-transparent text-crit-ink border-[color-mix(in_oklch,var(--gc-crit)_45%,transparent)]",
          "hover:bg-crit-wash hover:border-crit",
        ],
        subtle: [
          "bg-inset text-fg-secondary border-(--gc-border-hairline)",
          "hover:bg-hover hover:text-fg",
        ],
      },
      size: {
        xs: "h-6 px-2 text-2xs rounded-(--radius-sm)",
        sm: "h-7 px-2.5 text-xs rounded-(--radius-sm)",
        md: "h-8 px-3 text-sm rounded-(--radius-md)",
        lg: "h-10 px-4 text-sm rounded-(--radius-md)",
        /**
         * 44px, which is a target rather than a size.
         *
         * `lg` is 40px and was the largest thing here, which is fine in a
         * control room on a desk and is four pixels short everywhere a person
         * is holding the machine. A password reset is done on a phone and a
         * lockdown is pressed on one, so the narrow width needs a control the
         * WCAG 2.2 target size rule is satisfied by rather than argued about.
         *
         * It is a size on the shared component instead of a local override,
         * because a local one is a second control height in the family and the
         * contrast suite does not catch geometry.
         */
        xl: "h-11 px-4 text-sm rounded-(--radius-md)",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "md", block: false },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

/** Class list for anything that navigates rather than acts. Safe on the server. */
export function buttonClasses(variants: ButtonVariantProps = {}): string {
  return buttonVariants(variants);
}
