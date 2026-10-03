// @vitest-environment jsdom

/**
 * FilterButton's and ListFilters' keyboard contract, in a document.
 *
 * The sheet's contract for the facet: it opens on Enter, Space or Down; with
 * more than seven values the first stop is a filter field; Up and Down move,
 * Home and End jump, Enter chooses and closes, Escape closes without choosing,
 * and focus returns to the button. For the row: the search applies on Enter
 * and after 300 ms of no typing, and the count line is the only live region.
 *
 * VERIFIED BY MUTATION: dropping the focus return, letting Escape propagate,
 * and applying the search per keystroke each turn this file red.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterButton, type FilterOption } from "./modern/filter-button.js";
import { ListFilters } from "./modern/list-filters.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PRODUCTS: FilterOption[] = [
  { value: "gopencdr", label: "GOpenCDR", hint: "17" },
  { value: "gopencnr", label: "GOpenCNR", hint: "18" },
  { value: "gopencsr", label: "GOpenCSR", hint: "12" },
];

const MANY: FilterOption[] = [
  "GAdvisory",
  "GControl",
  "GOpenCDR",
  "GOpenCNR",
  "GOpenCSR",
  "GPlatform Billing",
  "GPlatform Control",
  "GPlatform SSO",
].map((label) => ({ value: label.toLowerCase().replace(/ /g, "-"), label }));

/** The page owns the value, as the address does. */
function Facet({
  options = PRODUCTS,
  start = null,
  changes,
  chosenLabel,
}: {
  options?: FilterOption[];
  start?: string | null;
  changes?: (string | null)[];
  chosenLabel?: string;
}) {
  const [value, setValue] = useState<string | null>(start);
  return createElement(FilterButton, {
    label: "Product",
    anyLabel: "Any",
    anyOptionLabel: "Any product",
    value,
    options,
    filterLabel: "Filter products",
    chosenLabel,
    onChange: (next) => {
      changes?.push(next);
      setValue(next);
    },
  });
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /^Product:/ });
}

function activeOption(): HTMLElement | null {
  const owner =
    document.querySelector<HTMLElement>('[role="combobox"]') ??
    document.querySelector<HTMLElement>('[role="listbox"]');
  const id = owner?.getAttribute("aria-activedescendant");
  return id == null ? null : document.getElementById(id);
}

describe("FilterButton opens", () => {
  it.each([["{Enter}"], [" "], ["{ArrowDown}"]])("on %s, onto the listbox", async (key) => {
    const user = userEvent.setup();
    render(createElement(Facet, {}));
    trigger().focus();
    await user.keyboard(key);

    const list = screen.getByRole("listbox", { name: "Product" });
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(list.id);
    expect(document.activeElement).toBe(list);
  });

  it("with Any first and the current value active and selected", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { start: "gopencnr" }));
    trigger().focus();
    await user.keyboard("{Enter}");

    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toBe("Any product");
    expect(activeOption()?.textContent).toContain("GOpenCNR");
    expect(options.filter((o) => o.getAttribute("aria-selected") === "true")).toEqual([
      activeOption(),
    ]);
  });
});

describe("FilterButton moves and chooses", () => {
  it("moves with Up and Down and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, {}));
    trigger().focus();
    await user.keyboard("{Enter}");
    expect(activeOption()?.textContent).toBe("Any product");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOption()?.textContent).toContain("GOpenCNR");
    await user.keyboard("{ArrowUp}");
    expect(activeOption()?.textContent).toContain("GOpenCDR");
    await user.keyboard("{End}");
    expect(activeOption()?.textContent).toContain("GOpenCSR");
    await user.keyboard("{ArrowDown}");
    expect(activeOption()?.textContent).toContain("GOpenCSR");
    await user.keyboard("{Home}");
    expect(activeOption()?.textContent).toBe("Any product");
  });

  it("chooses on Enter, closes, and returns focus to the button", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Facet, { changes }));
    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{ArrowDown}{Enter}");

    expect(changes).toEqual(["gopencnr"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe("Product:GOpenCNR");
  });

  it("chooses Any as null", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Facet, { start: "gopencsr", changes }));
    trigger().focus();
    await user.keyboard("{Enter}{Home}{Enter}");
    expect(changes).toEqual([null]);
    expect(trigger().textContent).toBe("Product:Any");
  });

  it("writes nothing when the value chosen is the one already set", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Facet, { start: "gopencnr", changes }));
    trigger().focus();
    await user.keyboard("{Enter}{Enter}");
    expect(changes).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("chooses on a click", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Facet, { changes }));
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: /GOpenCSR/ }));
    expect(changes).toEqual(["gopencsr"]);
    expect(document.activeElement).toBe(trigger());
  });
});

