/**
 * That a product's server says who is signed in and nothing else, reuses an answer
 * for a minute, batches a push, and never lets its token leave in anything it
 * throws or answers.
 */

import { describe, expect, it } from "vitest";
import { BATCH, ChromeError, createChromeServer } from "./server.js";

const TOKEN = "gpid_lt_a-secret-token-that-must-never-leave";
const NOW = 1_800_000_000_000;

const view = {
  person: { hasIdentity: false, avatarUrl: null },
  yours: [
    {
      slug: "advisory",
      displayName: "Advisory",
      homeUrl: "https://advisory.example.test/",
      iconUrl: null,
      current: true,
    },
  ],
  more: [],
};

type Call = { url: string; init: RequestInit };

function fetchOf(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fake = ((url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return Promise.resolve(answer(call));
  }) as unknown as typeof fetch;
  return { fake, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

function server(fake: typeof fetch, extra: { viewCacheSeconds?: number; now?: () => number } = {}) {
  return createChromeServer({
    baseUrl: "https://identity.example.test/",
    product: "advisory",
    token: TOKEN,
    fetch: fake,
    ...extra,
  });
}

describe("view", () => {
  it("says which product it is, proves it with the token, and asks about one address", async () => {
    const { fake, calls } = fetchOf(() => json(view));
    await server(fake).view("Mira@Example.test");

    expect(calls[0]?.url).toBe("https://identity.example.test/api/v1/chrome/view");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      "x-gpid-product": "advisory",
      authorization: `Bearer ${TOKEN}`,
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: "Mira@Example.test" });
  });

  it("returns what Identity said, checked", async () => {
    const { fake } = fetchOf(() => json(view));
    expect((await server(fake).view("a@example.test")).yours[0]?.slug).toBe("advisory");
  });

  it("reuses an answer for a minute, whatever case the address is in", async () => {
    let now = NOW;
    const { fake, calls } = fetchOf(() => json(view));
    const chrome = server(fake, { now: () => now });

    await chrome.view("Mira@example.test");
    now += 59_000;
    await chrome.view("mira@EXAMPLE.test");
    expect(calls).toHaveLength(1);

    now += 2_000;
    await chrome.view("mira@example.test");
    expect(calls).toHaveLength(2);
  });

  it("asks every time when told to reuse nothing", async () => {
    const { fake, calls } = fetchOf(() => json(view));
    const chrome = server(fake, { viewCacheSeconds: 0 });

    await chrome.view("a@example.test");
    await chrome.view("a@example.test");

    expect(calls).toHaveLength(2);
  });

  it("forgets one person on sign-out", async () => {
    const { fake, calls } = fetchOf(() => json(view));
    const chrome = server(fake, { now: () => NOW });

    await chrome.view("a@example.test");
    chrome.forget("A@example.test");
    await chrome.view("a@example.test");

    expect(calls).toHaveLength(2);
  });

  it("holds a bounded number of people, so a busy product does not grow without limit", async () => {
    const { fake, calls } = fetchOf(() => json(view));
    const chrome = server(fake, { now: () => NOW });

    for (let i = 0; i < 501; i += 1) await chrome.view(`p${String(i)}@example.test`);
    await chrome.view("p0@example.test");

    // The first was the oldest, so it was the one let go.
    expect(calls).toHaveLength(502);
  });

  it("carries how long to wait when Identity says", async () => {
    const { fake } = fetchOf(
      () => new Response("", { status: 429, headers: { "retry-after": "7" } }),
    );
    const error = await server(fake)
      .view("a@example.test")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChromeError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 7 });
  });

  it("is a status of zero when Identity could not be reached at all", async () => {
    const { fake } = fetchOf(() => {
      throw new Error("ECONNREFUSED");
    });
    expect(
      await server(fake)
        .view("a@example.test")
        .catch((e: unknown) => e),
    ).toMatchObject({ status: 0 });
  });

  it("refuses an answer that is not a view", async () => {
    const { fake } = fetchOf(() => json({ nonsense: true }));
    expect(
      await server(fake)
        .view("a@example.test")
        .catch((e: unknown) => e),
    ).toMatchObject({ status: 502 });
  });

  it("never puts the token in anything it throws", async () => {
    for (const answer of [
      () => new Response("", { status: 401 }),
      () => new Response("", { status: 500 }),
      () => json({ nonsense: true }),
      () => {
        throw new Error(`failed with ${TOKEN}`);
      },
    ]) {
      const { fake } = fetchOf(answer);
      const error = (await server(fake)
        .view("a@example.test")
        .catch((e: unknown) => e)) as Error;
      expect(String(error.message)).not.toContain(TOKEN);
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }
  });
});

