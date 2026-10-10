import { useId, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS, AURORA_IN_SECTION } from "./aurora.js";

/**
 * Where a previewed mail stands. Only `loading` and `test-failed` change what
 * is drawn; the other two differ in the caption's words, which are the caller's.
 */
export type MailPreviewState = "loading" | "previewed" | "test-sent" | "test-failed";

/**
 * The header field names, from the caller. They read like protocol, and they
 * are still words on a screen: a German console may well say "Betreff".
 */
export interface MailPreviewHeaderLabels {
  from: string;
  replyTo: string;
  subject: string;
  messageId: string;
}

/**
 * A plain-text mail, shown exactly as it is sent. Drawn for the GPlatform Terms
 * staff console, where a notice of new terms is a legal letter and the person
 * approving it has to see the letter, not a rendering of it.
 *
 * **The body is a `pre` and nothing reflows it.** The mail is wrapped at 72
 * characters when it is composed, so the measure here is 72ch and the text
 * breaks only where the mail breaks. A line longer than that (a link, usually)
 * scrolls sideways rather than wrapping, because a soft wrap would show a line
 * break the recipient never gets. That is also why the `pre` is focusable: a
 * region that scrolls has to be reachable by keyboard to be scrolled by one,
 * and it is named by the caption so the stop announces what it holds.
 *
 * **The headers are data, so they are a `dl`.** From, Reply-To, Subject and,
 * once a mail has really left, its Message-ID: the fields a person compares
 * against what arrived in their own client, set in mono because they are
 * compared character by character.
 *
 * **Language is marked where the language is.** The subject and the body carry
 * `lang`, so a German variant is read by a German voice; the field names stay
 * in the page's language because they are the console's words, not the mail's.
 */
export interface MailPreviewProps {
  /** The From line as sent, display name and address: `GPlatform <notices@example.org>`. */
  from: string;
  replyTo?: string;
  subject: string;
  /** Only for a mail that has left. A preview has no Message-ID and must not invent one. */
  messageId?: string;
  headerLabels: MailPreviewHeaderLabels;
  /** The language of the subject and the body, as a BCP 47 tag: `en`, `de`. */
  lang: string;
  /**
   * The text exactly as sent. Absent while `state` is `loading`: the headers
   * are known before the body is rendered, so they are drawn and the body waits.
   */
  body?: string;
  /**
   * Names the figure and the scrolling region. The proposal draws "V1 · English
   * · 9 addresses · previewed"; the preview screen draws the plain-text promise
   * instead. Either way it is one sentence from the caller, because which of
   * those a screen needs is the screen's call.
   */
  caption: ReactNode;
  state: MailPreviewState;
  /** Shown in place of the body while it is being rendered. */
  loadingText?: ReactNode;
  /**
   * The caller's `Refusal`, shown under the mail when `state` is `test-failed`
   * and ignored otherwise. It names the next step, which a failed test send
   * always has: send it again.
   */
  failure?: ReactNode;
  className?: string;
}

export function MailPreview({
  from,
  replyTo,
  subject,
  messageId,
  headerLabels,
  lang,
  body,
  caption,
  state,
  loadingText,
  failure,
  className,
}: MailPreviewProps) {
  const captionId = `${useId()}-caption`;
  const loading = state === "loading";

  const header = (label: string, value: string, valueLang?: string) => (
    <div className="contents">
      <dt className="text-m-ink-3">{label}</dt>
      {/*
       * `min-w-0` and `break-words` so a Message-ID, which has no spaces in it,
       * wraps inside its column instead of pushing the figure wider than the
       * screen. A header value is not the body: wrapping it changes nothing
       * anybody compares.
       */}
      <dd lang={valueLang} className="min-w-0 break-words text-m-ink">
        {value}
      </dd>
    </div>
  );

  return (
    <div className={className}>
      {/*
       * Not `overflow-hidden`, although the drawing clips the figure. Nothing
       * inside has a fill to clip at the corners, and clipping would cut the
       * focus ring of the `pre`, which sits flush with the figure's left edge.
       */}
      <figure
        data-m-flush=""
        className={cn("rounded-m-panel bg-m-plate shadow-m-plate", AURORA_GLASS, AURORA_IN_SECTION)}
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-b border-m-hairline px-5 py-3.5 font-mono text-m-meta aurora:px-[18px] aurora:py-3 aurora:leading-[19px]">
          {header(headerLabels.from, from)}
          {replyTo === undefined ? null : header(headerLabels.replyTo, replyTo)}
          {header(headerLabels.subject, subject, lang)}
          {messageId === undefined ? null : header(headerLabels.messageId, messageId)}
        </dl>
        {/*
         * `box-content` so the 72ch is the TEXT measure. Under the border-box
         * sizing every Tailwind page has, a 72ch box with 20px of padding holds
         * about 67 characters and every full line of the mail would scroll.
         */}
        <pre
          lang={lang}
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
          aria-busy={loading ? true : undefined}
          className={cn(
            "box-content max-w-[72ch] overflow-x-auto p-5 font-mono text-m-meta whitespace-pre text-m-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
          )}
        >
          {loading ? (
            <span className="font-sans whitespace-normal text-m-ink-3">{loadingText}</span>
          ) : (
            body
          )}
        </pre>
        <figcaption
          id={captionId}
          className="border-t border-m-hairline px-5 py-3 text-m-meta text-m-ink-3"
        >
          {caption}
        </figcaption>
      </figure>
      {/*
       * A live region that exists before the failure does, so a test send that
       * fails while somebody is on the screen is announced, politely, without
       * moving their focus. Empty, it takes no room: the gap is on the content.
       */}
      <div role="status">
        {state === "test-failed" && failure !== undefined ? (
          <div className="mt-4">{failure}</div>
        ) : null}
      </div>
    </div>
  );
}
