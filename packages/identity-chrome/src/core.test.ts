/**
 * That the controls are silent unless enabled, paint what they held at once, keep
 * it when a refresh fails, and never draw an address that is not a web address.
 */

import { describe, expect, it } from "vitest";
import { CACHE_KEY, CACHE_MAX_AGE_MS, createChromeCore, type StorageLike } from "./core.js";
import type { ChromeView } from "./types.js";

const NOW = 1_800_000_000_000;

const tile = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  displayName: slug.toUpperCase(),
  homeUrl: `https://${slug}.example.test/`,
  iconUrl: null,
  current: false,
  ...extra,
});

const LEGAL = {
  termsUrl: "https://legal.example.test/terms",
  privacyUrl: "https://legal.example.test/privacy",
};

const view = (over: Partial<ChromeView> = {}): ChromeView => ({
  person: { hasIdentity: true, avatarUrl: "https://identity.example.test/a.png" },
  yours: [tile("advisory", { current: true }), tile("analytics")],
  more: [tile("registry")],
  legal: LEGAL,
  ...over,
});

function memory(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function fetchOf(answer: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(answer(url, init));
  }) as unknown as typeof fetch;
  return { fake, calls };
}

const cacheEntry = (savedAt: number, body: unknown) =>
  JSON.stringify({ v: 1, savedAt, view: body });

describe("when it is not enabled", () => {
  it("fetches nothing and touches no storage, so a self-hosted install calls nobody", async () => {
    const { fake, calls } = fetchOf(() => ok(view()));
    const touched: string[] = [];
    const storage: StorageLike = {
      getItem: () => (touched.push("get"), null),
      setItem: () => void touched.push("set"),
      removeItem: () => void touched.push("remove"),
    };
    const core = createChromeCore({ endpoint: "/api/chrome", storage, fetch: fake });

    const state = await core.load();

    expect(state.status).toBe("off");
    expect(calls).toEqual([]);
    expect(touched).toEqual([]);

    // Forgetting is the one thing it still does, because wiping a list is never a leak.
    core.clear();
    expect(touched).toEqual(["remove"]);
  });

  it("is off for anything but exactly true", async () => {
    const { fake, calls } = fetchOf(() => ok(view()));
    const core = createChromeCore({
      enabled: "yes" as unknown as boolean,
      endpoint: "/x",
      fetch: fake,
    });
    expect((await core.load()).status).toBe("off");
    expect(calls).toEqual([]);
  });
});

describe("a fresh answer", () => {
  it("is fetched from the product's own route with its cookie, and kept", async () => {
    const storage = memory();
    const { fake, calls } = fetchOf(() => ok(view()));
    const core = createChromeCore({
      enabled: true,
      endpoint: "/api/chrome",
      storage,
      fetch: fake,
      now: () => NOW,
    });

    const seen: string[] = [];
    core.subscribe((next) => seen.push(next.status));
    const state = await core.load();

    expect(calls[0]?.url).toBe("/api/chrome");
    expect(calls[0]?.init.credentials).toBe("same-origin");
    expect(state).toMatchObject({ status: "ready", updatedAt: NOW, error: null });
    expect(state.view?.yours.map((one) => one.slug)).toEqual(["advisory", "analytics"]);
    expect(seen).toEqual(["loading", "ready"]);
    expect(JSON.parse(storage.data.get(CACHE_KEY) ?? "{}")).toMatchObject({ savedAt: NOW });
  });

  it("is shared by two calls at once, which make one fetch", async () => {
    const { fake, calls } = fetchOf(() => ok(view()));
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });

    await Promise.all([core.load(), core.load()]);

    expect(calls).toHaveLength(1);
  });
});

