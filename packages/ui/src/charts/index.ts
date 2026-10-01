/**
 * Charts.
 *
 * Two tools, one rule each:
 *   - Sparkline is SVG, renders on the server, and belongs in tiles and table rows.
 *   - Timeseries wraps ECharts exactly once, themed from CSS tokens, and belongs
 *     in interactive panels.
 *
 * Manifest health descriptors map onto exactly these, which is what keeps the
 * generated UI from needing a chart-configuration language of its own.
 */

export * from "./sparkline.js";
export * from "./timeseries.js";
