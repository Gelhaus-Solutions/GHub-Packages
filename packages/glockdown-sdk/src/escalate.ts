/**
 * Raising this app one rung (GLockdown L8, L10): a POST to the edge's apps listener over TLS
 * pinned both ways. The app presents its own key, which the operator's trust document pins as this
 * app, and accepts the edge only when the edge's key is one of the pins it was given; nothing is
 * sent to anything else. An app raises only itself, one rung per call, up to AAL; Identity and
 * Control name the apps they manage. Nobody can lower anything this way.
 */

import { X509Certificate, constants, createHash } from "node:crypto";
import { request } from "node:http";
import { connect, type TLSSocket } from "node:tls";

export interface EscalateOptions {
  /** The edge's apps listener, e.g. `https://glockdown.example:8444`. */
  url: string;
  /** SHA-256 SPKI pins of the edge's TLS key, base64url, as the trust document lists them. */
  edgePins: readonly string[];
  /** This app's TLS certificate and key (PEM), pinned as the app in the trust document. */
  cert: string;
  key: string;
  reason: string;
  /** Identity and Control only: the apps to raise. An app leaves it out. */
  apps?: readonly string[];
  timeoutMs?: number;
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

function connectPinned(o: EscalateOptions, url: URL, timeoutMs: number): Promise<TLSSocket> {
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
export async function escalate(o: EscalateOptions): Promise<EscalateResult> {
  const timeoutMs = o.timeoutMs ?? 10_000;
  try {
    const url = new URL("/v1/escalate", o.url);
    if (url.protocol !== "https:") throw new Error("https only");
    const body = Buffer.from(
      JSON.stringify({ apps: o.apps ? [...o.apps] : null, reason: o.reason }),
    );
    const socket = await connectPinned(o, url, timeoutMs);
    return await new Promise<EscalateResult>((resolve) => {
      const req = request(
        {
          method: "POST",
          path: url.pathname,
          host: url.host,
          createConnection: () => socket,
          headers: { "content-type": "application/json", "content-length": String(body.length) },
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
      req.end(body);
    });
  } catch (e) {
    return { ok: false, status: 0, code: "unavailable", detail: (e as Error).message };
  }
}
