// @vitest-environment jsdom

/**
 * WorkspacePicker's and RecordPager's contracts, in a document.
 *
 * The picker: the button says where the reader is and whether the list is
 * open; places are links grouped by kind, the current one marked; a search
 * field appears only past eight places and filters by name or line; the arrows
 * walk the field and the rows, Escape closes and gives focus back, and a click
 * outside closes. The pager: the position in words, links for the neighbours
 * that exist, and a disabled stand-in for one that does not.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RecordPager } from "./modern/record-pager.js";
import { WorkspacePicker, type WorkspacePlace } from "./modern/workspace-picker.js";

afterEach(() => {
  cleanup();
});

const LABELS = {
  open: "Switch place",
  search: "Find a place",
  empty: "No place matches",
  kinds: {
    account: "Your account",
    organisation: "Organisations",
    group: "Groups",
    staff: "Staff",
  },
  staff: "STAFF",
};

const FEW: WorkspacePlace[] = [
  {
    key: "account",
    kind: "account",
    name: "Thomas Weber",
    line: "thomas@nordwind.de",
    href: "/account",
    tintKey: "id_1",
  },
  {
    key: "org:nordwind",
    kind: "organisation",
    name: "Nordwind Treuhand",
    line: "Owner",
    href: "/org/nordwind",
  },
  {
    key: "group:nordwind",
    kind: "group",
    name: "Nordwind Gruppe",
    line: "Owner",
    href: "/enterprises/nordwind",
  },
  { key: "staff", kind: "staff", name: "Gelhaus Solutions", line: "Staff, admin", href: "/staff" },
];

const MANY: WorkspacePlace[] = [
  ...FEW,
  ...[
    "Elbe Kanzlei",
    "Hafen Steuer",
    "Alster Recht",
    "Moor Revision",
    "Geest Partner",
    "Marsch Beratung",
  ].map((name, at) => ({
    key: `org:${String(at)}`,
    kind: "organisation" as const,
    name,
    line: "Member",
    href: `/org/${String(at)}`,
  })),
];

const link = (props: { href: string; className: string; children: ReactNode }) =>
  createElement("a", props);

function picker(places: WorkspacePlace[], current = "org:nordwind") {
  return createElement(
    "div",
    null,
    createElement(WorkspacePicker, { places, current, labels: LABELS, render: link }),
    createElement("button", { type: "button" }, "Elsewhere"),
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  });
}

describe("WorkspacePicker", () => {
  it("says where the reader is and opens a list of links grouped by kind", async () => {
    const user = userEvent.setup();
    render(picker(FEW));
    const button = screen.getByRole("button", { name: /Switch place:\s*Nordwind Treuhand/u });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    await user.click(button);
    await settle();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "Groups" })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    const here = screen.getByRole("link", { name: /Nordwind Treuhand/u });
    expect(here.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("link", { name: /Gelhaus Solutions/u }).getAttribute("aria-current"),
    ).toBeNull();
    // Eight or fewer places: no field, focus on the current row.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.activeElement).toBe(here);
  });

  it("walks the rows with the arrows and gives focus back on Escape", async () => {
    const user = userEvent.setup();
    render(picker(FEW, "account"));
    const button = screen.getByRole("button", { name: /Switch place/u });
    button.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /Thomas Weber/u }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /Nordwind Treuhand/u }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /Gelhaus Solutions/u }));
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.activeElement).toBe(button);
  });

  it("offers a search past eight places, which filters by name and line", async () => {
    const user = userEvent.setup();
    render(picker(MANY));
    await user.click(screen.getByRole("button", { name: /Switch place/u }));
    await settle();
    const field = screen.getByRole("searchbox", { name: "Find a place" });
    expect(document.activeElement).toBe(field);
    await user.type(field, "elbe");
    expect(screen.getAllByRole("link").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Elbe Kanzlei"),
    ]);
    await user.clear(field);
    await user.type(field, "zzz");
    expect(screen.getByRole("status").textContent).toBe("No place matches");
  });

  it("closes when focus or a click leaves it", async () => {
    const user = userEvent.setup();
    render(picker(FEW));
    await user.click(screen.getByRole("button", { name: /Switch place/u }));
    await settle();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("RecordPager", () => {
  const labels = {
    nav: "Requests",
    position: (position: number, total: number) => `${String(position)} of ${String(total)}`,
    previous: "Previous request",
    next: "Next request",
  };

  it("names its position and links the neighbours that exist", () => {
    render(
      createElement(RecordPager, {
        position: 3,
        total: 9,
        previous: "/r/2",
        next: "/r/4",
        labels,
        render: link,
      }),
    );
    const nav = screen.getByRole("navigation", { name: "Requests" });
    expect(nav.textContent).toContain("3 of 9");
    expect(screen.getByRole("link", { name: "Previous request" }).getAttribute("href")).toBe(
      "/r/2",
    );
    expect(screen.getByRole("link", { name: "Next request" }).getAttribute("href")).toBe("/r/4");
  });

  it("keeps a disabled stand-in where there is no neighbour", () => {
    render(
      createElement(RecordPager, {
        position: 1,
        total: 9,
        previous: null,
        next: "/r/2",
        labels,
        render: link,
      }),
    );
    const before = screen.getByRole("link", { name: "Previous request" });
    expect(before.getAttribute("aria-disabled")).toBe("true");
    expect(before.getAttribute("href")).toBeNull();
  });
});