describe("the list it held", () => {
  it("is drawn at once while the fresh one is fetched", async () => {
    const storage = memory({
      [CACHE_KEY]: cacheEntry(NOW - 3_600_000, view({ yours: [tile("old")] })),
    });
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => (release = resolve));
    const { fake } = fetchOf(() => pending);
    const core = createChromeCore({
      enabled: true,
      endpoint: "/x",
      storage,
      fetch: fake,
      now: () => NOW,
    });

    const done = core.load();
    expect(core.state()).toMatchObject({ status: "loading", updatedAt: NOW - 3_600_000 });
    expect(core.state().view?.yours.map((one) => one.slug)).toEqual(["old"]);

    release(ok(view()));
    expect((await done).view?.yours.map((one) => one.slug)).toEqual(["advisory", "analytics"]);
  });

  it("is kept and marked stale when the refresh fails, with when it is from", async () => {
    const savedAt = NOW - 7_200_000;
    const storage = memory({ [CACHE_KEY]: cacheEntry(savedAt, view()) });
    const { fake } = fetchOf(() => new Response("", { status: 503 }));
    const core = createChromeCore({
      enabled: true,
      endpoint: "/x",
      storage,
      fetch: fake,
      now: () => NOW,
    });

    const state = await core.load();

    expect(state).toMatchObject({ status: "stale", updatedAt: savedAt, error: "status 503" });
    expect(state.view?.yours).toHaveLength(2);
  });

  it("is not drawn when it is older than thirty days", async () => {
    const storage = memory({ [CACHE_KEY]: cacheEntry(NOW - CACHE_MAX_AGE_MS - 1, view()) });
    const { fake } = fetchOf(() => new Response("", { status: 503 }));
    const core = createChromeCore({
      enabled: true,
      endpoint: "/x",
      storage,
      fetch: fake,
      now: () => NOW,
    });

    expect(await core.load()).toMatchObject({ status: "error", view: null });
  });

  it("is not drawn when it is dated in the future, which only somebody editing it would do", async () => {
    const storage = memory({ [CACHE_KEY]: cacheEntry(NOW + 86_400_000, view()) });
    const { fake } = fetchOf(() => new Response("", { status: 503 }));
    const core = createChromeCore({
      enabled: true,
      endpoint: "/x",
      storage,
      fetch: fake,
      now: () => NOW,
    });

    expect((await core.load()).view).toBeNull();
  });

  it("is ignored when it is not what was written", async () => {
    for (const junk of [
      "not json",
      "{}",
      JSON.stringify({ savedAt: NOW, view: { yours: 1 } }),
      "null",
    ]) {
      const storage = memory({ [CACHE_KEY]: junk });
      const { fake } = fetchOf(() => new Response("", { status: 503 }));
      const core = createChromeCore({
        enabled: true,
        endpoint: "/x",
        storage,
        fetch: fake,
        now: () => NOW,
      });
      expect((await core.load()).view).toBeNull();
    }
  });

  it("is forgotten on clear, which a product calls on sign-out", async () => {
    const storage = memory({ [CACHE_KEY]: cacheEntry(NOW, view()) });
    const { fake } = fetchOf(() => ok(view()));
    const core = createChromeCore({
      enabled: true,
      endpoint: "/x",
      storage,
      fetch: fake,
      now: () => NOW,
    });
    await core.load();

    core.clear();

    expect(storage.data.has(CACHE_KEY)).toBe(false);
    expect(core.state()).toMatchObject({ status: "idle", view: null });
  });

  it("works when storage throws, as it does in a private window", async () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const { fake } = fetchOf(() => ok(view()));
    const core = createChromeCore({ enabled: true, endpoint: "/x", storage, fetch: fake });

    expect((await core.load()).status).toBe("ready");
    expect(() => core.clear()).not.toThrow();
  });
});

describe("what it will draw", () => {
  it("drops a tile whose address is not a web address, and does not repair it", async () => {
    const { fake } = fetchOf(() =>
      ok(
        view({
          yours: [
            tile("ok"),
            tile("script", { homeUrl: "javascript:alert(1)" }),
            tile("data", { homeUrl: "data:text/html,x" }),
            tile("relative", { homeUrl: "/just/a/path" }),
          ] as ChromeView["yours"],
        }),
      ),
    );
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });

    expect((await core.load()).view?.yours.map((one) => one.slug)).toEqual(["ok"]);
  });

  it("keeps a tile and drops an icon whose address is not a web address", async () => {
    const { fake } = fetchOf(() =>
      ok(
        view({
          yours: [
            tile("a", { iconUrl: "javascript:alert(1)" }),
            tile("b", { iconUrl: "https://i.example.test/b.svg" }),
          ] as ChromeView["yours"],
        }),
      ),
    );
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });

    const state = await core.load();
    expect(state.view?.yours.map((one) => one.iconUrl)).toEqual([
      null,
      "https://i.example.test/b.svg",
    ]);
  });

  it("drops an avatar that is not a web address", async () => {
    const { fake } = fetchOf(() =>
      ok(view({ person: { hasIdentity: true, avatarUrl: "javascript:x" } })),
    );
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });
    expect((await core.load()).view?.person.avatarUrl).toBeNull();
  });

  it("carries the footer links Identity sent", async () => {
    const { fake } = fetchOf(() => ok(view()));
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });
    expect((await core.load()).view?.legal).toEqual(LEGAL);
  });

  it("draws no footer when either link is not a web address, or none was sent", async () => {
    const { fake } = fetchOf((url) =>
      url === "/bad"
        ? ok(view({ legal: { termsUrl: "javascript:x", privacyUrl: LEGAL.privacyUrl } }))
        : ok({ ...view(), legal: undefined }),
    );
    const bad = createChromeCore({ enabled: true, endpoint: "/bad", fetch: fake });
    const none = createChromeCore({ enabled: true, endpoint: "/none", fetch: fake });

    expect(await bad.load()).toMatchObject({ status: "ready", view: { legal: null } });
    expect(await none.load()).toMatchObject({ status: "ready", view: { legal: null } });
  });

  it("refuses an answer that is not a view", async () => {
    const { fake } = fetchOf(() => ok({ hello: "world" }));
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });
    expect(await core.load()).toMatchObject({
      status: "error",
      error: "invalid answer",
      view: null,
    });
  });
});

