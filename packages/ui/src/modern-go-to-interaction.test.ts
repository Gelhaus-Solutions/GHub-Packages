// @vitest-environment jsdom

/**
 * Go to, in a document.
 *
 * The sheet's contract: "/" anywhere outside a field opens it, and so does the
 * button. Focus starts in the field; Up and Down move through the options
 * across groups, Enter opens one, Escape closes and returns focus to where it
 * was. Group labels are presentational. The number of options is said once
 * results settle, and the person option is read with its audit sentence.
 * Underneath that, the modal contract: a portal, focus trapped, the page
 * behind not scrolling, a click on the scrim closing.
 *
 * VERIFIED BY MUTATION: dropping the focus restore on close, and dropping the
 * "is this a field" guard on "/", each turn this file red.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { GoTo, GoToButton, useSlashToOpen, type GoToGroup } from "./modern/go-to.js";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const RESULTS: GoToGroup[] = [
  {
    label: "Products",
    options: [
      { id: "p:gopencsr", label: "GOpenCSR", hint: "12 documents", href: "/products/gopencsr" },
    ],
  },
  { label: "Sign-ups", options: [] },
  {
    label: "Documents",
    options: [
      {
        id: "d:tos",
        label: "Terms of service",
        hint: "GOpenCSR",
        href: "/documents/gopencsr-terms",
      },
      { id: "d:api", label: "API terms", hint: "GOpenCSR, draft", href: "/documents/gopencsr-api" },
    ],
  },
  {
    label: "Versions",
    options: [
      {
        id: "v:2026-10-01",
        label: "gopencsr-terms-2026-10-01",
        href: "/versions/gopencsr-terms-2026-10-01",
        mono: true,
      },
    ],
  },
];

interface Seen {
  chosen: string[];
  closes: number;
}

function Console({ seen }: { seen: Seen }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useSlashToOpen(() => {
    setOpen(true);
  });
  const isPerson = query.includes("@");
  const groups = query === "" || isPerson ? [] : RESULTS;
  const count = groups.reduce((sum, group) => sum + group.options.length, 0);
  return createElement("div", null, [
    createElement("input", { key: "field", "aria-label": "Notes" }),
    // jsdom focuses a contenteditable region only with a tabindex.
    createElement("div", {
      key: "editable",
      contentEditable: true,
      tabIndex: 0,
      "aria-label": "Editor",
    }),
    createElement(GoToButton, {
      key: "button",
      label: "Go to",
      shortcut: "/",
      onOpen: () => {
        setOpen(true);
      },
    }),
    createElement(GoTo, {
      key: "dialog",
      open,
      onClose: () => {
        seen.closes += 1;
        setOpen(false);
        setQuery("");
      },
      title: "Go to",
      inputLabel: "Go to",
      placeholder: "Product, document or version",
      query,
      onQueryChange: setQuery,
      groups,
      person: isPerson
        ? {
            label: "Look up this person",
            hint: "Recorded in the audit log under your name",
            href: `/people/${query}`,
          }
        : null,
      status:
        query === ""
          ? ""
          : count === 0
            ? "No product, document or version matches."
            : `${String(count)} matches`,
      emptyLabel: "No product, document or version matches.",
      onChoose: ({ href }) => {
        seen.chosen.push(href);
      },
    }),
  ]);
}

function setup() {
  const seen: Seen = { chosen: [], closes: 0 };
  const user = userEvent.setup();
  render(createElement(Console, { seen }));
  return { seen, user };
}

function field(): HTMLElement {
  return screen.getByRole("combobox", { name: "Go to" });
}

function active(): string {
  const id = field().getAttribute("aria-activedescendant");
  return id === null ? "" : (document.getElementById(id)?.textContent ?? "");
}

describe("opening Go to", () => {
  it("from the button: a named modal dialog, in the body, with focus in the field", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Go to" }));
    const dialog = screen.getByRole("dialog", { name: "Go to" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(field());
    expect(document.body.style.overflow).toBe("hidden");
  });

  it('from "/" pressed outside a field', async () => {
    const { user } = setup();
    await user.keyboard("/");
    expect(screen.getByRole("dialog", { name: "Go to" })).toBeTruthy();
    // The slash opened the dialog and was not typed into it.
    expect(field()).toHaveProperty("value", "");
  });

  it('not from "/" typed into a field or an editable region, or with a modifier', async () => {
    const { user } = setup();
    await user.click(screen.getByRole("textbox", { name: "Notes" }));
    await user.keyboard("/");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveProperty("value", "/");

    // A contenteditable region has no role of its own to be found by.
    const editor = document.querySelector<HTMLElement>('[aria-label="Editor"]');
    editor?.focus();
    expect(document.activeElement).toBe(editor);
    await user.keyboard("/");
    expect(screen.queryByRole("dialog")).toBeNull();

    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}/{/Control}");
    await user.keyboard("{Meta>}/{/Meta}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("not while another modal is open", async () => {
    const { user } = setup();
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("aria-modal", "true");
    document.body.append(other);
    await user.keyboard("/");
    expect(screen.queryByRole("dialog", { name: "Go to" })).toBeNull();
    other.remove();
  });
});

describe("moving and choosing", () => {
  it("moves across every group with Up and Down, wrapping at the ends", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr");
    expect(active()).toBe("GOpenCSR 12 documents");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("Terms of service GOpenCSR");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toBe("gopencsr-terms-2026-10-01");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("GOpenCSR 12 documents");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("gopencsr-terms-2026-10-01");
  });

  it("marks the active option selected, and only that one", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr{ArrowDown}");
    const selected = screen
      .getAllByRole("option")
      .filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected.map((o) => o.textContent)).toEqual(["Terms of service GOpenCSR"]);
  });

  it("opens the active option on Enter, through the caller", async () => {
    const { user, seen } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr{ArrowDown}{ArrowDown}{Enter}");
    expect(seen.chosen).toEqual(["/documents/gopencsr-api"]);
  });

  it("opens an option on a click", async () => {
    const { user, seen } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr");
    await user.click(screen.getByRole("option", { name: /^API terms/ }));
    expect(seen.chosen).toEqual(["/documents/gopencsr-api"]);
    expect(document.activeElement).toBe(field());
  });

  it("sets an id in mono", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr");
    const version = screen.getByText("gopencsr-terms-2026-10-01");
    expect(version.className).toContain("font-mono");
  });
});

describe("groups and the person", () => {
  it("names each group and hides its visible label, which is not an option", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr");
    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Products",
      "Documents",
      "Versions",
    ]);
    for (const group of groups) {
      expect(group.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("offers the person lookup as an option read with its audit sentence, and the empty sentence", async () => {
    const { user, seen } = setup();
    await user.keyboard("/");
    await user.keyboard("jonas.weber@example.com");
    const person = screen.getByRole("option", {
      name: "Look up this person Recorded in the audit log under your name",
    });
    expect(person.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByText("No product, document or version matches.", { selector: "p:not([role])" }),
    ).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(seen.chosen).toEqual(["/people/jonas.weber@example.com"]);
  });

  it("says nothing is matched only once something was asked", async () => {
    const { user } = setup();
    await user.keyboard("/");
    expect(screen.queryByText("No product, document or version matches.")).toBeNull();
  });
});

describe("the status", () => {
  it("is one polite region in the dialog, saying what the caller settled on", async () => {
    const { user } = setup();
    await user.keyboard("/");
    const dialog = screen.getByRole("dialog");
    const regions = dialog.querySelectorAll('[role="status"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.textContent).toBe("");
    await user.keyboard("gopencsr");
    expect(regions[0]?.textContent).toBe("4 matches");
  });
});

describe("closing Go to", () => {
  it("on Escape, returning focus to where it was and the page its scroll", async () => {
    const { user, seen } = setup();
    const button = screen.getByRole("button", { name: "Go to" });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(seen.closes).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(document.body.style.overflow).toBe("");
  });

  it("on a click on the scrim, but not on one inside the panel", async () => {
    const { user, seen } = setup();
    await user.keyboard("/");
    await user.click(field());
    expect(seen.closes).toBe(0);
    const scrim = screen.getByRole("dialog").parentElement as HTMLElement;
    await user.click(scrim);
    expect(seen.closes).toBe(1);
  });

  it("keeps Tab inside: the field is the only stop", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.tab();
    expect(document.activeElement).toBe(field());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(field());
  });

  it("puts the keyboard back on the first option when the results change", async () => {
    const { user } = setup();
    await user.keyboard("/");
    await user.keyboard("gopencsr{ArrowDown}{ArrowDown}");
    expect(active()).toBe("API terms GOpenCSR, draft");
    act(() => {
      field().blur();
    });
    await user.click(field());
    await user.keyboard("{Backspace>8/}");
    await user.keyboard("x");
    expect(active()).toBe("GOpenCSR 12 documents");
  });
});
