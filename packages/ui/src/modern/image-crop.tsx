"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";
import { cn } from "../cn.js";
import {
  clampCropPosition,
  cropArea,
  cropBaseScale,
  zoomCropPosition,
  type CropArea,
  type CropImage,
  type CropPosition,
  type CropView,
} from "./image-crop-math.js";

export interface ImageCropProps {
  /** The picture, usually an object URL of the file somebody chose. */
  src: string;
  /** What the group is and what its keys do: "Crop. Arrow keys move, plus and minus zoom". */
  label: string;
  /** The zoom, held by the caller so a `Slider` beside the crop can move it too. 1 is the least. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** The square inside the circle, in the picture's own pixels, after every change. */
  onCropChange: (area: CropArea) => void;
  /**
   * The words announced after a key moves or zooms the crop. The caller's,
   * because they are copy: "Moved 12 right and 4 up, zoom 140%".
   */
  announce: (position: CropPosition) => string;
  minZoom?: number;
  maxZoom?: number;
  /** How far plus and minus zoom. A tenth is ten per cent of the picture's size. */
  zoomStep?: number;
  /** The view's height in CSS pixels. Its width is the container's. */
  height?: number;
  /** The space between the circle and the view's shorter edge. */
  inset?: number;
  /** A fixed width instead of the container's, for a caller that knows it (and for tests). */
  width?: number;
  /** The picture decoded, with its own size: the moment a caller can check it is large enough. */
  onLoad?: (image: CropImage) => void;
  /** The picture could not be decoded: a damaged file, or a format this browser cannot read. */
  onError?: () => void;
  className?: string;
}

const STEP = 1;
const SHIFT_STEP = 10;
const round = (zoom: number) => Math.round(zoom * 100) / 100;

/**
 * A picture moved and scaled under a fixed circle (GPlatform Identity, sheet
 * 34: C4, the picture).
 *
 * **The circle stays put and the picture moves**, which is what every photo
 * app has taught people, and the picture can never be moved or zoomed so far
 * out that the circle shows anything but the picture: at zoom 1 its shorter
 * side spans the circle exactly.
 *
 * **Everything a pointer does, the keyboard does** (WCAG 2.1.1 and 2.5.7). The
 * crop is one focusable group: the arrows move the crop a pixel, Shift and an
 * arrow ten, plus and minus zoom, and Home puts it back. Each key's result is
 * announced in the caller's words through a polite live region, because a
 * moved crop changes nothing a screen reader would otherwise say. A drag says
 * nothing: somebody dragging can see it.
 *
 * The component never holds the file and never makes the result. It reports
 * the square in the picture's own pixels, and `drawCrop` turns that into a
 * canvas of whatever size the caller keeps.
 */
export function ImageCrop({
  src,
  label,
  zoom,
  onZoomChange,
  onCropChange,
  announce,
  minZoom = 1,
  maxZoom = 4,
  zoomStep = 0.1,
  height = 320,
  inset = 30,
  width: fixedWidth,
  onLoad,
  onError,
  className,
}: ImageCropProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const reported = useRef(onCropChange);
  reported.current = onCropChange;

  const [measured, setMeasured] = useState(0);
  const [image, setImage] = useState<CropImage | null>(null);
  const [position, setPosition] = useState<CropPosition>({ zoom, x: 0, y: 0 });
  const [said, setSaid] = useState("");

  const width = fixedWidth ?? measured;
  const view: CropView = {
    width,
    height,
    diameter: Math.max(0, Math.min(width, height) - inset * 2),
  };
  const ready = image !== null && view.diameter > 0;

  // The container's width, followed as it changes: the dialog becomes a sheet on a phone.
  useEffect(() => {
    if (fixedWidth !== undefined || frame.current === null) return;
    const element = frame.current;
    setMeasured(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setMeasured(element.clientWidth);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [fixedWidth]);

  // A zoom from outside (the slider) keeps the spot under the circle; a resize only clamps.
  useEffect(() => {
    if (image === null || view.diameter === 0) return;
    setPosition((current) =>
      current.zoom === zoom
        ? clampCropPosition(image, view, current, minZoom, maxZoom)
        : zoomCropPosition(image, view, current, zoom, minZoom, maxZoom),
    );
    // The view is three numbers; listing them keeps a new object from re-running this.
  }, [zoom, image, view.width, view.height, view.diameter, minZoom, maxZoom]);

  useEffect(() => {
    if (image === null || view.diameter === 0) return;
    reported.current(cropArea(image, view, position));
  }, [image, position, view.width, view.height, view.diameter]);

  const place = (next: CropPosition, words: boolean) => {
    if (image === null) return;
    const clamped = clampCropPosition(image, view, next, minZoom, maxZoom);
    setPosition(clamped);
    if (clamped.zoom !== zoom) onZoomChange(clamped.zoom);
    if (words) setSaid(announce(clamped));
  };

  const keyed = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const step = event.shiftKey ? SHIFT_STEP : STEP;
    // The crop moves the way the arrow points, so the picture moves the other way.
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      place({ zoom: position.zoom, x: position.x + move[0], y: position.y + move[1] }, true);
      return;
    }
    if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
      event.preventDefault();
      const direction = event.key === "+" || event.key === "=" ? 1 : -1;
      const next = zoomCropPosition(
        image,
        view,
        position,
        round(position.zoom + direction * zoomStep),
        minZoom,
        maxZoom,
      );
      place(next, true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      place({ zoom: minZoom, x: 0, y: 0 }, true);
    }
  };

  const pressed = (event: PointerEvent<HTMLDivElement>) => {
    if (!ready || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const moved = (event: PointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (last?.id !== event.pointerId) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    place(
      {
        zoom: position.zoom,
        x: position.x + event.clientX - last.x,
        y: position.y + event.clientY - last.y,
      },
      false,
    );
  };

  const released = () => {
    drag.current = null;
  };

  const loaded = (event: SyntheticEvent<HTMLImageElement>) => {
    const found = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };
    setImage(found);
    setPosition({ zoom, x: 0, y: 0 });
    onLoad?.(found);
  };

  const scale = ready ? cropBaseScale(image, view) * position.zoom : 0;
  const shown = ready ? { width: image.width * scale, height: image.height * scale } : null;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label={label}
        onKeyDown={keyed}
        onPointerDown={pressed}
        onPointerMove={moved}
        onPointerUp={released}
        onPointerCancel={released}
        style={{ height }}
        className={cn(
          "relative w-full touch-none select-none overflow-hidden rounded-m-panel bg-m-inset",
          ready ? "cursor-grab active:cursor-grabbing" : "",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
        )}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={loaded}
          onError={() => onError?.()}
          className="pointer-events-none absolute max-w-none"
          style={
            shown === null
              ? { visibility: "hidden" }
              : {
                  width: shown.width,
                  height: shown.height,
                  left: view.width / 2 + position.x - shown.width / 2,
                  top: view.height / 2 + position.y - shown.height / 2,
                }
          }
        />
        {/* The circle, with everything outside it dimmed: the photo editor's convention, not a token. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_9999px_oklch(0_0_0/0.6),inset_0_0_0_2px_oklch(1_0_0/0.9)]"
          style={{ width: view.diameter, height: view.diameter }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

/**
 * The square a crop chose, drawn at a size: 512 for an avatar. The caller turns
 * the canvas into the file it keeps (`toBlob`), so the format is its decision.
 */
export function drawCrop(source: CanvasImageSource, area: CropArea, size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("this browser has no 2d canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, area.x, area.y, area.size, area.size, 0, 0, size, size);
  return canvas;
}
