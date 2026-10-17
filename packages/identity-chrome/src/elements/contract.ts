/**
 * The host contract: what the two elements read from the page they sit in.
 *
 * **The published `@ghub/tokens` names, and no family of their own.** The
 * design drew a `--gc-*` set; the operator chose (2026-10-17) to read the
 * names a host on `@ghub/tokens` already declares on its root, so such a host
 * is styled with no setup at all. Custom properties inherit into a shadow
 * root, which is the one thing that crosses it. A host on something else sets
 * the same names.
 *
 * | Read | From | Notes |
 * | --- | --- | --- |
 * | the popup's surface | `--ga-menu`, else `--gm-overlay` | Aurora's frosted menu where the host is Aurora |
 * | its frost | `--ga-frost-menu`, else none | |
 * | its shadow | `--ga-shadow-menu`, else `--gm-shadow-overlay` | |
 * | the solid surface | `--gm-overlay` | reduced transparency, the badge, the fade |
 * | the account popup's tinted ground | `--ga-menu`, else `--gm-sunken` | the operator's pick (2026-10-17): exact to sheet 32 on a light host; on a dark one a tray a step below the page |
 * | its solid ground | `--gm-sunken` | reduced transparency |
 * | the account popup's panels | `--ga-track`, else `--gm-overlay` | Aurora's six per cent ink film, the white wash sheet 32 draws on glass |
 * | everything else | `--gm-plate`, `--gm-ink`, `--gm-ink-2`, `--gm-ink-3`, `--gm-hairline`, `--gm-control`, `--gm-hover`, `--gm-active`, `--gm-selected`, `--gm-accent`, `--gm-accent-text`, `--gm-ring`, `--gm-crit-ink` | |
 * | the face | `--font-sans` | |
 *
 * A host that declares none of them gets modern light, or modern dark under
 * `prefers-color-scheme: dark`, the values sheet 31 draws its light and dark
 * hosts with. No second accent: the popups take the host's.
 */

const LIGHT = {
  overlay: "#ffffff",
  sunken: "oklch(0.955 0.004 258)",
  plate: "oklch(0.97 0.003 258)",
  ink: "oklch(0.19 0.008 258)",
  ink2: "oklch(0.42 0.012 258)",
  ink3: "oklch(0.53 0.014 258)",
  hairline: "oklch(0 0 0 / 0.09)",
  control: "oklch(0 0 0 / 0.48)",
  hover: "oklch(0 0 0 / 0.045)",
  active: "oklch(0 0 0 / 0.08)",
  selected: "oklch(0.52 0.11 205 / 0.1)",
  accent: "oklch(0.52 0.11 205)",
  accentText: "oklch(0.5 0.11 205)",
  ring: "oklch(0.52 0.11 205)",
  critInk: "oklch(0.5 0.19 22)",
  shadow:
    "0 0 0 1px oklch(0 0 0 / 0.07), 0 2px 4px oklch(0 0 0 / 0.04), 0 18px 40px -10px oklch(0 0 0 / 0.2)",
} as const;

const DARK: Record<keyof typeof LIGHT, string> = {
  overlay: "oklch(0.265 0.01 258)",
  sunken: "oklch(0.155 0.007 258)",
  plate: "oklch(0.235 0.009 258)",
  ink: "oklch(0.975 0.003 255)",
  ink2: "oklch(0.8 0.009 255)",
  ink3: "oklch(0.645 0.012 258)",
  hairline: "oklch(1 0 0 / 0.11)",
  control: "oklch(1 0 0 / 0.36)",
  hover: "oklch(1 0 0 / 0.06)",
  active: "oklch(1 0 0 / 0.1)",
  selected: "oklch(0.72 0.12 200 / 0.14)",
  accent: "oklch(0.72 0.12 200)",
  accentText: "oklch(0.78 0.11 200)",
  ring: "oklch(0.82 0.11 196)",
  critInk: "oklch(0.72 0.18 25)",
  shadow:
    "inset 0 1px 0 oklch(1 0 0 / 0.08), 0 0 0 1px oklch(1 0 0 / 0.06), 0 24px 48px -12px oklch(0 0 0 / 0.6)",
};

/** The element's private names, each read from the host's published one with a fallback. */
function declarations(f: Record<keyof typeof LIGHT, string>): string {
  return `
    --_overlay: var(--ga-menu, var(--gm-overlay, ${f.overlay}));
    --_overlay-solid: var(--gm-overlay, ${f.overlay});
    --_backdrop: var(--ga-frost-menu, none);
    --_shadow: var(--ga-shadow-menu, var(--gm-shadow-overlay, ${f.shadow}));
    --_tint: var(--ga-menu, var(--gm-sunken, ${f.sunken}));
    --_tint-solid: var(--gm-sunken, ${f.sunken});
    --_panel: var(--ga-track, var(--gm-overlay, ${f.overlay}));
    --_plate: var(--gm-plate, ${f.plate});
    --_ink: var(--gm-ink, ${f.ink});
    --_ink-2: var(--gm-ink-2, ${f.ink2});
    --_ink-3: var(--gm-ink-3, ${f.ink3});
    --_hairline: var(--gm-hairline, ${f.hairline});
    --_control: var(--gm-control, ${f.control});
    --_hover: var(--gm-hover, ${f.hover});
    --_active: var(--gm-active, ${f.active});
    --_selected: var(--gm-selected, ${f.selected});
    --_accent: var(--gm-accent, ${f.accent});
    --_accent-text: var(--gm-accent-text, ${f.accentText});
    --_ring: var(--gm-ring, ${f.ring});
    --_crit-ink: var(--gm-crit-ink, ${f.critInk});
    --_font: var(--font-sans, Geist, ui-sans-serif, system-ui, sans-serif);`;
}

/** The `:host` rules both elements start their sheet with. */
export const CONTRACT_CSS = `
  :host {${declarations(LIGHT)}
    position: relative;
    display: inline-block;
    font-family: var(--_font);
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    :host {${declarations(DARK)}
    }
  }
  :host([hidden]) { display: none; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
`;
