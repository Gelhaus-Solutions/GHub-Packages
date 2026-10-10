import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** One language the page can be read in, as a link to that reading. */
export interface LinkPageLanguage {
  /** BCP 47: "en", "de". Set as the option's own `lang`. */
  code: string;
  /** "EN", "DE". */
  label: string;
  href: string;
  current: boolean;
}

/** The page's outcome once its link has been used, or cannot be. */
export interface LinkPageOutcome {
  level: "ok" | "info" | "warn" | "crit";
  title: ReactNode;
  body?: ReactNode;
  /** The one thing to do next, as the caller's link. */
  next?: ReactNode;
}

export interface LinkPageProps {
  /** The reader's language, first; set as the page's `lang`. */
  lang: string;
  /** The sender's mark and name, in the 64px header. */
  brand: ReactNode;
  languages?: readonly LinkPageLanguage[];
  /** Names the language switch: "Language", "Sprache". */
  languageLabel?: string;
  /** The reference the mail named, in mono. */
  reference: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Until when the link works, or that it no longer does. */
  validity?: ReactNode;
  /**
   * Set once the page is done, used, expired or withdrawn: a banner in its
   * level, and the form is dropped. The title and reference stay, so the
   * reader can still tell which mail it was.
   */
  outcome?: LinkPageOutcome;
  /** What the recipient already received in the mail, and nothing more. */
  facts?: {
    title: ReactNode;
    items: readonly { key: string; label: ReactNode; value: ReactNode; mono?: boolean }[];
    note?: ReactNode;
  };
  /**
   * The form: its title, its fields (the caller's, at 48px and 16px so a
   * phone does not zoom), what pressing the button does, the button and a
   * quieter way out. Omitted with `outcome`.
   */
  action?: {
    title: ReactNode;
    children?: ReactNode;
    meansTitle?: ReactNode;
    means?: readonly ReactNode[];
    /** The caller's primary button; give it `LINK_PAGE_PRIMARY`. */
    submit: ReactNode;
    /** A quieter way out, as the caller's link; give it `LINK_PAGE_SECONDARY`. */
    secondary?: ReactNode;
  };
  /** "Opening this page changed nothing.", centred under everything. */
  assurance?: ReactNode;
  /** The site and the sender, the last line. */
  foot?: ReactNode;
  children?: ReactNode;
}

/** The page's one primary button: full width, 52 high, 16/600, the accent's glow. */
export const LINK_PAGE_PRIMARY =
  "inline-flex h-[52px] w-full items-center justify-center rounded-m-panel bg-m-accent text-[16px] font-semibold text-m-accent-on shadow-[0_10px_28px_-10px_color-mix(in_oklch,var(--gm-accent)_90%,transparent)] hover:bg-m-accent-hover active:bg-m-accent-press disabled:pointer-events-none disabled:bg-m-ink/10 disabled:text-m-ink-off disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";

/** The quieter way out: a 44px link, centred. */
export const LINK_PAGE_SECONDARY =
  "mt-1 grid h-11 place-items-center text-[14.5px] text-m-accent-text hover:underline";

const OUTCOME: Readonly<Record<LinkPageOutcome["level"], { box: string; dot: string }>> = {
  ok: {
    box: "border-m-ok/38 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-ok)_14%,transparent),transparent_60%)]",
    dot: "bg-m-ok shadow-[0_0_10px_var(--gm-ok)]",
  },
  info: {
    box: "border-m-info/38 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-info)_14%,transparent),transparent_60%)]",
    dot: "bg-m-info shadow-[0_0_10px_var(--gm-info)]",
  },
  warn: {
    box: "border-m-warn/38 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-warn)_14%,transparent),transparent_60%)]",
    dot: "bg-m-warn shadow-[0_0_10px_var(--gm-warn)]",
  },
  crit: {
    box: "border-m-crit/38 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-crit)_14%,transparent),transparent_60%)]",
    dot: "bg-m-crit shadow-[0_0_10px_var(--gm-crit)]",
  },
};

/**
 * The public frame for a one-time link (K10): reached from a mail, with no
 * account. The reader's language first with a switch, the reference the mail
 * named, a title and one sentence, how long the link works, the facts the
 * mail already gave, and the form with what pressing its button does.
 *
 * **Opening the page changes nothing**; only the button records, and a page
 * that says so under the form is the design's promise, which is why
 * `assurance` exists. A used, expired or withdrawn link keeps the title and
 * the reference and drops the form for an `outcome`. Phone first: one column,
 * at most 720 wide, every target 44px or more.
 */
