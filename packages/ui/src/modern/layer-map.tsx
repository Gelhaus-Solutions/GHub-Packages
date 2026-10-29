import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * How a place connects, layer by layer, left to right: the uplink, the
 * gateway, the networks behind it, the roles on one of them. Drawn first for
 * GFabric's Map page (D15) and general to any chain that fans out: a column per
 * depth, each node's children centred on it in the next column, joined by
 * straight segments (no graph layout, no curves), and a tunnel as a dashed
 * line to a node set under its end.
 *
 * **One node per column fans out.** That is what a chain is, and it keeps the
 * layout a few lines of arithmetic: children are centred on their parent and
 * nothing is pushed apart. Two fanning nodes in one column would overlap;
 * draw that as two maps.
 *
 * **The cards are a nested list, and the lines are a picture.** Each card is
 * an item of its parent's list, placed absolutely, so a screen reader walks
 * the tree in order and hears how deep it is; the segments are one
 * `aria-hidden` SVG. A tunnel's words ride on its card as hidden text, since
 * the label drawn beside the dashed line is part of the picture.
 *
 * The map keeps its width and scrolls sideways on a phone.
 */

export interface LayerMapLine {
  text: ReactNode;
  /** An address or a prefix: mono, in a step smaller. */
  mono?: boolean;
}

export interface LayerMapNode {
  key: string;
  title: ReactNode;
  /** After the title on its line: "VLAN 5", "CT 152". */
  tag?: ReactNode;
  lines?: readonly LayerMapLine[];
  /** The card opens this node's own page. */
  href?: string;
  /** The one node the map is about, in the accent: the public edge. */
  accent?: boolean;
  children?: readonly LayerMapNode[];
  /** A node joined to this one by a tunnel, set under it in the same column. */
  tunnel?: { node: LayerMapNode; label: string };
}

export interface LayerMapColumn {
  width: number;
  /** Every card in the column is this high. */
  height: number;
  /** The space between two cards fanned into this column. */
  gap: number;
}

export interface LayerMapProps {
  root: LayerMapNode;
  /** Left to right; deeper nodes than columns take the last one. */
  columns?: readonly LayerMapColumn[];
  /** The map's accessible name. */
  label: string;
  /** Renders a card that opens a page: the app's own link. A plain anchor otherwise. */
  renderLink?: (props: { href: string; className: string; children: ReactNode }) => ReactNode;
  className?: string;
}

export const LAYER_MAP_COLUMNS: readonly LayerMapColumn[] = [
  { width: 160, height: 72, gap: 24 },
  { width: 240, height: 96, gap: 24 },
  { width: 230, height: 64, gap: 24 },
  { width: 190, height: 72, gap: 40 },
];

/** Between two columns, and around the map: four columns fit a 1440 screen beside the rail. */
const COLUMN_GAP = 76;
const PAD = 24;
/** From the end of a tunnel's parent to the top of the node under it. */
const TUNNEL_DROP = 120;

export interface PlacedNode {
  node: LayerMapNode;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Set on the node at the far end of a tunnel. */
  tunnelOf?: string;
}

export interface MapSegment {
  /** SVG path data. */
  d: string;
  arrow: boolean;
  dashed: boolean;
}

export interface LayerMapLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  segments: MapSegment[];
  /** Where a tunnel's label sits, beside its dashed line. */
  labels: { key: string; x: number; y: number; text: string }[];
}

/** Every position on the map, from the tree alone. */
export function layoutLayerMap(
  root: LayerMapNode,
  columns: readonly LayerMapColumn[] = LAYER_MAP_COLUMNS,
): LayerMapLayout {
  const column = (depth: number) =>
    columns[Math.min(depth, columns.length - 1)] ?? { width: 200, height: 72, gap: 24 };
  const left = (depth: number) => {
    let x = PAD;
    for (let d = 0; d < depth; d += 1) x += column(d).width + COLUMN_GAP;
    return x;
  };
  const nodes: PlacedNode[] = [];
  const place = (node: LayerMapNode, depth: number, centre: number, tunnelOf?: string) => {
    const { width, height } = column(depth);
    const placed: PlacedNode = {
      node,
      depth,
      x: left(depth),
      y: centre - height / 2,
      width,
      height,
    };
    if (tunnelOf !== undefined) placed.tunnelOf = tunnelOf;
    nodes.push(placed);
    const kids = node.children ?? [];
    const step = column(depth + 1).height + column(depth + 1).gap;
    kids.forEach((kid, i) => place(kid, depth + 1, centre + (i - (kids.length - 1) / 2) * step));
    if (node.tunnel !== undefined) {
      const under = column(depth).height;
      place(node.tunnel.node, depth, centre + height / 2 + TUNNEL_DROP + under / 2, node.key);
    }
  };
  place(root, 0, 0);

  // Shift everything down so the topmost card sits at the pad.
  const top = Math.min(...nodes.map((n) => n.y));
  for (const n of nodes) n.y += PAD - top;
  const bottom = Math.max(...nodes.map((n) => n.y + n.height));
  const right = Math.max(...nodes.map((n) => n.x + n.width));

  const byKey = new Map(nodes.map((n) => [n.node.key, n]));
  const segments: MapSegment[] = [];
  const labels: LayerMapLayout["labels"] = [];
  const mid = (n: PlacedNode) => n.y + n.height / 2;
  for (const parent of nodes) {
    const kids = (parent.node.children ?? []).flatMap((kid) => {
      const placed = byKey.get(kid.key);
      return placed === undefined ? [] : [placed];
    });
    const from = parent.x + parent.width;
    if (kids.length === 1 && kids[0] !== undefined && mid(kids[0]) === mid(parent)) {
      segments.push({
        d: `M ${from} ${mid(parent)} L ${kids[0].x} ${mid(parent)}`,
        arrow: true,
        dashed: false,
      });
    } else if (kids.length > 0) {
      const bus = from + COLUMN_GAP / 2;
      const ys = [mid(parent), ...kids.map(mid)];
      segments.push({
        d: `M ${from} ${mid(parent)} L ${bus} ${mid(parent)}`,
        arrow: false,
        dashed: false,
      });
      segments.push({
        d: `M ${bus} ${Math.min(...ys)} L ${bus} ${Math.max(...ys)}`,
        arrow: false,
        dashed: false,
      });
      for (const kid of kids) {
        segments.push({
          d: `M ${bus} ${mid(kid)} L ${kid.x} ${mid(kid)}`,
          arrow: true,
          dashed: false,
        });
      }
    }
    if (parent.node.tunnel !== undefined) {
      const end = byKey.get(parent.node.tunnel.node.key);
      if (end !== undefined) {
        const x = parent.x + parent.width / 2;
        segments.push({
          d: `M ${x} ${end.y} L ${x} ${parent.y + parent.height}`,
          arrow: true,
          dashed: true,
        });
        labels.push({
          key: parent.node.key,
          x: x + 12,
          y: (end.y + parent.y + parent.height) / 2 - 8,
          text: parent.node.tunnel.label,
        });
      }
    }
  }
  return { width: right + PAD, height: bottom + PAD, nodes, segments, labels };
}

