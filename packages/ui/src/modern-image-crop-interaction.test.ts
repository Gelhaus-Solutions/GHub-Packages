// @vitest-environment jsdom

/**
 * ImageCrop's keyboard contract, observed in a document (sheet 34, C4
 * "Keyboard"): arrows move the crop a pixel, Shift and an arrow ten, plus and
 * minus zoom by a tenth, Home resets, and every key's result is announced.
 *
 * jsdom decodes no pictures, so the picture's size is set on the element and
 * its load event fired by hand: the component reads `naturalWidth` and
 * `naturalHeight` from the event, as it does in a browser.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageCrop, type CropArea, type CropPosition } from "./modern/index.js";

afterEach(cleanup);

const LABEL = "Crop. Arrow keys move, plus and minus zoom";
const said = (position: CropPosition) =>
  `x ${String(position.x)}, y ${String(position.y)}, zoom ${String(Math.round(position.zoom * 100))}%`;

function Harness({ areas }: { areas: CropArea[] }) {
  const [zoom, setZoom] = useState(2);
  return createElement(ImageCrop, {
    src: "blob:picture",
    label: LABEL,
    zoom,
    onZoomChange: setZoom,
    onCropChange: (area: CropArea) => areas.push(area),
    announce: said,
    width: 464,
    height: 320,
    inset: 30,
  });
}

function loaded(width: number, height: number) {
  const image = document.querySelector("img");
  if (image === null) throw new Error("no picture");
  Object.defineProperty(image, "naturalWidth", { value: width });
  Object.defineProperty(image, "naturalHeight", { value: height });
  act(() => {
    fireEvent.load(image);
  });
}

describe("ImageCrop's keyboard", () => {
  it("moves the crop the way the arrow points, a pixel, or ten with Shift", () => {
    const areas: CropArea[] = [];
    render(createElement(Harness, { areas }));
    loaded(2600, 2600);
    const group = screen.getByRole("group", { name: LABEL });
    const start = areas.at(-1);
    if (start === undefined) throw new Error("no area reported");

    // 260px circle over a 2600px picture at zoom 2: one screen pixel is five picture pixels.
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(areas.at(-1)?.x).toBeCloseTo(start.x + 5);
    fireEvent.keyDown(group, { key: "ArrowDown", shiftKey: true });
    expect(areas.at(-1)?.y).toBeCloseTo(start.y + 50);
    expect(screen.getByText(/zoom 200%/u).getAttribute("aria-live")).toBe("polite");
  });

  it("zooms by a tenth with plus and minus, and Home puts everything back", () => {
    const areas: CropArea[] = [];
    render(createElement(Harness, { areas }));
    loaded(2600, 2600);
    const group = screen.getByRole("group", { name: LABEL });

    fireEvent.keyDown(group, { key: "+" });
    expect(screen.getByText(/zoom 210%/u)).toBeTruthy();
    fireEvent.keyDown(group, { key: "-" });
    fireEvent.keyDown(group, { key: "-" });
    expect(screen.getByText(/zoom 190%/u)).toBeTruthy();

    fireEvent.keyDown(group, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(group, { key: "Home" });
    expect(screen.getByText("x 0, y 0, zoom 100%")).toBeTruthy();
    expect(areas.at(-1)).toEqual({ x: 0, y: 0, size: 2600 });
  });

  it("ignores keys until the picture has decoded", () => {
    const areas: CropArea[] = [];
    render(createElement(Harness, { areas }));
    fireEvent.keyDown(screen.getByRole("group", { name: LABEL }), { key: "ArrowRight" });
    expect(areas).toEqual([]);
  });
});
