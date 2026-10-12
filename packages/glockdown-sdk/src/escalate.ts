/**
 * Raising this app one rung (GLockdown L8, L10), and telling GLockdown a honeytoken of this app was
 * used (L97): a POST to the edge's apps listener over TLS pinned both ways. The app presents its
 * own key, which the operator's trust document pins as this app, and accepts the edge only when the
 * edge's key is one of the pins it was given; nothing is sent to anything else. An app raises only
 * itself, one rung per call, up to AAL; Identity and Control name the apps they manage. A signal
 * names only what tripped; GLockdown's own configuration decides what it raises. Nobody can lower
 * anything this way.
 */

import { X509Certificate, constants, createHash } from "node:crypto";
import { request } from "node:http";
import { connect, type TLSSocket } from "node:tls";

/** Where the edge is and who this app is: the same for every call. */
export interface EdgeConnection {
  /** The edge's apps listener, e.g. `https://glockdown.example:8444`. */
  url: string;
  /** SHA-256 SPKI pins of the edge's TLS key, base64url, as the trust document lists them. */
  edgePins: readonly string[];
  /** This app's TLS certificate and key (PEM), pinned as the app in the trust document. */
  cert: string;
  key: string;
  timeoutMs?: number;
}

export interface EscalateOptions extends EdgeConnection {
  reason: string;
  /** Identity and Control only: the apps to raise. An app leaves it out. */
  apps?: readonly string[];
}

export interface SignalOptions extends EdgeConnection {
  /** What tripped: `decoy_admin` or `decoy_api_key` (L97). */
  signal: string;
  /** One line on what happened, without any credential: never the password or key presented. */
  detail: string;
}

export interface DecoySetOptions extends EdgeConnection {
  /** The SHA-256 of each decoy key and decoy login, hex, as `Honeytokens.fingerprints()` gives them. */
  keys: readonly string[];
  logins: readonly string[];
}

export type EscalateResult =
  { ok: true; body: unknown } | { ok: false; status: number; code: string; detail?: string };

function pinOf(socket: TLSSocket): string | null {
  const cert = socket.getPeerX509Certificate();
  if (!cert) return null;
  const der = cert.publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("base64url");
}

/** The pin of a certificate's key, for checking an identity against the trust document. */
export function spkiPin(certPem: string): string {
  const der = new X509Certificate(certPem).publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("base64url");
}

function connectPinned(o: EdgeConnection, url: URL, timeoutMs: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const socket = connect({
      host,
      port: Number(url.port || 443),
      cert: o.cert,
      key: o.key,
      minVersion: "TLSv1.3",
      maxVersion: "TLSv1.3",
      secureOptions: constants.SSL_OP_NO_TICKET,
      // The edge's certificate is self-signed; its pin is what is checked, below.
      rejectUnauthorized: false,
      ...(/^[\d.:]+$/.test(host) ? {} : { servername: host }),
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("no TLS handshake in time"));
    }, timeoutMs);
    socket.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const pin = pinOf(socket);
      if (pin && o.edgePins.includes(pin)) return resolve(socket);
      socket.destroy();
      reject(new Error("the edge's key is not pinned"));
    });
  });
}

/** Asks GLockdown to raise this app (or, for a manager, these apps) one rung. Never throws. */
export function escalate(o: EscalateOptions): Promise<EscalateResult> {
  return post(o, "/v1/escalate", { apps: o.apps ? [...o.apps] : null, reason: o.reason });
}

/**
 * Tells GLockdown this app's decoy admin or decoy API key was used (L97): GLockdown raises AAL
 * phase 1 for the app and whatever shares its host and database, as its configuration says for
 * this app and signal. Never throws.
 */
export function signal(o: SignalOptions): Promise<EscalateResult> {
  return post(o, "/v1/signal", { signal: o.signal, detail: o.detail.slice(0, 200) });
}

/**
 * Tells GLockdown which decoys this app holds (L120), as hashes only, so that it can check that
 * each decoy in its inventory is still checked here; at start and once a day. The answer says how
 * many of the app's decoys GLockdown judged and how many it holds that GLockdown does not list.
 * Never a raise.
 */
export function reportDecoys(o: DecoySetOptions): Promise<EscalateResult> {
  return post(o, "/v1/decoyset", { keys: [...o.keys], logins: [...o.logins] });
}

/**
 * This app's stage as GLockdown's edge computes it from the verified ladder: the second source
 * beside the agent's file (`GlockdownStage`'s `edge`). Never throws.
 */
export function askStage(o: EdgeConnection): Promise<EscalateResult> {
  return call(o, "GET", "/v1/stage", null);
}

function post(o: EdgeConnection, path: string, payload: object): Promise<EscalateResult> {
  return call(o, "POST", path, payload);
}

async function call(
  o: EdgeConnection,
  method: "GET" | "POST",
  path: string,
  payload: object | null,
): Promise<EscalateResult> {
  const timeoutMs = o.timeoutMs ?? 10_000;
  try {
    const url = new URL(path, o.url);
    if (url.protocol !== "https:") throw new Error("https only");
    const body = payload === null ? null : Buffer.from(JSON.stringify(payload));
    const socket = await connectPinned(o, url, timeoutMs);
    return await new Promise<EscalateResult>((resolve) => {
      const req = request(
        {
          method,
          path: url.pathname,
          host: url.host,
          createConnection: () => socket,
          headers: body
            ? { "content-type": "application/json", "content-length": String(body.length) }
            : {},
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            socket.destroy();
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
              parsed = null;
            }
            if (res.statusCode === 200) return resolve({ ok: true, body: parsed });
            const p = (parsed ?? {}) as { code?: unknown; detail?: unknown };
            resolve({
              ok: false,
              status: res.statusCode ?? 0,
              code: typeof p.code === "string" ? p.code : "unavailable",
              ...(typeof p.detail === "string" ? { detail: p.detail } : {}),
            });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", (e) => {
        socket.destroy();
        resolve({ ok: false, status: 0, code: "unavailable", detail: e.message });
      });
      req.end(body ?? undefined);
    });
  } catch (e) {
    return { ok: false, status: 0, code: "unavailable", detail: (e as Error).message };
  }
}
