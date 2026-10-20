// @vitest-environment jsdom

/**
 * Combobox's list is portalled out of the field.
 *
 * The defect this pins: the list hung absolutely inside the field, so it lived
 * in the field's stacking context. On Aurora every section is one, and the
 * section after the field's own painted over the open list (2026-10-20, the
 * Legal console's "Kind of agreement"). Portalled to the body and `fixed`, no
 * section can sit above it and no ancestor's overflow can clip it.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Combobox } from "./combobox.js";

afterEach(cleanup);

// jsdom draws nothing, so it has no scrolling to do; the list keeps its active option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

const OPTIONS = [
  { value: "dpa", label: "Data Processing Agreement" },
  { value: "poa", label: "Power of attorney" },
];

function field(): HTMLElement {
  render(
    createElement(
      "section",
      { "data-testid": "section", style: { overflow: "hidden" } },
      createElement(Combobox, { name: "kind", label: "Kind of agreement", options: OPTIONS }),
    ),
  );
  return screen.getByRole("combobox", { name: "Kind of agreement" });
}

describe("Combobox", () => {
  it("opens its list outside the section the field is in, fixed to the viewport", () => {
    const input = field();
    // Really focused, as a press on the field would leave it, so the commit's own focus() is a no-op.
    act(() => input.focus());

    const listbox = screen.getByRole("listbox");
    expect(screen.getByTestId("section").contains(listbox)).toBe(false);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.className).toContain("fixed");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("commits an option pressed in the portalled list, and closes", () => {
    const input = field();
    // Really focused, as a press on the field would leave it, so the commit's own focus() is a no-op.
    act(() => input.focus());

    fireEvent.pointerDown(screen.getByRole("option", { name: "Power of attorney" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Power of attorney");
    const hidden = document.querySelector('input[type="hidden"][name="kind"]') as HTMLInputElement;
    expect(hidden.value).toBe("poa");
  });

  it("closes on a press outside both the field and the list", () => {
    const input = field();
    // Really focused, as a press on the field would leave it, so the commit's own focus() is a no-op.
    act(() => input.focus());
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("Combobox searched on the server", () => {
  it("shows what load answers for the typed text, and Browse hands the text on", async () => {
    const calls: string[] = [];
    const browsed: string[] = [];
    const load = (query: string) => {
      calls.push(query);
      return Promise.resolve({
        options: [{ value: "nordwerk", label: "Nordwerk Medien GmbH", hint: "Hamburg, Germany" }],
        total: 38,
      });
    };
    render(
      createElement(Combobox, {
        name: "party",
        label: "Party",
        options: [],
        load,
        browse: {
          label: (_query: string, total: number | null) => `Search and filter all ${String(total)}`,
          onBrowse: (query: string) => browsed.push(query),
        },
      }),
    );
    const input = screen.getByRole("combobox", { name: "Party" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "nor" } });

    const option = await screen.findByRole("option", { name: /Nordwerk Medien GmbH/ });
    expect(calls.at(-1)).toBe("nor");
    const browse = screen.getByRole("option", { name: "Search and filter all 38" });

    // Down past the last match lands on the browse row; Enter opens the picker with the text.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(browse.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(browsed).toEqual(["nor"]);
    expect(screen.queryByRole("listbox")).toBeNull();

    // A committed server option keeps its label though `options` never held it.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.pointerDown(await screen.findByRole("option", { name: /Nordwerk Medien GmbH/ }));
    expect((input as HTMLInputElement).value).toBe("Nordwerk Medien GmbH");
    expect(option).toBeTruthy();
  });
});
