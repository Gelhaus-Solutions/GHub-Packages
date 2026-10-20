// @vitest-environment jsdom

/**
 * FormDialog's and LeaveGuard's contracts, in a document.
 *
 * FormDialog: focus starts on the first field and goes back to what opened it,
 * Escape and the scrim close it, and neither does while it is not dismissible
 * (typed input inside); its close button always does.
 *
 * LeaveGuard: while the form is dirty, a click on a link that would leave the
 * page is held and asked about, Stay first; Leave goes where the link pointed,
 * Discard drops the kept copy first. Clean, or a link that opens elsewhere or
 * stays on the page, goes through untouched.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormDialog } from "./modern/form-dialog.js";
import { LeaveGuard, type LeaveGuardLabels } from "./modern/leave-guard.js";

// jsdom does not navigate; a link nobody held would only log that it cannot.
function stopNavigation(event: MouseEvent) {
  event.preventDefault();
}
beforeEach(() => {
  document.addEventListener("click", stopNavigation);
});
afterEach(() => {
  document.removeEventListener("click", stopNavigation);
  cleanup();
});

function Opener({ dismissible = true, onClose }: { dismissible?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setOpen(true) }, "Add a party"),
    createElement(FormDialog, {
      open,
      onClose: () => {
        onClose?.();
        setOpen(false);
      },
      title: "Add a party",
      description: "It is chosen once added.",
      closeLabel: "Close",
      dismissible,
      footer: createElement("button", { type: "button" }, "Add it"),
      children: createElement(
        "label",
        null,
        "Legal name",
        createElement("input", { name: "legalName" }),
      ),
    }),
  );
}

describe("FormDialog", () => {
  it("starts on the first field, closes on Escape, and hands focus back", async () => {
    const user = userEvent.setup();
    render(createElement(Opener));
    const opener = screen.getByRole("button", { name: "Add a party" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Add a party" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Legal name" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside", async () => {
    const user = userEvent.setup();
    render(createElement(Opener));
    await user.click(screen.getByRole("button", { name: "Add a party" }));
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("is not closed by Escape or the scrim while it holds typed input, only by its own buttons", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(createElement(Opener, { dismissible: false, onClose }));
    await user.click(screen.getByRole("button", { name: "Add a party" }));
    await user.keyboard("{Escape}");
    const dialog = screen.getByRole("dialog");
    const scrim = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(scrim);
    fireEvent.mouseUp(scrim);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never submits the form it was opened from", async () => {
    const user = userEvent.setup();
    const outer = vi.fn((event: Event) => {
      event.preventDefault();
    });
    const inner = vi.fn((event: Event) => {
      event.preventDefault();
    });
    render(
      createElement(
        "form",
        { onSubmit: (event: { nativeEvent: Event }) => outer(event.nativeEvent) },
        createElement(FormDialog, {
          open: true,
          onClose: () => undefined,
          title: "Add a party",
          footer: createElement("button", { type: "submit", form: "party" }, "Add it"),
          children: createElement(
            "form",
            { id: "party", onSubmit: (event: { nativeEvent: Event }) => inner(event.nativeEvent) },
            createElement("input", { name: "legalName", "aria-label": "Legal name" }),
          ),
        }),
      ),
    );
    // Enter in the popup's field submits the popup's form (the foot's button names it by `form`).
    await user.type(screen.getByRole("textbox", { name: "Legal name" }), "Kestrel{Enter}");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("closes on a click that starts and ends on the scrim, not on a drag out of the panel", async () => {
    const user = userEvent.setup();
    render(createElement(Opener));
    await user.click(screen.getByRole("button", { name: "Add a party" }));
    const dialog = screen.getByRole("dialog");
    const scrim = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(dialog);
    fireEvent.mouseUp(scrim);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.mouseDown(scrim);
    fireEvent.mouseUp(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

const LABELS: LeaveGuardLabels = {
  title: (href) => `Leave the new agreement for ${href}?`,
  body: "Nothing is made until you create the draft.",
  stay: "Stay and finish",
  leave: "Leave, keep it for later",
  discard: "Discard it and leave",
};

function Page({
  dirty,
  navigate,
  onDiscard,
}: {
  dirty: boolean;
  navigate: (href: string) => void;
  onDiscard: () => void;
}) {
  return createElement(
    "div",
    null,
    createElement("a", { href: "/parties" }, "Parties"),
    createElement("a", { href: "/parties", target: "_blank" }, "Parties in a new tab"),
    createElement("a", { href: "#kind" }, "Kind"),
    createElement(LeaveGuard, { dirty, labels: LABELS, navigate, onDiscard }),
  );
}

describe("LeaveGuard", () => {
  it("lets every link through while the form is clean", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(createElement(Page, { dirty: false, navigate, onDiscard: vi.fn() }));
    await user.click(screen.getByRole("link", { name: "Parties" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("holds a link that would leave a dirty form and asks, starting on Stay", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(createElement(Page, { dirty: true, navigate, onDiscard: vi.fn() }));
    await user.click(screen.getByRole("link", { name: "Parties" }));
    const question = screen.getByRole("alertdialog", {
      name: "Leave the new agreement for /parties?",
    });
    expect(question).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stay and finish" }));
    await user.click(screen.getByRole("button", { name: "Stay and finish" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves where the link pointed, and drops the kept copy first when discarding", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onDiscard = vi.fn();
    render(createElement(Page, { dirty: true, navigate, onDiscard }));
    await user.click(screen.getByRole("link", { name: "Parties" }));
    await user.click(screen.getByRole("button", { name: "Leave, keep it for later" }));
    expect(navigate).toHaveBeenLastCalledWith("/parties");
    expect(onDiscard).not.toHaveBeenCalled();

    await user.click(screen.getByRole("link", { name: "Parties" }));
    await user.click(screen.getByRole("button", { name: "Discard it and leave" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("lets a new tab, a modifier click and a place on this page through", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(createElement(Page, { dirty: true, navigate, onDiscard: vi.fn() }));
    await user.click(screen.getByRole("link", { name: "Parties in a new tab" }));
    await user.click(screen.getByRole("link", { name: "Kind" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Parties" }), { metaKey: true });
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