describe("a call that does not come back", () => {
  it("is given up on after the timeout, and says so", async () => {
    const { fake } = fetchOf(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake, timeoutMs: 20 });

    expect(await core.load()).toMatchObject({ status: "error", error: "timeout" });
  });

  it("says network for anything else that went wrong, and never what was in it", async () => {
    const { fake } = fetchOf(() => {
      throw new Error("ECONNRESET https://secret.example.test");
    });
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });

    const state = await core.load();
    expect(state.error).toBe("network");
  });

  it("is ignored once the controls are gone", async () => {
    let release: (response: Response) => void = () => undefined;
    const { fake } = fetchOf(() => new Promise<Response>((resolve) => (release = resolve)));
    const core = createChromeCore({ enabled: true, endpoint: "/x", fetch: fake });
    const seen: string[] = [];
    core.subscribe((next) => seen.push(next.status));

    const done = core.load();
    core.dispose();
    release(ok(view()));
    await done;

    expect(seen).toEqual(["loading"]);
  });
});

describe("the public half", () => {
  const publicOnly = { more: [tile("registry"), tile("lab")], legal: LEGAL };

  it("is asked for with the key and no cookie, from Identity", async () => {
    const { fake, calls } = fetchOf((url) =>
      url.includes("/chrome/public") ? ok(publicOnly) : ok(view()),
    );
    const core = createChromeCore({
      enabled: true,
      endpoint: "/api/chrome",
      baseUrl: "https://identity.example.test/",
      publicKey: "gpid_pk_abc",
      fetch: fake,
    });

    await core.load();

    const call = calls.find((one) => one.url.includes("/chrome/public"));
    expect(call?.url).toBe("https://identity.example.test/api/v1/chrome/public");
    expect(call?.init.headers).toMatchObject({ "x-gpid-key": "gpid_pk_abc" });
    expect(call?.init.credentials).toBe("omit");
  });

  it("paints the lower group before the product has answered, when nothing is on screen", async () => {
    let release: (response: Response) => void = () => undefined;
    const { fake } = fetchOf((url) =>
      url.includes("/chrome/public")
        ? ok(publicOnly)
        : new Promise<Response>((resolve) => (release = resolve)),
    );
    const core = createChromeCore({
      enabled: true,
      endpoint: "/api/chrome",
      baseUrl: "https://identity.example.test",
      publicKey: "gpid_pk_abc",
      fetch: fake,
    });

    const done = core.load();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(core.state()).toMatchObject({ status: "loading" });
    expect(core.state().view?.yours).toEqual([]);
    expect(core.state().view?.more.map((one) => one.slug)).toEqual(["registry", "lab"]);

    release(ok(view()));
    expect((await done).view?.yours).toHaveLength(2);
  });

  it("is what is left when the product's route fails and nothing was held", async () => {
    const { fake } = fetchOf((url) =>
      url.includes("/chrome/public") ? ok(publicOnly) : new Response("", { status: 500 }),
    );
    const core = createChromeCore({
      enabled: true,
      endpoint: "/api/chrome",
      baseUrl: "https://identity.example.test",
      publicKey: "gpid_pk_abc",
      fetch: fake,
    });

    const state = await core.load();
    expect(state.status).toBe("error");
    expect(state.view?.more).toHaveLength(2);
    expect(state.view?.yours).toEqual([]);
  });

  it("is the whole answer when there is no route of the product's to ask", async () => {
    const { fake } = fetchOf(() => ok(publicOnly));
    const core = createChromeCore({
      enabled: true,
      baseUrl: "https://identity.example.test",
      publicKey: "gpid_pk_abc",
      fetch: fake,
    });

    const state = await core.load();
    expect(state.status).toBe("ready");
    expect(state.view?.person).toEqual({ hasIdentity: false, avatarUrl: null });
    expect(state.view?.legal).toEqual(LEGAL);
  });
});