export function LinkPage({
  lang,
  brand,
  languages,
  languageLabel = "Language",
  reference,
  title,
  lede,
  validity,
  outcome,
  facts,
  action,
  assurance,
  foot,
  children,
}: LinkPageProps) {
  return (
    <div lang={lang} className="w-full pb-7">
      <header className="mx-auto flex h-16 max-w-[720px] items-center gap-2 px-4">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-m-ink">
          {brand}
        </span>
        {languages === undefined || languages.length < 2 ? null : (
          <nav
            aria-label={languageLabel}
            className="ml-auto flex rounded-m-panel border border-m-hairline bg-m-inset p-[3px]"
          >
            {languages.map((one) => (
              <a
                key={one.code}
                href={one.href}
                lang={one.code}
                hrefLang={one.code}
                aria-current={one.current ? "true" : undefined}
                className={cn(
                  "grid h-[38px] w-11 place-items-center rounded-[9px] text-[13px]",
                  one.current
                    ? "bg-m-plate font-medium text-m-ink shadow-m-plate"
                    : "text-m-ink-2 hover:text-m-ink",
                )}
              >
                {one.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-4 pt-2">
        <div>
          <p className="font-mono text-[12.5px] text-m-accent-text">{reference}</p>
          <h1 className="mt-1 text-[27px] leading-8 font-semibold tracking-[-0.025em] text-balance text-m-ink">
            {title}
          </h1>
          {lede === undefined ? null : (
            <p className="mt-2 text-[15.5px] leading-6 text-pretty text-m-ink-2">{lede}</p>
          )}
          {validity === undefined ? null : (
            <p className="mt-1.5 text-[13px] leading-[19px] text-m-ink-3">{validity}</p>
          )}
        </div>
        {outcome === undefined ? null : (
          <div
            role="status"
            className={cn("rounded-m-card border bg-m-plate p-4", OUTCOME[outcome.level].box)}
          >
            <p className="flex items-center gap-2.5 text-[16px] leading-[23px] font-semibold text-m-ink">
              <span
                aria-hidden="true"
                className={cn("size-[9px] shrink-0 rounded-full", OUTCOME[outcome.level].dot)}
              />
              {outcome.title}
            </p>
            {outcome.body === undefined ? null : (
              <div className="mt-1.5 text-[14.5px] leading-[22px] text-pretty text-m-ink-2">
                {outcome.body}
              </div>
            )}
            {outcome.next === undefined ? null : (
              <div className="mt-1 flex min-h-11 items-center text-[14.5px] font-medium">
                {outcome.next}
              </div>
            )}
          </div>
        )}
        {facts === undefined ? null : (
          <section className="rounded-[14px] border border-m-hairline bg-m-plate px-4 py-3.5">
            <h2 className="text-[15px] leading-[22px] font-semibold text-m-ink">{facts.title}</h2>
            <dl className="mt-2 grid grid-cols-[180px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14.5px] leading-[21px] max-sm:grid-cols-1 max-sm:gap-y-0.5">
              {facts.items.map((item) => (
                <div key={item.key} className="contents">
                  <dt className="text-[13px] leading-[21px] text-m-ink-3 max-sm:mt-1.5">
                    {item.label}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 [overflow-wrap:anywhere] text-m-ink",
                      item.mono === true ? "font-mono text-[13.5px]" : "",
                    )}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            {facts.note === undefined ? null : (
              <p className="mt-2.5 text-[13px] leading-[19px] text-m-ink-3">{facts.note}</p>
            )}
          </section>
        )}
        {children}
        {outcome !== undefined || action === undefined ? null : (
          <section className="rounded-m-card border border-transparent [background:linear-gradient(var(--gm-plate),var(--gm-plate))_padding-box,linear-gradient(140deg,color-mix(in_oklch,var(--gm-accent)_80%,transparent),var(--gm-hairline)_50%)_border-box] p-4 shadow-[0_18px_40px_-26px_color-mix(in_oklch,var(--gm-accent)_80%,transparent)]">
            <h2 className="text-[17px] leading-6 font-semibold text-m-ink">{action.title}</h2>
            {action.children === undefined ? null : (
              <div className="mt-3 flex flex-col gap-3.5">{action.children}</div>
            )}
            {action.means === undefined || action.means.length === 0 ? null : (
              <div className="mt-4 border-t border-m-hairline pt-3.5">
                <p className="text-[13px] leading-[19px] font-medium text-m-ink-2">
                  {action.meansTitle ?? "What pressing the button does"}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {action.means.map((one, index) => (
                    <li
                      key={index}
                      className="flex gap-2.5 text-[14px] leading-[21px] text-m-ink-2"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-m-accent"
                      />
                      <span>{one}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4">{action.submit}</div>
            {action.secondary === undefined ? null : action.secondary}
          </section>
        )}
        {assurance === undefined ? null : (
          <p className="text-center text-[12.5px] leading-[19px] text-pretty text-m-ink-3">
            {assurance}
          </p>
        )}
        {foot === undefined ? null : (
          <p className="text-center text-[12px] leading-[18px] text-m-ink-3">{foot}</p>
        )}
      </main>
    </div>
  );
}
