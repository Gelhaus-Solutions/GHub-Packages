/**
 * The crop's arithmetic and the two controls' markup (GPlatform Identity,
 * sheet 34, C4).
 *
 * The arithmetic is the part a screenshot cannot check: that the circle never
 * leaves the picture, that a zoom keeps the spot under the circle, and that the
 * square reported is the one drawn. The markup half pins what a screen reader
 * is given: a real range input with its value in words, and a named group.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  clampCropPosition,
  cropArea,
  cropBaseScale,
  ImageCrop,
  Slider,
  zoomCropPosition,
} from "./modern/index.js";

const PHOTO = { width: 4000, height: 3000 };
const VIEW = { width: 464, height: 320, diameter: 260 };

describe("the crop's arithmetic", () => {
  it("fits the picture's shorter side to the circle at zoom 1", () => {
    expect(cropBaseScale(PHOTO, VIEW)).toBeCloseTo(260 / 3000);
  });

  it("reports the centred square of the shorter side at zoom 1", () => {
    const area = cropArea(PHOTO, VIEW, { zoom: 1, x: 0, y: 0 });
    expect(area.size).toBeCloseTo(3000);
    expect(area.x).toBeCloseTo(500);
    expect(area.y).toBeCloseTo(0);
  });

  it("never lets the circle leave the picture, at any zoom", () => {
    const flush = clampCropPosition(PHOTO, VIEW, { zoom: 1, x: 9999, y: -9999 });
    const area = cropArea(PHOTO, VIEW, flush);
    expect(area.x).toBeCloseTo(0);
    expect(area.y).toBeCloseTo(0);
    expect(flush.y).toBe(0);

    const zoomed = clampCropPosition(PHOTO, VIEW, { zoom: 2, x: -9999, y: -9999 });
    const corner = cropArea(PHOTO, VIEW, zoomed);
    expect(corner.x + corner.size).toBeCloseTo(PHOTO.width);
    expect(corner.y + corner.size).toBeCloseTo(PHOTO.height);
  });

  it("holds the zoom inside its bounds", () => {
    expect(clampCropPosition(PHOTO, VIEW, { zoom: 0.4, x: 0, y: 0 }).zoom).toBe(1);
    expect(clampCropPosition(PHOTO, VIEW, { zoom: 9, x: 0, y: 0 }, 1, 4).zoom).toBe(4);
  });

  it("keeps the spot under the circle's centre when it zooms", () => {
    const start = clampCropPosition(PHOTO, VIEW, { zoom: 2, x: 40, y: -30 });
    const before = cropArea(PHOTO, VIEW, start);
    const after = cropArea(PHOTO, VIEW, zoomCropPosition(PHOTO, VIEW, start, 3));
    expect(after.x + after.size / 2).toBeCloseTo(before.x + before.size / 2);
    expect(after.y + after.size / 2).toBeCloseTo(before.y + before.size / 2);
    expect(after.size).toBeCloseTo((before.size * 2) / 3);
  });

  it("pulls the circle back onto the picture when zooming out leaves it hanging", () => {
    const edge = clampCropPosition(PHOTO, VIEW, { zoom: 3, x: 9999, y: 0 });
    const out = zoomCropPosition(PHOTO, VIEW, edge, 1);
    expect(cropArea(PHOTO, VIEW, out).x).toBeGreaterThanOrEqual(-1e-9);
  });
});

describe("Slider", () => {
  const markup = renderToStaticMarkup(
    createElement(Slider, {
      label: "Zoom",
      value: 1.4,
      min: 1,
      max: 4,
      step: 0.01,
      onValueChange: () => {},
      format: (value: number) => `${String(Math.round(value * 100))}%`,
    }),
  );

  it("is a native range input named by its visible label", () => {
    expect(markup).toMatch(/<label for="([^"]+)"[^>]*>Zoom<\/label><input id="\1" type="range"/u);
  });

  it("gives the value in words, and hides the printed copy from assistive technology", () => {
    expect(markup).toContain('aria-valuetext="140%"');
    expect(markup).toMatch(/<span aria-hidden="true"[^>]*>140%<\/span>/u);
  });
});

describe("ImageCrop", () => {
  const markup = renderToStaticMarkup(
    createElement(ImageCrop, {
      src: "blob:picture",
      label: "Crop. Arrow keys move, plus and minus zoom",
      zoom: 1,
      onZoomChange: () => {},
      onCropChange: () => {},
      announce: () => "",
      width: 464,
    }),
  );

  it("is one focusable group with the caller's name", () => {
    expect(markup).toContain('role="group"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Crop. Arrow keys move, plus and minus zoom"');
  });

  it("keeps the picture hidden until it has decoded, and announces through a polite region", () => {
    expect(markup).toContain("visibility:hidden");
    expect(markup).toContain('aria-live="polite"');
  });

  it("crops under a circle, or under PlaceMark's rounded square for a logo", () => {
    expect(markup).toMatch(/data-shape="circle" class="[^"]*rounded-full/u);
    const square = renderToStaticMarkup(
      createElement(ImageCrop, {
        src: "blob:logo",
        label: "Crop",
        zoom: 1,
        onZoomChange: () => {},
        onCropChange: () => {},
        announce: () => "",
        width: 464,
        shape: "square",
      }),
    );
    expect(square).toMatch(/data-shape="square" class="[^"]*rounded-\[30%\]/u);
  });
});
