// @vitest-environment jsdom

/**
 * PickerDialog's contract, in a document.
 *
 * The server does the work: each search, facet and page is one `load`, the
 * search applies on Enter (and after 300 ms), and a load the query moved past
 * is aborted. One: Enter on the highlighted row chooses it and confirms.
 * Several: rows tick and untick, the tray holds the chosen from any page, and
 * "Chosen only" lists them. A row that cannot be chosen says why and ignores
 * the click. Escape closes and focus goes back to what opened it. Views are a
 * radio group of tabs whose key reaches `load`, and a popup without them asks
 * exactly what it always asked.
 */

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PickerDialog,
  type PickerLabels,
  type PickerPage,
  type PickerQuery,
} from "./modern/picker-dialog.js";

afterEach(() => {
  cleanup();
});

interface Party {
  id: string;
  name: string;
  place: string;
}

const PARTIES: Party[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${String(i + 1)}`,
  name: `Party ${String(i + 1).padStart(2, "0")}`,
  place: i % 2 === 0 ? "Hamburg, Germany" : "Oslo, Norway",
}));

const LABELS: PickerLabels = {
  views: "Which parties",
  search: "Search parties",
  searchPlaceholder: "Name or city",
  filters: "Filter parties",
  list: "Parties",
  clear: "Clear",
  close: "Close",
  cancel: "Cancel",
  count: (total) => `${String(total)} parties match`,
  page: (page, pages) => `Page ${String(page)} of ${String(pages)}`,
  back: "Previous page",
  next: "Next page",
  empty: "No party matches",
  waiting: "Still waiting on the server after 1 second.",
  failed: "The parties could not be loaded.",
  choose: (name) => `Choose ${name}`,
  chooseNothing: "Choose a party",
  add: (count) => `Add ${String(count)} parties`,
  chosen: (count) => `${String(count)} chosen`,
  chosenOnly: "Chosen only",
  remove: (name) => `Take ${name} off`,
};

/** A paged endpoint over PARTIES: five a page, the search on the name and place. */
function endpoint() {
  return vi.fn((query: PickerQuery, _signal: AbortSignal): Promise<PickerPage<Party>> => {
    const needle = query.search.toLowerCase();
    const country = query.facets["country"] ?? null;
    const hits = PARTIES.filter(
      (one) =>
        (needle === "" || `${one.name} ${one.place}`.toLowerCase().includes(needle)) &&
        (country === null || one.place.endsWith(country)),
    );
    return Promise.resolve({
      items: hits.slice((query.page - 1) * 5, query.page * 5),
      total: hits.length,
      perPage: 5,
    });
  });
}

function Harness({
  load,
  several = false,
  onConfirm,
  onClose = () => {},
  unavailable,
  initialSearch,
  views,
}: {
  load: ReturnType<typeof endpoint>;
  several?: boolean;
  onConfirm: (items: Party[]) => void;
  onClose?: () => void;
  unavailable?: (item: Party) => string | null;
  initialSearch?: string;
  views?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setOpen(true) }, "Open"),
    createElement(PickerDialog<Party>, {
      open,
      onClose: () => {
        onClose();
        setOpen(false);
      },
      title: "Choose the party",
      load,
      itemKey: (one) => one.id,
      itemName: (one) => one.name,
      columns: [
        { key: "name", label: "Party", width: "minmax(0, 2fr)", cell: (one) => one.name },
        { key: "place", label: "Place", width: "minmax(0, 1fr)", cell: (one) => one.place },
      ],
      facets: [
        {
          key: "country",
          label: "Country",
          anyLabel: "Any",
          options: [
            { value: "Germany", label: "Germany" },
            { value: "Norway", label: "Norway" },
          ],
        },
      ],
      several,
      onConfirm,
      labels: LABELS,
      ...(unavailable === undefined ? {} : { unavailable }),
      ...(initialSearch === undefined ? {} : { initialSearch }),
      ...(views === true
        ? {
            views: [
              { key: "recent", label: "Recent" },
              { key: "starred", label: "Starred" },
              { key: "all", label: "All" },
            ],
            initialView: "all",
            action: createElement("button", { type: "button" }, "New party"),
            note: "Parties show where your organization has them.",
          }
        : {}),
    }),
  );
}

async function openIt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByText("12 parties match");
}

describe("PickerDialog", () => {
  it("opens with focus in the search, loads page 1 and pages on the server", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    render(createElement(Harness, { load, onConfirm: () => {} }));
    await openIt(user);

    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search parties" }));
    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: {}, page: 1 },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole("option")).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Party 06");
    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: {}, page: 2 },
      expect.any(AbortSignal),
    );
  });

  it("applies the search on Enter, back on page 1, and opens with the field's search", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    render(createElement(Harness, { load, onConfirm: () => {}, initialSearch: "oslo" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("6 parties match");
    expect(screen.getByRole("combobox", { name: "Search parties" })).toHaveProperty(
      "value",
      "oslo",
    );

    const field = screen.getByRole("combobox", { name: "Search parties" });
    await user.clear(field);
    await user.type(field, "party 1{Enter}");
    await screen.findByText("3 parties match");
    expect(load).toHaveBeenLastCalledWith(
      { search: "party 1", facets: {}, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it("aborts a load the query has moved past", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    render(createElement(Harness, { load, onConfirm: () => {} }));
    await openIt(user);
    const first = load.mock.calls[0]?.[1];

    await user.type(screen.getByRole("combobox", { name: "Search parties" }), "x{Enter}");
    await screen.findByText("No party matches");
    expect(first?.aborted).toBe(true);
  });

  it("one: the arrows move the highlight and Enter chooses it", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    const onConfirm = vi.fn();
    render(createElement(Harness, { load, onConfirm }));
    await openIt(user);

    const field = screen.getByRole("combobox", { name: "Search parties" });
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(field.getAttribute("aria-activedescendant")).toBe(options[2]?.id);

    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith([PARTIES[2]]);
  });

  it("one: a click chooses and the primary says whom", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    const onConfirm = vi.fn();
    render(createElement(Harness, { load, onConfirm }));
    await openIt(user);

    expect(screen.getByRole("button", { name: "Choose a party" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.click(screen.getByRole("option", { name: /Party 04/ }));
    expect(screen.getByRole("option", { name: /Party 04/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Choose Party 04" }));
    expect(onConfirm).toHaveBeenCalledWith([PARTIES[3]]);
  });

  it("several: ticks across pages, the tray, Chosen only and Add", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    const onConfirm = vi.fn();
    render(createElement(Harness, { load, onConfirm, several: true }));
    await openIt(user);

    await user.click(screen.getByRole("option", { name: /Party 01/ }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Party 06");
    await user.click(screen.getByRole("option", { name: /Party 07/ }));
    expect(screen.getByText("2 chosen")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Chosen only" }));
    expect(screen.getAllByRole("option").map((one) => one.textContent)).toEqual([
      "Party 01Hamburg, Germany",
      "Party 07Hamburg, Germany",
    ]);

    await user.click(screen.getByRole("button", { name: "Take Party 01 off" }));
    await user.click(screen.getByRole("button", { name: "Add 1 parties" }));
    expect(onConfirm).toHaveBeenCalledWith([PARTIES[6]]);
  });

  it("a row that cannot be chosen says why and ignores the click", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    const onConfirm = vi.fn();
    render(
      createElement(Harness, {
        load,
        onConfirm,
        unavailable: (one: Party) => (one.id === "p2" ? "Already the party" : null),
      }),
    );
    await openIt(user);

    const row = screen.getByRole("option", { name: /Party 02/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(within(row).getByText("Already the party")).toBeTruthy();
    await user.click(row);
    expect(row.getAttribute("aria-selected")).toBe("false");
  });

  it("a facet narrows on the server; Escape closes and focus goes back", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    const onClose = vi.fn();
    render(createElement(Harness, { load, onConfirm: () => {}, onClose }));
    await openIt(user);

    await user.click(screen.getByRole("button", { name: /Country/ }));
    await user.click(screen.getByRole("option", { name: "Norway" }));
    await screen.findByText("6 parties match");
    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: { country: "Norway" }, page: 1 },
      expect.any(AbortSignal),
    );

    await act(async () => {
      await user.keyboard("{Escape}");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });

  it("views: one at a time, the arrows move, a change goes back to page 1 and reaches load", async () => {
    const user = userEvent.setup();
    const load = endpoint();
    render(createElement(Harness, { load, onConfirm: () => {}, views: true }));
    await openIt(user);

    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: {}, page: 1, view: "all" },
      expect.any(AbortSignal),
    );
    const group = screen.getByRole("radiogroup", { name: "Which parties" });
    const all = within(group).getByRole("radio", { name: "All" });
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(within(group).getByRole("radio", { name: "Recent" }).tabIndex).toBe(-1);
    expect(all.tabIndex).toBe(0);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Party 06");
    await user.click(within(group).getByRole("radio", { name: "Starred" }));
    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: {}, page: 1, view: "starred" },
      expect.any(AbortSignal),
    );

    await user.keyboard("{ArrowLeft}");
    const recent = within(group).getByRole("radio", { name: "Recent" });
    expect(recent.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(recent);
    expect(load).toHaveBeenLastCalledWith(
      { search: "", facets: {}, page: 1, view: "recent" },
      expect.any(AbortSignal),
    );

    expect(screen.getByRole("button", { name: "New party" })).toBeTruthy();
    expect(screen.getByText("Parties show where your organization has them.")).toBeTruthy();
  });
});
