/**
 * That a product reads its own name and mark from Identity, keeps the last good
 * one through an outage, and never draws an address that is not a web address.
 */

import { describe, expect, it } from "vitest";
import { catalogueMarkUrl, createCatalogue } from "./catalogue.js";

const ENTRY = {
  slug: "gadvisory",
  displayName: "GAdvisory",
  homeUrl: "https://gadvisory.example.test/",
  iconUrl: "https://identity.example.test/api/v1/assets/abc123def",
  monoIconUrl: "https://identity.example.test/api/v1/assets/def456abc",
  updatedAt: "2026-10-17T04:40:00.000Z",
};

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function fetchOf(answers: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next === undefined) throw new Error("no more answers");
    return Promise.resolve(next());
  }) as unknown as typeof fetch;
  return { fake, calls };
}

describe("the address that always leads to a mark", () => {
  it("is Identity's, per slug and variant, whatever the trailing slash", () => {
    expect(catalogueMarkUrl("https://identity.example.test/", "gadvisory")).toBe(
      "https://identity.example.test/api/v1/catalogue/gadvisory/icon",
    );
    expect(catalogueMarkUrl("https://identity.example.test", "gadvisory", "mono")).toBe(
      "https://identity.example.test/api/v1/catalogue/gadvisory/icon/mono",
    );
  });
});

describe("an entry", () => {
  it("is asked for without credentials and reused for the cache time", async () => {
    let clock = 0;
    const { fake, calls } = fetchOf([
      () => ok(ENTRY),
      () => ok({ ...ENTRY, displayName: "GAdvisory Next" }),
    ]);
    const catalogue = createCatalogue({
      baseUrl: "https://identity.example.test",
      fetch: fake,
      now: () => clock,
    });

    expect(await catalogue.entry("gadvisory")).toEqual(ENTRY);
    clock = 59_000;
    expect((await catalogue.entry("gadvisory"))?.displayName).toBe("GAdvisory");
    clock = 61_000;
    expect((await catalogue.entry("gadvisory"))?.displayName).toBe("GAdvisory Next");

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://identity.example.test/api/v1/catalogue/gadvisory");
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  it("keeps the last good one when Identity fails, and has none before the first", async () => {
    let clock = 0;
    const { fake } = fetchOf([
      () => new Response("", { status: 503 }),
      () => ok(ENTRY),
      () => new Response("", { status: 500 }),
    ]);
    const catalogue = createCatalogue({
      baseUrl: "https://identity.example.test",
      fetch: fake,
      now: () => clock,
    });

    expect(await catalogue.entry("gadvisory")).toBeNull();
    expect(await catalogue.entry("gadvisory")).toEqual(ENTRY);
    clock = 120_000;
    expect(await catalogue.entry("gadvisory")).toEqual(ENTRY);
  });

  it("is null for a product Identity does not have", async () => {
    const { fake } = fetchOf([() => new Response("", { status: 404 })]);
    const catalogue = createCatalogue({ baseUrl: "https://identity.example.test", fetch: fake });
    expect(await catalogue.entry("nothing")).toBeNull();
  });

  it("drops a mark whose address is not a web address, and refuses an entry without a home", async () => {
    const { fake } = fetchOf([
      () => ok({ ...ENTRY, iconUrl: "javascript:alert(1)" }),
      () => ok({ ...ENTRY, homeUrl: "data:text/html,x" }),
    ]);
    const catalogue = createCatalogue({
      baseUrl: "https://identity.example.test",
      fetch: fake,
      cacheSeconds: 0,
    });

    expect((await catalogue.entry("gadvisory"))?.iconUrl).toBeNull();
    // The second answer is not an entry, so the last good one stands.
    expect((await catalogue.entry("gadvisory"))?.homeUrl).toBe(ENTRY.homeUrl);
  });
});
