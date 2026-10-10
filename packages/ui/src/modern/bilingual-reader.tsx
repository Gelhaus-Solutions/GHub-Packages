"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { SegmentedControl } from "../segmented-control.js";
import { AURORA_GLASS, AURORA_IN_SECTION } from "./aurora.js";

/** One of the two texts, with what identifies the file it came from. */
export interface BilingualText {
  /** The article's language as a BCP 47 tag, `en` or `de`. Set as `lang` on the article. */
  lang: string;
  /** The short form on the badge and on the switch: `EN`, `DE`. */
  badge: string;
  /**
   * The language's name, in the page's language: "English", "German". It is
   * what the switch announces for the badge, because "E N" read out letter by
   * letter is not the name of a language.
   */
  languageName: string;
  /** The file name as delivered. Mono, because it is compared, not read. */
  file: string;
  /** Already formatted, "48,213 bytes". This package has no locale to format it with. */
  size: ReactNode;
  /** A slot for the file's hash and its verdict, built by the caller. */
  hash?: ReactNode;
  /** Becomes the article's `h2` and names the article. */
  title: ReactNode;
  intro?: ReactNode;
  /**
   * The body as delivered, already rendered by the caller. Turning markdown
   * into markup is the caller's job, and its headings start at `h3`: the title
   * above is the `h2`, under the page's one `h1`, so the outline of the page is
   * the outline of the document.
   */
  body: ReactNode;
}

/**
 * `auto` measures the reader and decides; the other two are for a caller that
 * already knows, such as a print view or a test with no layout engine.
 */
export type BilingualReaderLayout = "auto" | "pair" | "single";

/**
 * Below this width of its own box, the reader shows one text at a time. It is
 * `container-m-content`, the widest measure a modern page has: under it two
 * columns of legal text fall below a readable line length.
 */
const PAIR_FROM = 1080;

/**
 * Two texts of one frozen version, side by side at a desk and one at a time
 * below it. Drawn for the GPlatform Terms staff console, where each version of
 * a legal document exists in English and German and staff compare the two.
 *
 * **Both articles stay in the DOM, and the switch only sets `hidden`.** The
 * hidden text is out of the accessibility tree and out of find-in-page, and it
 * is back the moment it is chosen with its scroll position and any selection
 * intact. Unmounting it would rebuild a forty-thousand-word article on every
 * press of the switch.
 *
 * **The switch is a radio group, and it is the shared `SegmentedControl`.**
 * One tab stop, arrows choose, the same contract as every other two-way choice
 * in the family, so a person who has used the theme switch already knows this
 * one. It is only drawn when one text is showing, because side by side there
 * is nothing to choose.
 *
 * **Side by side, a skip link leads the first text.** It is the only way past a
 * long article for somebody moving by Tab, who would otherwise walk through
 * every link in the English terms before reaching the German ones. It is
 * visually hidden until it is focused, the usual skip link contract.
 *
 * **No synced scrolling.** The two texts differ in length, so scrolling one to
 * keep pace with the other would put the reader in the wrong paragraph of the
 * second. Each article scrolls with the page.
 *
 * Read only: no selection handles, no edit, no comment. A frozen version is
 * changed by freezing a new one, somewhere else.
 */
export interface BilingualReaderProps {
  /** The two texts, in the order they are read side by side. */
  texts: readonly [BilingualText, BilingualText];
  /** Names the switch: "Language". */
  switchLabel: string;
  /** The skip link's words: "Skip to the German text". */
  skipLabel: string;
  layout?: BilingualReaderLayout;
  className?: string;
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";

export function BilingualReader({
  texts,
  switchLabel,
  skipLabel,
  layout = "auto",
  className,
}: BilingualReaderProps) {
  /*
   * React's ids carry punctuation that is legal in an id and awkward in a URL
   * fragment, and the skip link puts this one in an `href`. Stripping it keeps
   * the ids unique, since the punctuation is the same on every one of them.
   */
  const base = `bilingual-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const root = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<"pair" | "single" | null>(null);
  const [shown, setShown] = useState(texts[0].lang);

  useEffect(() => {
    if (layout !== "auto") return;
    const node = root.current;
    // No observer, no measurement: the container query below still lays the
    // two texts out by width, and both stay readable, which is the safe side.
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) return;
      setMeasured(width >= PAIR_FROM ? "pair" : "single");
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [layout]);

  /*
   * `null` until measured, which includes the server render. Until then both
   * texts are shown and a container query decides one column or two, so the
   * first paint is never two squeezed columns on a tablet, and a page whose
   * script never runs still shows both texts in full.
   */
  const mode = layout === "auto" ? measured : layout;
  const single = mode === "single";
  const secondId = `${base}-1`;

  return (
    <div ref={root} className={cn("@container flex flex-col gap-4", className)}>
      <div hidden={!single}>
        <SegmentedControl
          label={switchLabel}
          options={texts.map((text) => ({
            key: text.lang,
            label: <span className="font-mono">{text.badge}</span>,
            ariaLabel: text.languageName,
          }))}
          value={shown}
          onChange={setShown}
        />
      </div>

      {/*
       * Before the plate rather than inside the first article, so it takes the
       * page's language and not the article's: its words are the console's.
       */}
      {single ? null : (
        <a
          href={`#${secondId}`}
          className={cn(
            "sr-only text-m-label text-m-accent-text focus:not-sr-only focus:self-start",
            FOCUS,
          )}
        >
          {skipLabel}
        </a>
      )}

      <div
        data-m-flush=""
        className={cn(
          "grid rounded-m-panel bg-m-plate shadow-m-plate",
          AURORA_GLASS,
          AURORA_IN_SECTION,
          mode === "pair"
            ? "grid-cols-2"
            : mode === "single"
              ? "grid-cols-1"
              : "grid-cols-1 @min-[1080px]:grid-cols-2",
        )}
      >
        {texts.map((text, index) => {
          const titleId = `${base}-${index}-title`;
          return (
            <article
              key={text.lang}
              id={`${base}-${index}`}
              lang={text.lang}
              aria-labelledby={titleId}
              hidden={single && text.lang !== shown}
              // Focusable by script only, so the skip link lands inside the
              // text rather than leaving focus where it was.
              tabIndex={index === 1 ? -1 : undefined}
              className={cn(
                "min-w-0 px-7 py-6",
                FOCUS,
                index === 0 && mode === "pair" ? "border-r border-m-hairline" : "",
                index === 0 && mode === null ? "border-m-hairline @min-[1080px]:border-r" : "",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-m-hairline pb-3.5">
                <span className="rounded-[4px] border border-m-strong px-1.5 py-px font-mono text-m-micro text-m-ink">
                  {text.badge}
                </span>
                <span className="font-mono text-m-meta text-m-ink-2">{text.file}</span>
                <span className="font-mono text-m-meta tabular-nums text-m-ink-3">{text.size}</span>
              </div>
              {text.hash === undefined ? null : (
                <div className="flex flex-wrap items-center gap-2 border-b border-m-hairline py-3">
                  {text.hash}
                </div>
              )}
              <h2 id={titleId} className="mt-5 text-m-heading text-m-ink">
                {text.title}
              </h2>
              {text.intro === undefined ? null : (
                <div className="mt-3 max-w-[64ch] text-m-body text-m-ink-2">{text.intro}</div>
              )}
              <div className="mt-5 max-w-[64ch] text-m-body text-m-ink">{text.body}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