const CARD =
  "box-border flex size-full flex-col items-center justify-center gap-0 rounded-[12px] border px-2.5 py-2 text-center text-[13px] leading-[18px] text-m-ink bg-[color-mix(in_oklch,var(--gm-plate)_62%,transparent)] aurora:shadow-a-glass";

export function LayerMap({
  root,
  columns = LAYER_MAP_COLUMNS,
  label,
  renderLink,
  className,
}: LayerMapProps) {
  const layout = layoutLayerMap(root, columns);
  const at = new Map(layout.nodes.map((n) => [n.node.key, n]));
  const link =
    renderLink ??
    (({
      href,
      className: classes,
      children,
    }: {
      href: string;
      className: string;
      children: ReactNode;
    }) => (
      <a href={href} className={classes}>
        {children}
      </a>
    ));

  /*
   * The place on the map is a wrapper's, so a card that is the app's own link
   * needs nothing from the app but its classes.
   */
  const card = (node: LayerMapNode, tunnel?: string) => {
    const placed = at.get(node.key);
    if (placed === undefined) return null;
    const classes = cn(
      CARD,
      node.accent === true ? "border-m-accent aurora:shadow-a-glow-accent" : "border-m-hairline",
      node.href === undefined ? "" : "no-underline hover:border-m-subtle hover:bg-m-hover",
    );
    const body = (
      <>
        <span>
          <b className="font-semibold">{node.title}</b>
          {node.tag === undefined ? null : <span className="text-m-ink-2"> {node.tag}</span>}
        </span>
        {(node.lines ?? []).map((line, i) => (
          <span
            key={i}
            className={line.mono === true ? "font-mono text-[12px] text-m-ink-2" : "text-m-ink-2"}
          >
            {line.text}
          </span>
        ))}
        {tunnel === undefined ? null : <span className="sr-only">{tunnel}</span>}
      </>
    );
    return (
      <div
        className="absolute"
        style={{ left: placed.x, top: placed.y, width: placed.width, height: placed.height }}
      >
        {node.href === undefined ? (
          <div className={classes}>{body}</div>
        ) : (
          link({ href: node.href, className: classes, children: body })
        )}
      </div>
    );
  };

  const item = (node: LayerMapNode, tunnel?: string): ReactNode => (
    <li key={node.key}>
      {card(node, tunnel)}
      {node.children === undefined || node.children.length === 0 ? null : (
        <ul>{node.children.map((kid) => item(kid))}</ul>
      )}
      {node.tunnel === undefined ? null : <ul>{item(node.tunnel.node, node.tunnel.label)}</ul>}
    </li>
  );

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div
        role="group"
        aria-label={label}
        className="relative"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          aria-hidden="true"
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
          fill="none"
          stroke="var(--gm-ink-3)"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <defs>
            <marker
              id="layer-map-head"
              orient="auto"
              markerWidth="5"
              markerHeight="5"
              refX="2"
              refY="2"
              overflow="visible"
            >
              <path d="M0 0 L4 2 L0 4 Z" fill="var(--gm-ink-3)" stroke="none" />
            </marker>
          </defs>
          {layout.segments.map((segment, i) => (
            <path
              key={i}
              d={segment.d}
              {...(segment.dashed ? { strokeDasharray: "6 6" } : {})}
              {...(segment.arrow ? { markerEnd: "url(#layer-map-head)" } : {})}
            />
          ))}
        </svg>
        {layout.labels.map((tunnel) => (
          <span
            key={tunnel.key}
            aria-hidden="true"
            className="absolute w-[140px] text-[12.5px] leading-4 text-m-ink-3"
            style={{ left: tunnel.x, top: tunnel.y }}
          >
            {tunnel.text}
          </span>
        ))}
        <ul>{item(root)}</ul>
      </div>
    </div>
  );
}
