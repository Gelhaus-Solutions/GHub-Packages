// @vitest-environment jsdom

/**
 * The first test in this repository that can observe focus.
 *
 * Until this file, GControl had no jsdom, no happy-dom and no testing-library
 * in any package, so every keyboard and focus contract in the design system was
 * a sentence in a docblock and nothing else. `modern-components.test.ts` renders
 * through `renderToStaticMarkup`, which produces a STRING: it can prove that
 * `aria-expanded` is written and can never prove that anything moved.
 *
 * The environment is set per file rather than in `vitest.config.ts`, so the
 * fourteen existing suites keep running in `node`. They are markup and logic
 * tests and a DOM would only slow them down; this one needs a document and says
 * so at the top of itself.
 *
 * `Disclosure` is first because its docblock makes four claims that are exactly
 * the kind nothing here could check, and one of them ("a half-typed note
 * survives being closed and reopened") is the failure it says makes a person
 * stop trusting the control.
 *
 * VERIFIED BY MUTATION, NOT BY READING, and the first pass was wrong.
 *
 * Every assertion here was checked by breaking `disclosure.tsx` and confirming
 * the suite goes red, because a green interaction test proves nothing until it
 * has been seen to fail.
 *
 *   drop `first?.focus()`               2 fail
 *   unmount instead of `hidden`         1 fail
 *   drop the `!wasOpen.current` guard   1 fail, the mount test
 *   remove the `[open]` dependency      ALL PASS
 *   both of the last two together       2 fail
 *
 * The fourth line is the interesting one. My first draft of this file had a
 * test named "does not drag focus back when it re-renders while already open"
 * and a confident comment explaining why two input fields were needed to catch
 * it. It caught nothing: dropping the transition guard does not make the effect
 * run on a re-render, because `[open]` already stops that, so the mutation I
 * wrote to prove the test worked sailed straight through it.
 *
 * What the guard actually forbids is the MOUNT: a disclosure rendered open on
 * first paint would pull focus out of whatever the reader was doing, on page
 * load, with no transition at all. That contract had no test, and the
 * explanation I had written for the test I did have was an explanation of
 * something the component does not do.
 *
 * The re-render test stays, and the last line is why it is worth keeping: the
 * dependency array and the ref are two independent protections and EITHER ONE
 * alone holds the line, so no single mutation can make that test fail. It pins
 * the behaviour rather than whichever mechanism currently delivers it, which is
 * what it should have been asserting all along.
 *
 * WHAT THIS FILE DOES NOT DO. It does not assert that the focus ring is
 * visible, which is a paint question jsdom cannot answer: jsdom has no layout,
 * so `:focus-visible`, contrast and anything reading a box are still uncovered
 * here and still belong to the consuming consoles' axe runs and to
 * `contrast.test.ts`. A DOM test that claimed those would be worse than none.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Disclosure } from "./modern/disclosure.js";

/*
 * Explicit, because this package does not enable vitest `globals` and
 * testing-library only registers its automatic cleanup when it can see a global
 * `afterEach`. Without this the suites share a document and the second render
 * of the same label finds two nodes.
 */
afterEach(cleanup);

/** The component is controlled, so the state a real caller owns lives here. */
function Harness({ label = "Re-authenticate" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return createElement(Disclosure, {
    label,
    open,
    onOpenChange: setOpen,
    children: createElement("input", { type: "text", "aria-label": "Password" }),
  });
}

describe("Disclosure moves focus, and only on the transition", () => {
  it("puts focus on the first field when it opens", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    const field = screen.getByLabelText("Password");
    expect(document.activeElement).not.toBe(field);

    await user.click(screen.getByRole("button", { name: "Re-authenticate" }));

    expect(document.activeElement).toBe(field);
  });

  it("does not steal focus from the page when it is already open on mount", async () => {
    /*
     * THE CLAIM THE `wasOpen` REF ACTUALLY CARRIES, and it took a surviving
     * mutation to find it. Dropping that guard does NOT make the effect run on
     * every render, because the dependency array is `[open]` and React will not
     * re-run it while `open` is unchanged. What the guard forbids is the mount:
     * a disclosure rendered open on first paint would otherwise pull focus out
     * of whatever the reader was doing, on page load, with no transition having
     * happened at all.
     *
     * Written as a separate component rather than a prop on `Harness` because
     * the whole point is the FIRST render, so `open` has to be true before the
     * tree exists.
     */
    function OpenOnMount() {
      return createElement(Disclosure, {
        label: "Already open",
        open: true,
        onOpenChange: () => {},
        children: createElement("input", { type: "text", "aria-label": "Inner" }),
      });
    }

    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    render(createElement(OpenOnMount, {}));

    expect(document.activeElement).toBe(outside);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Inner"));
    outside.remove();
  });

  it("does not drag focus back when it re-renders while already open", async () => {
    const user = userEvent.setup();
    /*
     * Two fields, because the defect this guards against is invisible with one:
     * if the effect ran on every render it would move focus to the FIRST field,
     * and with a single field that is where focus already is. The assertion
     * would pass at the moment of the defect, which is the shape that has cost
     * this repository the most today.
     */
    function Two({ label }: { label: string }) {
      const [open, setOpen] = useState(false);
      return createElement(Disclosure, {
        label,
        open,
        onOpenChange: setOpen,
        children: [
          createElement("input", { key: "a", type: "text", "aria-label": "First" }),
          createElement("input", { key: "b", type: "text", "aria-label": "Second" }),
        ],
      });
    }

    const view = render(createElement(Two, { label: "Open" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(document.activeElement).toBe(screen.getByLabelText("First"));

    const second = screen.getByLabelText("Second");
    second.focus();
    expect(document.activeElement).toBe(second);

    // A re-render with `open` unchanged. The effect must not fire.
    view.rerender(createElement(Two, { label: "Open still" }));

    expect(document.activeElement).toBe(second);
  });
});

describe("Disclosure keeps what somebody typed", () => {
  it("still holds a half-typed note after a close and a reopen", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));
    const trigger = screen.getByRole("button", { name: "Re-authenticate" });

    await user.click(trigger);
    await user.type(screen.getByLabelText("Password"), "half a sentence");
    expect(screen.getByLabelText<HTMLInputElement>("Password").value).toBe("half a sentence");

    await user.click(trigger);
    await user.click(trigger);

    expect(screen.getByLabelText<HTMLInputElement>("Password").value).toBe("half a sentence");
  });

  it("hides the panel rather than unmounting it", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));
    const trigger = screen.getByRole("button", { name: "Re-authenticate" });

    /*
     * Asserted as "present AND hidden" rather than "not visible". A query that
     * only asked for absence would pass just as well if the node were
     * unmounted, which is the behaviour this is here to forbid.
     */
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel?.hasAttribute("hidden")).toBe(true);

    await user.click(trigger);
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
