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
