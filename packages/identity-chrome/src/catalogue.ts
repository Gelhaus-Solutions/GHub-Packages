/**
 * A product's own name and marks, read from Identity's catalogue.
 *
 * The catalogue is where a product's name and mark live. A product reads its own
 * here when it draws its top bar, its title and its favicon, so a rename or a new
 * mark reaches every product without a release. Nothing here needs a token: a
 * product's name and mark are on its own pages already.
 *
 * Two ways in. `catalogueMarkUrl` is an address that always leads to the current
 * mark, for places that cannot ask first (a favicon link, an `<img>` in static
 * markup). `createCatalogue` asks for the whole entry and keeps the last good
 * answer, so an Identity outage leaves the name and mark a product last had
 * rather than none.
 *
 * Off for a self-hosted install, as the controls are: such an install ships the
 * copy its release was built with and asks nobody.
 */

import type { CatalogueEntry } from "./types.js";
import { parseCatalogueEntry } from "./validate.js";

/** The address that always leads to a product's current mark. Redirects, briefly cached. */
export function catalogueMarkUrl(
  baseUrl: string,
  slug: string,
  variant: "colour" | "mono" = "colour",
): string {
  const base = baseUrl.replace(/\/+$/u, "");
  return `${base}/api/v1/catalogue/${encodeURIComponent(slug)}/icon${variant === "mono" ? "/mono" : ""}`;
}

export interface CatalogueOptions {
  /** Identity's public address, with or without a trailing slash. */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Milliseconds. A call that hangs must not hang a page render. */
  timeoutMs?: number;
  /** How long an entry is reused before asking again, in seconds. Identity caches it for a minute too. */
  cacheSeconds?: number;
  now?: () => number;
}

export interface Catalogue {
  /**
   * A product's entry. After a failed ask, the last good answer, however old;
   * null only when there never was one or the product does not exist. A failed
   * ask is not repeated until the cache time has passed, and readers asking at
   * the same moment share one ask, so an outage costs a page render at most one
   * wait per cache time rather than one every time.
   */
  entry(slug: string): Promise<CatalogueEntry | null>;
}

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_SECONDS = 60;

export function createCatalogue(options: CatalogueOptions): Catalogue {
  const base = options.baseUrl.replace(/\/+$/u, "");
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttlMs = (options.cacheSeconds ?? DEFAULT_CACHE_SECONDS) * 1000;
  const held = new Map<string, { entry: CatalogueEntry | null; at: number }>();
  const asking = new Map<string, Promise<CatalogueEntry | null>>();

  async function ask(slug: string): Promise<CatalogueEntry | null> {
    const send = options.fetch ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await send(`${base}/api/v1/catalogue/${encodeURIComponent(slug)}`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "omit",
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Identity answered ${String(response.status)}`);
      const entry = parseCatalogueEntry(await response.json());
      if (entry === null) throw new Error("Identity's answer was not understood");
      return entry;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh(
    slug: string,
    last: CatalogueEntry | null,
  ): Promise<CatalogueEntry | null> {
    let entry: CatalogueEntry | null;
    try {
      entry = await ask(slug);
    } catch {
      // The name and mark it last had, rather than none, held for the cache
      // time like an answer: retrying on every read is what made each render
      // during an outage wait out the timeout.
      entry = last;
    }
    held.set(slug, { entry, at: now() });
    return entry;
  }

  return {
    entry(slug) {
      const last = held.get(slug);
      if (last !== undefined && now() - last.at < ttlMs) return Promise.resolve(last.entry);
      const pending = asking.get(slug);
      if (pending !== undefined) return pending;
      const next = refresh(slug, last?.entry ?? null).finally(() => {
        asking.delete(slug);
      });
      asking.set(slug, next);
      return next;
    },
  };
}
