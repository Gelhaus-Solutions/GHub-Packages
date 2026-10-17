/**
 * The browser half: what the header controls know, and what they keep.
 *
 * It owns no markup. The apps picker and the account popup draw from `state()`
 * and ask it to `load()`, which is what keeps one fetch, one cache and one
 * failure story behind both controls.
 *
 * **Off unless enabled, and off means silent.** Nothing is fetched, nothing is
 * read from storage and nothing is written, so a self-hosted installation that
 * never sets `enabled` makes no call to anybody.
 *
 * **A cached list paints at once.** The last answer is drawn while a fresh one is
 * fetched, and kept if the fetch fails, marked `stale`. It is thirty days old at
 * most and is checked as hard as a fresh answer, because storage is something
 * anybody on the device can write.
 *
 * **The product's own route is the personal half.** The product's server holds the
 * secret token and says who is signed in; this only ever calls that route, same
 * origin, with the page's own cookie. The public key, if one is given, fetches
 * the lower group straight from Identity so it can paint before the product has
 * answered, and nothing more.
 */

import type { ChromePublicView, ChromeView } from "./types.js";
import { parsePublicView, parseView } from "./validate.js";

export type ChromeStatus = "off" | "idle" | "loading" | "ready" | "stale" | "error";

export interface ChromeState {
  status: ChromeStatus;
  view: ChromeView | null;
  /** When `view` was last confirmed by Identity, in milliseconds since the epoch, or null. */
  updatedAt: number | null;
  /** Why the last refresh failed, short and for a quiet line rather than for a person. */
  error: string | null;
}

/** The three calls a storage needs, which `localStorage` and `sessionStorage` both have. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CACHE_KEY = "gpid.chrome.v1";
/** A list older than this is not drawn, however the fetch fares. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 5000;

export interface ChromeCoreOptions {
  /** Nothing happens unless this is exactly `true`. */
  enabled?: boolean;
  /** The product's own route for the personal half, same origin. */
  endpoint?: string;
  /** Identity's address and this product's public key, for the lower group alone. */
  baseUrl?: string;
  publicKey?: string;
  /** Where the last answer is kept. None means it is not kept. */
  storage?: StorageLike | null;
  cacheKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface ChromeCore {
  state(): ChromeState;
  subscribe(listener: (state: ChromeState) => void): () => void;
  /** Fetch, update the cache and the state, and resolve with the state. Concurrent calls share one fetch. */
  load(): Promise<ChromeState>;
  /** Forget the cached list. A product calls it on sign-out, so a shared device never shows the next person the last one's products. */
  clear(): void;
  /** Stop: abort what is in flight and ignore what arrives. */
  dispose(): void;
}

