/**
 * The pieces drawn for GFabric's overview and Map (D14, D15): the auroras, the
 * swimlane timeline and the layer map. Their layout is arithmetic, so it is
 * measured here; their markup is rendered statically, as in
 * modern-components.test.ts, for the parts a screenshot cannot check: what a
 * screen reader is given and what it is spared.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Auroras,
  EVENT_ROWS,
  LayerMap,
  layoutLayerMap,
  placeEvents,
  SwimlaneTimeline,
  timelineFraction,
  type LayerMapNode,
  type SwimlaneTimelineProps,
} from "./modern/index.js";

function render(node: ReactNode): string {
  return renderToStaticMarkup(node as never);
}

const at = (hhmm: string) => `2026-10-29T${hhmm}:00+01:00`;
const START = at("02:00");
const END = at("05:00");

describe("Auroras", () => {
  it("is decoration only", () => {
    const html = render(createElement(Auroras));
    expect(html).toMatch(
      /^<div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10/u,
    );
    expect(html.match(/animate-a-drift-/gu)).toHaveLength(3);
  });
});

describe("timelineFraction", () => {
  it("places an instant between the ends and clamps outside them", () => {
    expect(timelineFraction(at("03:30"), START, END)).toBe(0.5);
    expect(timelineFraction(at("01:00"), START, END)).toBe(0);
    expect(timelineFraction(at("06:00"), START, END)).toBe(1);
    expect(timelineFraction(at("03:00"), START, START)).toBe(0);
  });
});

describe("placeEvents", () => {
  const event = (key: string, hhmm: string, label: string) => ({
    key,
    at: at(hhmm),
    time: hhmm,
    label,
  });

  it("puts events on the first row their label fits and turns late labels to the left", () => {
    const placed = placeEvents(
      [
        event("c", "02:41", "Sets lan and v4any"),
        event("a", "02:04", "First run"),
        event("b", "02:12", "Internet IPv6 reaches 12 guests"),
        event("d", "04:30", "Three changes planned"),
        event("e", "04:21", "Seven dead forwards deleted"),
      ],
      START,
      END,
    );
    expect(placed.map((p) => [p.key, p.row, p.side])).toEqual([
      ["a", 0, "right"],
      ["b", 1, "right"],
      ["c", 0, "right"],
      // The deleted forwards' label runs back over both earlier ones; three changes fit row 0.
      ["e", 2, "left"],
      ["d", 0, "left"],
    ]);
  });

  it("gives a long label more room than a short one", () => {
    const short = placeEvents(
      [event("a", "02:04", "First run"), event("b", "02:45", "Next")],
      START,
      END,
    );
    const long = placeEvents(
      [event("a", "02:04", "Fixed: NIC firewall off, npm (152) net0"), event("b", "02:45", "Next")],
      START,
      END,
    );
    expect(short.map((p) => p.row)).toEqual([0, 0]);
    expect(long.map((p) => p.row)).toEqual([0, 1]);
  });

  it("still places every event when all rows collide", () => {
    const crowd = Array.from({ length: EVENT_ROWS + 2 }, (_, i) =>
      event(`e${i}`, "02:10", "Crowded"),
    );
    const placed = placeEvents(crowd, START, END);
    expect(placed).toHaveLength(EVENT_ROWS + 2);
    expect(placed.every((p) => p.row >= 0 && p.row < EVENT_ROWS)).toBe(true);
    // The two without room keep their markers and lose their labels.
    expect(placed.map((p) => p.labelled)).toEqual([true, true, true, true, false, false]);
  });
});

const timeline: SwimlaneTimelineProps = {
  start: START,
  end: END,
  now: at("04:35"),
  events: [
    { key: "first", at: at("02:04"), time: "02:04", level: "info", label: "First run" },
    {
      key: "open",
      at: at("02:12"),
      time: "02:12",
      level: "crit",
      label: "Internet IPv6 reaches 12 guests",
    },
  ],
  lanes: [
    {
      key: "firewall",
      label: "Firewall",
      bars: [
        {
          key: "a",
          from: at("02:04"),
          to: at("03:50"),
          level: "warn",
          label: "7 NICs off",
          span: "02:04 to 03:50",
        },
        {
          key: "b",
          from: at("03:50"),
          to: at("04:35"),
          level: "ok",
          label: "Every NIC on",
          span: "03:50 to now",
        },
        {
          key: "c",
          from: at("04:35"),
          to: at("05:00"),
          level: "accent",
          label: "Old /56 out of lan",
          span: "after approval",
          planned: true,
        },
      ],
    },
  ],
  ticks: [
    { at: at("02:00"), label: "02:00" },
    { at: at("03:30"), label: "03:30" },
  ],
  labels: {
    events: "Events",
    now: "now 04:35",
    eventList: "Events, oldest first",
    laneList: "State by concern",
  },
};

describe("SwimlaneTimeline", () => {
  const html = render(createElement(SwimlaneTimeline, timeline));

  it("hides the drawing and says the same in lists", () => {
    expect(html).toContain('aria-hidden="true" class="relative grid min-w-[820px] flex-1');
    // A strip wider than its pane opens at its end, at now.
    expect(html).toContain('<div class="flex flex-row-reverse overflow-x-auto">');
    expect(html).toContain('<ol aria-label="Events, oldest first"><li>02:04: First run</li>');
    expect(html).toContain("<li>03:50 to now: Every NIC on</li>");
  });

  it("draws now as a line and a pill, and hatches what comes after it", () => {
    expect(html).toContain("left:calc(122px + (100% - 122px) * 0.8611)");
    expect(html).toContain(">now 04:35</span>");
    // Now at the strip's end: the pill turns inward instead of leaving it.
    const atEnd = render(createElement(SwimlaneTimeline, { ...timeline, now: END }));
    expect(atEnd).toMatch(/-translate-x-full" style="left:100\.00%">now 04:35/u);
    expect(html).toContain("border-dashed border-m-accent");
    expect(html.match(/repeating-linear-gradient\(135deg,var\(--gm-hover\)/gu)).toHaveLength(2);
  });

  it("draws a marker without its label when no row has room, titled with both", () => {
    const crowded = render(
      createElement(SwimlaneTimeline, {
        ...timeline,
        events: Array.from({ length: EVENT_ROWS + 1 }, (_, i) => ({
          key: `e${i}`,
          at: at("02:10"),
          time: "02:10",
          level: "info" as const,
          label: `Event ${i}`,
        })),
      }),
    );
    expect(crowded).toContain('title="02:10 Event 4"');
    expect(crowded).toContain("<li>02:10: Event 4</li>");
  });

  it("fills a crit marker, so it reads without its hue", () => {
    expect(html).toContain("text-m-crit bg-current");
  });
});

const map: LayerMapNode = {
  key: "internet",
  title: "Internet",
  lines: [{ text: "EWE-Tel fiber" }],
  children: [
    {
      key: "gateway",
      title: "UCG Fiber",
      lines: [{ text: "80.228.222.236", mono: true }],
      tunnel: { node: { key: "vps1", title: "vps1" }, label: "WireGuard, IPv4 only" },
      children: [
        { key: "default", title: "Default" },
        {
          key: "servers",
          title: "Servernetzwerk",
          tag: "VLAN 5",
          children: [
            { key: "npm", title: "NPMplus", accent: true, href: "/hosts/npm" },
            { key: "pve", title: "Proxmox" },
          ],
        },
        { key: "guests", title: "Gastnetzwerk" },
      ],
    },
  ],
};

describe("layoutLayerMap", () => {
  const layout = layoutLayerMap(map);
  const node = (key: string) => layout.nodes.find((n) => n.node.key === key);
  const mid = (key: string) => {
    const n = node(key);
    return n === undefined ? Number.NaN : n.y + n.height / 2;
  };

  it("sets each depth in its column and centres children on their parent", () => {
    expect(layout.nodes.map((n) => [n.node.key, n.depth, n.x])).toEqual([
      ["internet", 0, 24],
      ["gateway", 1, 260],
      ["default", 2, 576],
      ["servers", 2, 576],
      ["npm", 3, 882],
      ["pve", 3, 882],
      ["guests", 2, 576],
      ["vps1", 1, 260],
    ]);
    expect(mid("servers")).toBe(mid("gateway"));
    expect(mid("default") + mid("guests")).toBe(2 * mid("servers"));
    expect(mid("npm") + mid("pve")).toBe(2 * mid("servers"));
  });

  it("hangs a tunnel's end under its parent and draws it dashed", () => {
    const gateway = node("gateway");
    expect(node("vps1")?.y).toBe((gateway?.y ?? 0) + (gateway?.height ?? 0) + 120);
    expect(layout.segments.filter((s) => s.dashed)).toHaveLength(1);
    expect(layout.labels.map((l) => l.text)).toEqual(["WireGuard, IPv4 only"]);
  });

  it("joins a lone child straight and a fan through a bus", () => {
    const arrows = layout.segments.filter((s) => s.arrow && !s.dashed);
    // Internet to the gateway, three networks, two roles.
    expect(arrows).toHaveLength(6);
    expect(layout.segments.filter((s) => !s.arrow)).toHaveLength(4);
    expect(Math.min(...layout.nodes.map((n) => n.y))).toBe(24);
  });
});

describe("LayerMap", () => {
  const html = render(
    createElement(LayerMap, {
      root: map,
      label: "How the estate connects",
      renderLink: ({ href, className, children }) =>
        createElement("a", { href, className, "data-app": "" }, children),
    }),
  );

  it("is a named group whose cards are a nested list in tree order", () => {
    expect(html).toContain('role="group" aria-label="How the estate connects"');
    const order = [...html.matchAll(/<b class="font-semibold">([^<]+)<\/b>/gu)].map((m) => m[1]);
    expect(order).toEqual([
      "Internet",
      "UCG Fiber",
      "Default",
      "Servernetzwerk",
      "NPMplus",
      "Proxmox",
      "Gastnetzwerk",
      "vps1",
    ]);
    expect(html).toContain("<ul><li>");
  });

  it("opens a card through the app's link, marks the edge, and says the tunnel in words", () => {
    expect(html).toMatch(/<a href="\/hosts\/npm" class="[^"]*border-m-accent[^"]*" data-app="">/u);
    expect(html).toContain('<span class="sr-only">WireGuard, IPv4 only</span>');
    expect(html).toContain('<svg aria-hidden="true"');
  });
});
