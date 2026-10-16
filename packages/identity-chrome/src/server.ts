/**
 * The server half: a product's own server speaking to Identity for the header
 * controls.
 *
 * The secret token lives here and nowhere near a browser. The page asks the
 * product's own route; that route knows who is signed in, from the product's own
 * session, and asks Identity about that one person by verified email. Identity
 * answers with the products they have and the public ones they do not.
 *
 * **Say only who is signed in, and only what the product has verified.** The
 * address goes to Identity as the thing the person's products are joined on, so
 * an address the product has not verified is a way to ask about somebody else.
 *
 * **Never log the token, and never put it in an error.** Everything thrown here
 * says what happened and nothing about what was sent.
 */

import type { ChromeView } from "./types.js";
import { parseView } from "./validate.js";

/** A refusal or a failure from Identity, with how long to wait when it said. */
export class ChromeError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ChromeError";
  }
}

export interface ChromeServerOptions {
  /** Identity's public address, with or without a trailing slash. */
  baseUrl: string;
  /** This product's slug in the catalogue. */
  product: string;
  /** The secret token staff issued for this product. Never sent to a browser. */
  token: string;
  fetch?: typeof fetch;
  /** Milliseconds. A call that hangs must not hang a page render. */
  timeoutMs?: number;
  /** How long one person's answer is reused, in seconds. Zero asks every time. */
  viewCacheSeconds?: number;
  now?: () => number;
}

export interface ChromeServer {
  /** The products of the person signed in, as Identity knows them. Counts as a visit to this product. */
  view(email: string): Promise<ChromeView>;
  /** The one-off push of this product's users, inside the window staff opened. Batched for you. */
  seed(emails: readonly string[]): Promise<{ changed: number }>;
  /** Say these people no longer have access to this product. */
  remove(emails: readonly string[]): Promise<{ changed: number }>;
  /** Drop what is held for one person, on sign-out. */
  forget(email: string): void;
  /**
   * A route for any framework that speaks the web `Request` and `Response`
   * (Next route handlers, Hono, Bun, Deno, Cloudflare). `who` says who is
   * signed in, from the product's own session, or null for nobody.
   */
  handler(
    who: (request: Request) => Promise<{ email: string } | null> | { email: string } | null,
  ): (request: Request) => Promise<Response>;
}

/** One request to Identity carries at most this many addresses. */
export const BATCH = 1000;
const MAX_HELD = 500;
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CACHE_SECONDS = 60;

export function createChromeServer(options: ChromeServerOptions): ChromeServer {
  const base = options.baseUrl.replace(/\/+$/u, "");
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttlMs = (options.viewCacheSeconds ?? DEFAULT_CACHE_SECONDS) * 1000;
  const held = new Map<string, { view: ChromeView; at: number }>();

  const key = (email: string): string => email.trim().normalize("NFC").toLowerCase();

  async function call(method: string, path: string, body: unknown): Promise<unknown> {
    const send = options.fetch ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-gpid-product": options.product,
          authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ChromeError(0, "Identity could not be reached");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retry = Number(response.headers.get("retry-after"));
      throw new ChromeError(
        response.status,
        `Identity answered ${String(response.status)}`,
        Number.isFinite(retry) && retry > 0 ? retry : undefined,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ChromeError(502, "Identity's answer was not understood");
    }
  }

  async function batched(
    method: "PUT" | "DELETE",
    emails: readonly string[],
  ): Promise<{ changed: number }> {
    let changed = 0;
    for (let start = 0; start < emails.length; start += BATCH) {
      const answer = await call(method, "/api/v1/chrome/access", {
        emails: emails.slice(start, start + BATCH),
      });
      const count = (answer as { changed?: unknown }).changed;
      changed += typeof count === "number" ? count : 0;
    }
    return { changed };
  }

  const server: ChromeServer = {
    async view(email) {
      const id = key(email);
      const reuse = held.get(id);
      if (reuse !== undefined && now() - reuse.at < ttlMs) return reuse.view;

      const view = parseView(await call("POST", "/api/v1/chrome/view", { email }));
      if (view === null) throw new ChromeError(502, "Identity's answer was not understood");

      // Newest last, so the oldest is the one to go when the table is full.
      held.delete(id);
      held.set(id, { view, at: now() });
      if (held.size > MAX_HELD) {
        const oldest = held.keys().next().value;
        if (oldest !== undefined) held.delete(oldest);
      }
      return view;
    },
    seed: (emails) => batched("PUT", emails),
    remove: (emails) => batched("DELETE", emails),
    forget(email) {
      held.delete(key(email));
    },
    handler(who) {
      return async (request) => {
        const json = (
          status: number,
          body: unknown,
          headers: Record<string, string> = {},
        ): Response =>
          new Response(JSON.stringify(body), {
            status,
            headers: {
              "content-type": "application/json",
              "cache-control": "private, no-store",
              ...headers,
            },
          });

        if (request.method !== "GET")
          return json(405, { error: "method not allowed" }, { allow: "GET" });
        const person = await who(request);
        if (person === null) return json(401, { error: "not signed in" });
        try {
          return json(200, await server.view(person.email));
        } catch (error) {
          // Whatever went wrong, the page keeps the list it held. Nothing about why leaves here.
          const wait =
            error instanceof ChromeError && error.status === 429
              ? (error.retryAfterSeconds ?? 60)
              : 30;
          return json(503, { error: "unavailable" }, { "retry-after": String(wait) });
        }
      };
    },
  };
  return server;
}