describe("FilterButton closes without choosing", () => {
  it("on Escape, with focus back on the button, and the Escape goes no further", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    const heard = vi.fn();
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") heard();
    });
    render(createElement(Facet, { changes }));
    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{Escape}");

    expect(changes).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(heard).not.toHaveBeenCalled();
  });

  it("on a click outside", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(
      createElement("div", null, [
        createElement(Facet, { key: "facet", changes }),
        createElement("p", { key: "elsewhere" }, "Elsewhere"),
      ]),
    );
    await user.click(trigger());
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.click(screen.getByText("Elsewhere"));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(changes).toEqual([]);
  });

  it("on Tab, moving on", async () => {
    const user = userEvent.setup();
    render(
      createElement("div", null, [
        createElement(Facet, { key: "facet" }),
        createElement("button", { key: "after", type: "button" }, "After"),
      ]),
    );
    trigger().focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("FilterButton with more than seven values", () => {
  it("puts a filter field first, named by the caller", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { options: MANY }));
    trigger().focus();
    await user.keyboard("{Enter}");
    const field = screen.getByRole("combobox", { name: "Filter products" });
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
  });

  it("narrows as it is typed, keeps Any first, and puts the keyboard on the first match", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Facet, { options: MANY, changes }));
    trigger().focus();
    await user.keyboard("{Enter}");
    await user.keyboard("gopen");

    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Any product", "GOpenCDR", "GOpenCNR", "GOpenCSR"]);
    expect(activeOption()?.textContent).toBe("GOpenCDR");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(changes).toEqual(["gopencnr"]);
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps a space a space while typing", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { options: MANY }));
    trigger().focus();
    await user.keyboard("{Enter}");
    await user.keyboard("gplatform s");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any product",
      "GPlatform SSO",
    ]);
  });

  it("has no filter field at seven or fewer", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { options: MANY.slice(0, 7) }));
    trigger().focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("FilterButton with a typed value", () => {
  /** A day facet: three days to pick, any day to type as 2026-09-12. */
  function Day({ changes, start = null }: { changes: (string | null)[]; start?: string | null }) {
    const [value, setValue] = useState<string | null>(start);
    return createElement(FilterButton, {
      label: "From",
      anyLabel: "Any",
      value,
      options: [
        { value: "2026-10-03", label: "3 Oct 2026", hint: "today" },
        { value: "2026-10-02", label: "2026-10-02", hint: "yesterday" },
      ],
      filterLabel: "Type a day",
      typed: {
        parse: (text) =>
          /^\d{4}-\d{2}-\d{2}$/u.test(text.trim())
            ? { value: text.trim(), label: `the day ${text.trim()}` }
            : null,
        placeholder: "2026-09-12",
      },
      onChange: (next) => {
        changes.push(next);
        setValue(next);
      },
    });
  }

  it("draws the field with few values, and offers what it reads first after Any", async () => {
    const user = userEvent.setup();
    const changes: (string | null)[] = [];
    render(createElement(Day, { changes }));
    screen.getByRole("button", { name: /^From:/ }).focus();
    await user.keyboard("{Enter}");
    const field = screen.getByRole("combobox", { name: "Type a day" });
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("placeholder")).toBe("2026-09-12");

    await user.keyboard("2026-09-1");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Any"]);
    await user.keyboard("2");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any",
      "the day 2026-09-12",
    ]);
    expect(activeOption()?.textContent).toBe("the day 2026-09-12");
    await user.keyboard("{Enter}");
    expect(changes).toEqual(["2026-09-12"]);
    expect(screen.getByRole("button", { name: /^From:/ }).textContent).toContain(
      "the day 2026-09-12",
    );
  });

  it("does not offer a typed value twice when it is also an option", async () => {
    const user = userEvent.setup();
    render(createElement(Day, { changes: [] }));
    screen.getByRole("button", { name: /^From:/ }).focus();
    await user.keyboard("{Enter}");
    // "2026-10-02" is an option's label too; it is offered once, as read.
    await user.keyboard("2026-10-02");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any",
      "the day 2026-10-02",
    ]);
  });
});