describe("seed and remove", () => {
  it("push in batches of a thousand and add up what Identity says it changed", async () => {
    const { fake, calls } = fetchOf((call) => {
      const body = JSON.parse(String(call.init.body)) as { emails: string[] };
      return json({ changed: body.emails.length });
    });
    const emails = Array.from({ length: BATCH * 2 + 500 }, (_, i) => `p${String(i)}@example.test`);

    const result = await server(fake).seed(emails);

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.init.method === "PUT")).toBe(true);
    expect(
      calls.map(
        (call) => (JSON.parse(String(call.init.body)) as { emails: string[] }).emails.length,
      ),
    ).toEqual([BATCH, BATCH, 500]);
    expect(result).toEqual({ changed: BATCH * 2 + 500 });
  });

  it("remove uses DELETE on the same address", async () => {
    const { fake, calls } = fetchOf(() => json({ changed: 1 }));
    expect(await server(fake).remove(["a@example.test"])).toEqual({ changed: 1 });
    expect(calls[0]).toMatchObject({ url: "https://identity.example.test/api/v1/chrome/access" });
    expect(calls[0]?.init.method).toBe("DELETE");
  });

  it("stops at the first refusal rather than carrying on with the rest", async () => {
    const { fake, calls } = fetchOf(() => new Response("", { status: 403 }));
    const emails = Array.from({ length: BATCH + 1 }, (_, i) => `p${String(i)}@example.test`);

    await expect(server(fake).seed(emails)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });
});

describe("handler", () => {
  const request = (method = "GET") =>
    new Request("https://advisory.example.test/_gpid/chrome", { method });

  it("answers the view of whoever is signed in, never cached", async () => {
    const { fake } = fetchOf(() => json(view));
    const handle = server(fake).handler(() => ({ email: "a@example.test" }));

    const response = await handle(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(((await response.json()) as typeof view).yours[0]?.slug).toBe("advisory");
  });

  it("answers 401 for nobody, and asks Identity nothing", async () => {
    const { fake, calls } = fetchOf(() => json(view));
    const response = await server(fake).handler(() => null)(request());

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("answers only GET", async () => {
    const { fake } = fetchOf(() => json(view));
    const response = await server(fake).handler(() => ({ email: "a@example.test" }))(
      request("POST"),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("answers 503 with how long to wait when Identity is limiting it, and says nothing about why", async () => {
    const { fake } = fetchOf(
      () => new Response("", { status: 429, headers: { "retry-after": "7" } }),
    );
    const response = await server(fake).handler(() => ({ email: "a@example.test" }))(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(await response.text()).toBe(JSON.stringify({ error: "unavailable" }));
  });

  it("answers 503 for anything else, with a short wait, and nothing of the token", async () => {
    const { fake } = fetchOf(() => {
      throw new Error(TOKEN);
    });
    const response = await server(fake).handler(() => ({ email: "a@example.test" }))(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.text()).not.toContain(TOKEN);
  });

  it("works detached from the server it came from", async () => {
    const { fake } = fetchOf(() => json(view));
    const { handler } = server(fake);

    expect((await handler(() => ({ email: "a@example.test" }))(request())).status).toBe(200);
  });
});
