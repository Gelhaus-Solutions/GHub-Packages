/**
 * The few DOM helpers both elements build their shadow trees with. Nothing here
 * runs until an element is constructed, so importing it on a server is safe.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  if (text !== undefined) made.textContent = text;
  return made;
}

/** An icon of one stroked or filled path, hidden from assistive technology. */
export function pathIcon(
  size: number,
  viewBox: string,
  d: string,
  stroke: { width: number } | null = null,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  if (stroke === null) {
    path.setAttribute("fill", "currentColor");
  } else {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", String(stroke.width));
    path.setAttribute("stroke-linecap", "round");
  }
  svg.append(path);
  return svg;
}

/** The close cross both popups draw. */
export function crossMark(): SVGSVGElement {
  return pathIcon(14, "0 0 14 14", "M2 2l10 10M12 2L2 12", { width: 1.6 });
}
