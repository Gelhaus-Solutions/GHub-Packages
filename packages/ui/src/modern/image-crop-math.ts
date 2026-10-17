/**
 * The arithmetic behind `ImageCrop`, apart from the DOM so it can be tested
 * without one.
 *
 * The crop is a circle of a fixed diameter in the middle of the view, and the
 * picture moves and scales under it. At zoom 1 the picture's shorter side
 * exactly spans the circle, so the circle can never show anything that is not
 * the picture; zooming in is the only way to make it larger.
 */

/** The view and the circle in it, in CSS pixels. */
export interface CropView {
  width: number;
  height: number;
  diameter: number;
}

/** The picture's own size, in its pixels. */
export interface CropImage {
  width: number;
  height: number;
}

/**
 * Where the picture is: its zoom, and how far its centre sits from the view's
 * centre in CSS pixels.
 */
export interface CropPosition {
  zoom: number;
  x: number;
  y: number;
}

/** The square inside the circle, in the picture's own pixels. */
export interface CropArea {
  x: number;
  y: number;
  size: number;
}

/** CSS pixels per picture pixel at zoom 1: the shorter side spans the circle. */
export function cropBaseScale(image: CropImage, view: CropView): number {
  return view.diameter / Math.min(image.width, image.height);
}

// Plus zero, so an edge with no slack answers 0 rather than -0.
const within = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value)) + 0;

/**
 * A position the circle can stand at: the zoom inside its bounds, and the
 * picture moved no further than keeps the whole circle on it.
 */
export function clampCropPosition(
  image: CropImage,
  view: CropView,
  position: CropPosition,
  minZoom = 1,
  maxZoom = 4,
): CropPosition {
  const zoom = within(position.zoom, minZoom, maxZoom);
  const scale = cropBaseScale(image, view) * zoom;
  const slackX = Math.max(0, (image.width * scale - view.diameter) / 2);
  const slackY = Math.max(0, (image.height * scale - view.diameter) / 2);
  return { zoom, x: within(position.x, -slackX, slackX), y: within(position.y, -slackY, slackY) };
}

/**
 * The same spot under the circle at a new zoom.
 *
 * The offset is in screen pixels, so scaling it with the zoom keeps the point
 * of the picture that was under the circle's centre there; then it is clamped,
 * because zooming out can leave the circle hanging off an edge.
 */
export function zoomCropPosition(
  image: CropImage,
  view: CropView,
  position: CropPosition,
  zoom: number,
  minZoom = 1,
  maxZoom = 4,
): CropPosition {
  const next = within(zoom, minZoom, maxZoom);
  const ratio = next / position.zoom;
  return clampCropPosition(
    image,
    view,
    { zoom: next, x: position.x * ratio, y: position.y * ratio },
    minZoom,
    maxZoom,
  );
}

/** The square of the picture the circle covers. */
export function cropArea(image: CropImage, view: CropView, position: CropPosition): CropArea {
  const scale = cropBaseScale(image, view) * position.zoom;
  const size = view.diameter / scale;
  return {
    x: image.width / 2 - position.x / scale - size / 2,
    y: image.height / 2 - position.y / scale - size / 2,
    size,
  };
}