const NO_PERSON = { hasIdentity: false, avatarUrl: null } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createChromeCore(options: ChromeCoreOptions = {}): ChromeCore {
  const enabled = options.enabled === true;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const storage = options.storage ?? null;
  const cacheKey = options.cacheKey ?? CACHE_KEY;

  let state: ChromeState = {
    status: enabled ? "idle" : "off",
    view: null,
    updatedAt: null,
    error: null,
  };
  const listeners = new Set<(next: ChromeState) => void>();
  let inFlight: Promise<ChromeState> | null = null;
  let controller: AbortController | null = null;
  let disposed = false;

  function set(next: Partial<ChromeState>): void {
    if (disposed) return;
    state = { ...state, ...next };
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch {
        // One listener's fault is not another's.
      }
    }
  }

  function readCache(): { view: ChromeView; savedAt: number } | null {
    if (storage === null) return null;
    try {
      const raw = storage.getItem(cacheKey);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || typeof parsed["savedAt"] !== "number") return null;
      const savedAt = parsed["savedAt"];
      // Too old, or dated in the future, which only somebody editing it would do.
      if (now() - savedAt > CACHE_MAX_AGE_MS || savedAt > now() + 60_000) return null;
      const view = parseView(parsed["view"]);
      return view === null ? null : { view, savedAt };
    } catch {
      return null;
    }
  }

  function writeCache(view: ChromeView, savedAt: number): void {
    if (storage === null) return;
    try {
      storage.setItem(cacheKey, JSON.stringify({ v: 1, savedAt, view }));
    } catch {
      // Full, blocked or private: the controls work without it.
    }
  }

  async function getJson(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    const send = options.fetch ?? globalThis.fetch.bind(globalThis);
    const response = await send(url, { ...init, signal });
    if (!response.ok) throw new Error(`status ${String(response.status)}`);
    try {
      return await response.json();
    } catch {
      throw new Error("invalid answer");
    }
  }

  async function fetchPersonal(endpoint: string, signal: AbortSignal): Promise<ChromeView> {
    const body = await getJson(
      endpoint,
      { method: "GET", headers: { accept: "application/json" }, credentials: "same-origin" },
      signal,
    );
    const view = parseView(body);
    if (view === null) throw new Error("invalid answer");
    return view;
  }

  async function fetchPublic(
    baseUrl: string,
    key: string,
    signal: AbortSignal,
  ): Promise<ChromePublicView> {
    const url = `${baseUrl.replace(/\/+$/u, "")}/api/v1/chrome/public`;
    const body = await getJson(
      url,
      {
        method: "GET",
        headers: { accept: "application/json", "x-gpid-key": key },
        credentials: "omit",
      },
      signal,
    );
    const view = parsePublicView(body);
    if (view === null) throw new Error("invalid answer");
    return view;
  }

  function reasonOf(error: unknown, timedOut: boolean): string {
    if (timedOut) return "timeout";
    if (error instanceof Error && /^(status \d+|invalid answer)$/u.test(error.message))
      return error.message;
    return "network";
  }

  async function run(): Promise<ChromeState> {
    const cached = readCache();
    set({
      status: "loading",
      view: cached?.view ?? state.view,
      updatedAt: cached?.savedAt ?? state.updatedAt,
      error: null,
    });

    const own = new AbortController();
    controller = own;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      own.abort();
    }, timeoutMs);

    try {
      const personalCall =
        options.endpoint === undefined
          ? Promise.resolve(null)
          : fetchPersonal(options.endpoint, own.signal);
      const publicCall =
        options.baseUrl === undefined || options.publicKey === undefined
          ? Promise.resolve(null)
          : fetchPublic(options.baseUrl, options.publicKey, own.signal);

      // The lower group paints as soon as it is back, when nothing else is on screen yet.
      void publicCall
        .then((pub) => {
          if (pub !== null && state.status === "loading" && state.view === null) {
            set({ view: { person: NO_PERSON, yours: [], more: pub.more, legal: pub.legal } });
          }
        })
        .catch(() => undefined);

      const [personal, pub] = await Promise.allSettled([personalCall, publicCall]);
      const publicHalf = pub.status === "fulfilled" ? pub.value : null;

      if (personal.status === "fulfilled" && personal.value !== null) {
        const at = now();
        writeCache(personal.value, at);
        set({ status: "ready", view: personal.value, updatedAt: at, error: null });
        return state;
      }

      if (personal.status === "fulfilled" && publicHalf !== null) {
        // No personal route configured: the public group is the whole answer.
        set({
          status: "ready",
          view: { person: NO_PERSON, yours: [], ...publicHalf },
          updatedAt: now(),
          error: null,
        });
        return state;
      }

      const error =
        personal.status === "rejected" ? reasonOf(personal.reason, timedOut) : "not configured";
      if (cached !== null) {
        set({ status: "stale", view: cached.view, updatedAt: cached.savedAt, error });
      } else if (publicHalf !== null) {
        set({
          status: "error",
          view: { person: NO_PERSON, yours: [], ...publicHalf },
          updatedAt: null,
          error,
        });
      } else {
        set({ status: "error", view: null, updatedAt: null, error });
      }
      return state;
    } finally {
      clearTimeout(timer);
      if (controller === own) controller = null;
    }
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      if (!enabled || disposed) return Promise.resolve(state);
      inFlight ??= run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    clear() {
      if (storage !== null) {
        try {
          storage.removeItem(cacheKey);
        } catch {
          // Nothing to forget that could be read.
        }
      }
      if (enabled) set({ status: "idle", view: null, updatedAt: null, error: null });
    },
    dispose() {
      disposed = true;
      controller?.abort();
      listeners.clear();
    },
  };
}
