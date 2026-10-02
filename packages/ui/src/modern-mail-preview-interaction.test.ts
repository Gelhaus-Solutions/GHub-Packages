// @vitest-environment jsdom

/**
 * MailPreview's keyboard contract, observed in a document: the body is a Tab
 * stop, it is a region, and its accessible name is the caption. A long mail
 * that scrolls has to be reachable by keyboard to be scrolled by one, and the
 * markup test can only show the attributes that are supposed to make it so.
 *
 * Plus the failure: it lands in a live region that was already there.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MailPreview, type MailPreviewProps } from "./modern/mail-preview.js";

afterEach(cleanup);

const BASE: MailPreviewProps = {
  from: "GPlatform <notices@example.org>",
  subject: "Changes to our privacy notice",
  headerLabels: { from: "From", replyTo: "Reply-To", subject: "Subject", messageId: "Message-ID" },
  lang: "en",
  body: "Hello,\n\nyou are receiving this because you have an account.",
  caption: "V1 · English · 9 addresses · previewed",
  state: "previewed",
};

describe("MailPreview's body can be reached and scrolled by keyboard", () => {
  it("is a region named by the caption", () => {
    render(createElement(MailPreview, BASE));
    const region = screen.getByRole("region", { name: "V1 · English · 9 addresses · previewed" });
    expect(region.tagName).toBe("PRE");
    expect(region.textContent).toContain("you are receiving this");
  });

  it("is a Tab stop, the first one in a preview with nothing else to press", async () => {
    const user = userEvent.setup();
    render(createElement(MailPreview, BASE));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("region"));
  });

  it("stays a Tab stop while the body is still loading", async () => {
    /*
     * The stop does not appear and disappear with the body, so focus order on
     * the screen is the same before and after the text arrives.
     */
    const user = userEvent.setup();
    render(
      createElement(MailPreview, {
        ...BASE,
        state: "loading",
        body: undefined,
        loadingText: "Rendering the mail.",
      }),
    );
    await user.tab();
    const region = screen.getByRole("region");
    expect(document.activeElement).toBe(region);
    expect(region.getAttribute("aria-busy")).toBe("true");
  });

  it("puts a failed test send into the live region that was waiting for it", () => {
    const view = render(createElement(MailPreview, { ...BASE, state: "test-sent" }));
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");

    view.rerender(
      createElement(MailPreview, {
        ...BASE,
        state: "test-failed",
        failure: createElement("p", null, "The test send of V3 did not arrive."),
      }),
    );
    // The same node, so a screen reader that was watching it hears the change.
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toBe("The test send of V3 did not arrive.");
  });
});
