/**
 * The console shell's contract, rendered: the landmarks, which link is current,
 * that every icon-only rail link carries its name, and that the pages are links
 * rather than a tablist. Static markup only, as the other modern contracts.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsoleShell, type ConsoleRenderLink } from "./modern/index.js";

const renderLink: ConsoleRenderLink = ({ href, children, ...rest }) =>
  createElement("a", { href, ...rest }, children);

const icon = createElement("svg", { viewBox: "0 0 24 24" });

function shell(over: Partial<Parameters<typeof ConsoleShell>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(ConsoleShell, {
      product: "GFabric",
      context: createElement("span", null, "Gelhaus estate"),
      workspace: { label: "Firewall", icon, href: "/firewall" },
      pages: [
        { href: "/firewall/zones", label: "Zones" },
        { href: "/firewall/policies", label: "Policies", current: true },
      ],
      pagesLabel: "Firewall pages",
      rail: {
        label: "Workspaces",
        groups: [
          [
            { key: "overview", label: "Overview", icon, href: "/" },
            { key: "firewall", label: "Firewall", icon, href: "/firewall", current: true },
          ],
          [
            {
              key: "operations",
              label: "Operations",
              icon,
              href: "/cases",
              count: 3,
              countWords: "waiting",
            },
          ],
        ],
      },
      renderLink,
      skipLabel: "Skip to content",
      children: createElement("h1", null, "Policies") as ReactNode,
      ...over,
    }),
  );
}

describe("ConsoleShell", () => {
  it("has one header, a named rail, named page tabs and the main landmark", () => {
    const html = shell();
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Workspaces"');
    expect(html).toContain('aria-label="Firewall pages"');
    expect(html).toContain('<main id="content"');
    expect(html.indexOf('href="#content"')).toBeLessThan(html.indexOf("<header"));
  });

  it("marks the current page and the current workspace, nothing else", () => {
    const html = shell();
    const current = html.match(/aria-current="page"/g) ?? [];
    // The page, and the workspace twice: in the rail and in the narrow screen's sheet.
    expect(current).toHaveLength(3);
    expect(html).toMatch(/href="\/firewall\/policies"[^>]*aria-current="page"/);
    expect(html).toMatch(/href="\/firewall"[^>]*aria-current="page"[^>]*aria-label="Firewall"/);
  });

  it("names every rail icon, with what waits in it", () => {
    const html = shell();
    expect(html).toContain('aria-label="Overview"');
    expect(html).toContain('title="Overview"');
    expect(html).toContain('aria-label="Operations, 3 waiting"');
  });

  it("never announces the pages as a tablist", () => {
    expect(shell()).not.toContain('role="tab');
  });

  it("draws a group as one tab whose list holds its pages, and a group of one as a plain tab", () => {
    const html = shell({
      pages: [
        {
          key: "rules",
          label: "Rules",
          pages: [
            { href: "/firewall/zones", label: "Zones", count: 6 },
            {
              href: "/firewall/guests",
              label: "Guest rules",
              current: true,
              flag: "3 open to every source",
            },
          ],
        },
        { key: "access", label: "Access", pages: [{ href: "/firewall/grants", label: "Grants" }] },
        { key: "objects", label: "Objects", pages: [] },
      ],
    });
    const button = /<button[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*>Rules/.exec(
      html,
    );
    expect(button).not.toBeNull();
    const panel = new RegExp(`<div[^>]*hidden=""[^>]*id="${button?.[1] ?? "none"}"`);
    expect(html).toMatch(panel);
    expect(html).toMatch(/href="\/firewall\/guests"[^>]*aria-current="page"/);
    expect(html).toMatch(
      />Rules<span aria-hidden="true"[^>]*>›<\/span><span[^>]*><span class="sr-only">, <\/span>Guest rules<\/span>/,
    );
    expect(html).toContain(", 3 open to every source</span>");
    expect(html).toMatch(/>6<\/span>/);
    expect(html).toMatch(/<a href="\/firewall\/grants"[^>]*>Grants<\/a>/);
    expect(html).not.toContain(">Objects");
  });

  it("opens the workspaces from the workspace's button below 768px, with what waits", () => {
    const html = shell();
    expect(html).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*><span class="sr-only">Workspaces, <\/span>/,
    );
    const sheet = html.slice(html.indexOf('<span class="sr-only">Workspaces, </span>'));
    expect(sheet).toMatch(/<a href="\/"[^>]*aria-label="Overview"/);
    expect(sheet).toContain('aria-label="Operations, 3 waiting"');
    expect(html).toMatch(/aria-label="Workspaces" class="[^"]*max-md:hidden/);
  });

  it("makes the workspace tab current when the workspace has no pages", () => {
    const html = shell({ pages: [] });
    expect(html).not.toContain('aria-label="Firewall pages"');
    expect(html).toMatch(/href="\/firewall"[^>]*aria-current="page"[^>]*>(?!<\/a>)/);
  });
});
