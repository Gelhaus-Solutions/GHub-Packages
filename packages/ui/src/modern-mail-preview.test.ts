/**
 * MailPreview's markup contract: a figure, the headers as data, the body as a
 * `pre` that nothing reflows, and the four states.
 *
 * Whether the `pre` is really reachable by Tab and announced by its caption is
 * asked of a document in `modern-mail-preview-interaction.test.ts`; here the
 * attributes that make it so are pinned.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MailPreview, type MailPreviewProps } from "./modern/mail-preview.js";

const BODY = [
  "Hello,",
  "",
  "you are receiving this because you have an account with GAdvisory.",
  "Read it: https://example.org/a/very/long/link/that/runs/past/seventy-two/characters/on/purpose",
].join("\n");

const BASE: MailPreviewProps = {
  from: "GPlatform <notices@example.org>",
  replyTo: "contact@example.org",
  subject: "[TEST] Changes to our privacy notice",
  headerLabels: { from: "From", replyTo: "Reply-To", subject: "Subject", messageId: "Message-ID" },
  lang: "en",
  body: BODY,
  caption: "V1 · English · 9 addresses · previewed",
  state: "previewed",
};

function render(extra: Partial<MailPreviewProps> = {}): string {
  return renderToStaticMarkup(createElement(MailPreview, { ...BASE, ...extra }));
}

function pre(html: string): string {
  return /<pre[^>]*>/.exec(html)?.[0] ?? "";
}

describe("MailPreview", () => {
  it("is a figure whose caption is the caller's", () => {
    const html = render();
    expect(html).toMatch(/^<div[^>]*><figure/);
    expect(html).toMatch(/<figcaption[^>]*>V1 · English · 9 addresses · previewed<\/figcaption>/);
  });

  it("gives the headers as a description list, in the order a mail client shows them", () => {
    const html = render({ messageId: "<20261014070012.m_7Q2M9K@example.org>" });
    const terms = Array.from(html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g), (m) => m[1]);
    expect(terms).toEqual(["From", "Reply-To", "Subject", "Message-ID"]);
    expect(html).toContain("&lt;20261014070012.m_7Q2M9K@example.org&gt;");
    expect(html).toMatch(/<dl[^>]*font-mono/);
  });

  it("leaves out Message-ID for a preview, which has none, and Reply-To when there is none", () => {
    const html = render({ replyTo: undefined });
    const terms = Array.from(html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g), (m) => m[1]);
    expect(terms).toEqual(["From", "Subject"]);
  });

  it("shows the body exactly as sent, with nothing that reflows it", () => {
    const html = render();
    const tag = pre(html);
    /*
     * `whitespace-pre`, not `pre-wrap`: the mail is wrapped when it is
     * composed, so a soft wrap here would draw a line break nobody receives.
     */
    expect(tag).toContain("whitespace-pre");
    expect(tag).not.toContain("pre-wrap");
    expect(tag).toContain("max-w-[72ch]");
    // The measure is the text's, not the padded box's.
    expect(tag).toContain("box-content");
    expect(tag).toContain("overflow-x-auto");
    expect(html).toContain("https://example.org/a/very/long/link/that/runs/past/seventy-two");
    expect(html).toContain("Hello,\n\nyou are receiving this");
  });

  it("makes the body a focusable region named by the caption", () => {
    const html = render();
    const tag = pre(html);
    expect(tag).toContain('tabindex="0"');
    expect(tag).toContain('role="region"');
    const labelledBy = /aria-labelledby="([^"]*)"/.exec(tag)?.[1] ?? "";
    expect(labelledBy).not.toBe("");
    expect(html).toContain(`<figcaption id="${labelledBy}"`);
  });

  it("marks a German mail's subject and body as German, and not the field names", () => {
    const html = render({ lang: "de", subject: "Änderungen an unseren Datenschutzhinweisen" });
    expect(pre(html)).toContain('lang="de"');
    expect(html).toMatch(/<dd lang="de"[^>]*>Änderungen an unseren Datenschutzhinweisen<\/dd>/);
    expect(html).not.toMatch(/<dt[^>]*lang=/);
    expect(html).not.toMatch(/<dd lang="de"[^>]*>GPlatform/);
  });

  it("draws the headers while loading and holds the body back, busy", () => {
    const html = render({ state: "loading", body: undefined, loadingText: "Rendering the mail." });
    expect(html).toContain(">From</dt>");
    expect(html).toContain(">Subject</dt>");
    expect(pre(html)).toContain('aria-busy="true"');
    expect(html).toContain("Rendering the mail.");
    expect(html).not.toContain("Hello,");
  });

  it("is not busy once the body is there", () => {
    expect(pre(render())).not.toContain("aria-busy");
    expect(pre(render({ state: "test-sent" }))).not.toContain("aria-busy");
  });

  it("shows the caller's refusal under the mail only when the test send failed", () => {
    const refusal = createElement("div", null, "The test send of V3 did not arrive.");
    expect(render({ failure: refusal })).not.toContain("did not arrive");
    expect(render({ state: "test-sent", failure: refusal })).not.toContain("did not arrive");

    const failed = render({ state: "test-failed", failure: refusal });
    expect(failed).toContain("did not arrive");
    // After the figure, not inside it.
    expect(failed.indexOf("did not arrive")).toBeGreaterThan(failed.indexOf("</figure>"));
  });

  it("keeps the live region for a failure present, and empty, before anything fails", () => {
    /*
     * A region inserted together with its message is not announced by most
     * screen readers, so it exists, empty and without room, from the start.
     */
    expect(render()).toContain('<div role="status"></div>');
    expect(render({ state: "test-failed", failure: "Refused" })).toMatch(
      /<div role="status"><div class="mt-4">Refused<\/div><\/div>/,
    );
  });

  it("does not clip the figure, so the body's focus ring is not cut off", () => {
    const figure = /<figure[^>]*>/.exec(render())?.[0] ?? "";
    expect(figure).not.toContain("overflow-hidden");
    expect(pre(render())).toContain("focus-visible:outline-offset-2");
  });
});