describe("FilterButton marks the chosen option in more than colour", () => {
  it("with a check when the caller gives no word", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { start: "gopencnr" }));
    await user.click(trigger());
    const chosen = screen.getByRole("option", { selected: true });
    expect(chosen.querySelector("svg.lucide-check")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("with the caller's word, hidden because aria-selected already says it", async () => {
    const user = userEvent.setup();
    render(createElement(Facet, { start: "gopencnr", chosenLabel: "chosen" }));
    await user.click(trigger());
    const word = screen.getByText("chosen");
    expect(word.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("option", { selected: true }).contains(word)).toBe(true);
  });
});

/** The row as a page uses it: the search and the facet both write to the "address". */
function Row({ searches, clears }: { searches: string[]; clears?: () => void }) {
  const [q, setQ] = useState("");
  const [product, setProduct] = useState<string | null>("gopencnr");
  return createElement(
    ListFilters,
    {
      label: "Filter documents",
      search: {
        label: "Search documents",
        placeholder: "Title, key or version",
        value: q,
        onChange: (next) => {
          searches.push(next);
          setQ(next);
        },
      },
      clear:
        q !== "" || product !== null
          ? {
              label: "Clear",
              onClear: () => {
                clears?.();
                setQ("");
                setProduct(null);
              },
            }
          : null,
      count: `${product === null ? 96 : 7} of 96 documents`,
    },
    createElement(FilterButton, {
      label: "Product",
      anyLabel: "Any",
      value: product,
      options: PRODUCTS,
      onChange: setProduct,
    }),
  );
}

describe("ListFilters' search", () => {
  it("applies after 300 ms of no typing, once, never per keystroke", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const searches: string[] = [];
    render(createElement(Row, { searches }));

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "priv");
    expect(searches).toEqual([]);
    /*
     * 250 rather than 299: the clock also moves with real time here (testing
     * library's own waits need it to), so the margin keeps a slow machine from
     * crossing 300 before the assertion and passing for the wrong reason.
     */
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(searches).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(searches).toEqual(["priv"]);
  });

  it("applies at once on Enter, and the pause after it does not apply it again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const searches: string[] = [];
    render(createElement(Row, { searches }));

    await user.type(screen.getByRole("searchbox"), "terms{Enter}");
    expect(searches).toEqual(["terms"]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(searches).toEqual(["terms"]);
  });

  it("keeps what was typed after the last apply when the address catches up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const searches: string[] = [];
    render(createElement(Row, { searches }));
    const field = screen.getByRole<HTMLInputElement>("searchbox");

    await user.type(field, "ab{Enter}c");
    expect(searches).toEqual(["ab"]);
    expect(field.value).toBe("abc");
  });
});

describe("ListFilters' Clear", () => {
  it("moves focus to the search field before it disappears", async () => {
    const user = userEvent.setup();
    let cleared = 0;
    render(
      createElement(Row, {
        searches: [],
        clears: () => {
          cleared += 1;
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(cleared).toBe(1);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect(trigger().textContent).toBe("Product:Any");
  });

  it("cancels typing still waiting to be applied, so the timer cannot undo it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const searches: string[] = [];
    render(createElement(Row, { searches }));
    await user.type(screen.getByRole("searchbox"), "ab{Enter}");
    await user.type(screen.getByRole("searchbox"), "c");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(searches).toEqual(["ab"]);
    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
  });
});

describe("ListFilters' count line", () => {
  it("is the one polite live region, and it says what the list now shows", async () => {
    const user = userEvent.setup();
    render(createElement(Row, { searches: [] }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("7 of 96 documents");

    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: "Any" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("96 of 96 documents");
  });
});
