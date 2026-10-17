// @vitest-environment jsdom

/**
 * Dialog keeps focus where the reader put it while the caller re-renders.
 *
 * The defect this pins: the open effect listed `onClose` among its
 * dependencies, and a caller writing `onClose={() => setOpen(false)}` hands a
 * new function on every render. Each keystroke in a field inside the dialog
 * re-rendered the caller, re-ran the effect, and moved focus back to the
 * panel, so a field took one character at a time.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./dialog.js";

afterEach(cleanup);

function Caller({ closed }: { closed: string[] }) {
  const [name, setName] = useState("");
  return createElement(
    Dialog,
    {
      open: true,
      title: "Add a product",
      onClose: () => closed.push(name),
    },
    createElement("input", {
      "aria-label": "Display name",
      value: name,
      onChange: (event: { target: { value: string } }) => setName(event.target.value),
    }),
  );
}

describe("Dialog", () => {
  it("leaves focus in a field while the caller re-renders with a new onClose", () => {
    const closed: string[] = [];
    render(createElement(Caller, { closed }));
    const field = screen.getByRole("textbox", { name: "Display name" });

    field.focus();
    fireEvent.change(field, { target: { value: "G" } });
    fireEvent.change(field, { target: { value: "GM" } });

    expect(document.activeElement).toBe(field);
  });

  it("calls the latest onClose on Escape", () => {
    const closed: string[] = [];
    render(createElement(Caller, { closed }));
    const field = screen.getByRole("textbox", { name: "Display name" });

    fireEvent.change(field, { target: { value: "GMint" } });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(closed).toEqual(["GMint"]);
  });
});
