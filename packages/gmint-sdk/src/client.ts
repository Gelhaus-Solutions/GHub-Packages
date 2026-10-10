/**
 * The GMint client. One `getToken` call:
 *
 * 1. opens a TLS 1.3 connection with the client certificate, trusting only the GMint root CA;
 * 2. reads the connection's tls-exporter and takes the next sequence number;
 * 3. signs a request for exactly the installation, repositories and permissions asked for;
 * 4. sends it on that same connection;
 * 5. verifies GMint's signature against the pinned server keys, the binding to its own request
 *    and connection, the time, then opens the sealed token and checks it is no wider than asked.
 *
 * Only then does the caller see a token. Retries happen only for transport failures and the
 * codes the protocol marks retryable, with a fresh connection and a fresh request each time.
 */

import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { connect, type TLSSocket } from "node:tls";
import {
  b64uDecode,
  buildRequest,
  channelBinding,
  ed25519PublicKey,
  isCode,
  localSigner,
  verifyResponse,
  type BuiltRequest,
  type GithubScope,
  type PermissionLevel,
} from "@ghub/gmint-protocol";
import { GmintError } from "./errors";
import { postOnSocket } from "./http";
import { nextSequence } from "./sequence";
import { GmintToken } from "./token";

export interface GmintClientOptions {
  /** GMint's client listener, e.g. `https://mint.example.org:8443`. Its origin is the signed target. */
  url: string;
  /** Dial this address instead of the URL's host (split DNS, tunnels, tests). TLS still checks the URL's name. */
  connectTo?: { host: string; port: number };
  /** GMint's instance name; the request audience is `gmint:<instance>`. */
  instance: string;
  /** This client's id, `gmint://<namespace>/<workload>`. */
  clientId: string;
  /** The request-signing key (Ed25519): a PKCS8 PEM file, or a key object. */
  signingKey: { kid: string; file: string } | { kid: string; key: KeyObject };
  /** The TLS client certificate and key (PEM files), and the GMint root CA. */
  tls: { certFile: string; keyFile: string; caFile: string };
  /** GMint's response keys: kid to b64url raw Ed25519 public key. */
  serverKeys: Record<string, string>;
  /** Where the durable request counter lives (one per signing key). */
  sequenceFile: string;
  timeoutMs?: number;
  /** Attempts for retryable failures, including the first. Default 3. */
  attempts?: number;
  /** GitHub's API, for revocation. Tests point it elsewhere. */
  githubApi?: string;
}

export interface TokenRequest {
  grant: string;
  installationId: number;
  repositoryIds: number[];
  permissions: Record<string, PermissionLevel>;
  /** The tenant a multi-tenant client acts for, taken from the authenticated session. */
  tenant?: string;
  purpose?: string;
}

/** Refuses key files anyone but the owner can read. */
function readPrivate(path: string): Buffer {
  const mode = statSync(path).mode;
  if (mode & 0o077)
    throw new GmintError("bad_request", `${path} is readable by group or others; chmod 600 it`);
  return readFileSync(path);
}

export class GmintClient {
  private readonly signingKey: KeyObject;
  private readonly kid: string;
  private readonly cert: Buffer;
  private readonly tlsKey: Buffer;
  private readonly ca: Buffer;
  private readonly serverKeys = new Map<string, KeyObject>();
  private readonly host: string;
  private readonly port: number;
  private readonly htu: string;

  constructor(private readonly o: GmintClientOptions) {
    const url = new URL(o.url);
    if (url.protocol !== "https:") throw new GmintError("bad_request", "url must be https");
    this.host = url.hostname;
    this.port = Number(url.port || 443);
    this.htu = `${url.origin}/v1/token`;
    this.kid = o.signingKey.kid;
    this.signingKey =
      "key" in o.signingKey ? o.signingKey.key : createPrivateKey(readPrivate(o.signingKey.file));
    if (this.signingKey.asymmetricKeyType !== "ed25519")
      throw new GmintError("bad_request", "the signing key must be Ed25519");
    this.cert = readFileSync(o.tls.certFile);
    this.tlsKey = readPrivate(o.tls.keyFile);
    this.ca = readFileSync(o.tls.caFile);
    for (const [kid, raw] of Object.entries(o.serverKeys)) {
      const bytes = b64uDecode(raw);
      if (!bytes || bytes.length !== 32)
        throw new GmintError("bad_request", `server key ${kid} is not a raw Ed25519 key`);
      this.serverKeys.set(kid, ed25519PublicKey(bytes));
    }
    if (this.serverKeys.size === 0)
      throw new GmintError("bad_request", "at least one pinned server key is required");
  }

  async getToken(req: TokenRequest): Promise<GmintToken> {
    const attempts = this.o.attempts ?? 3;
    let last: GmintError | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.once(req);
      } catch (e) {
        last = e instanceof GmintError ? e : new GmintError("transport", (e as Error).message);
        if (!last.retryable || i === attempts - 1) throw last;
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** i + Math.random() * 200));
      }
    }
    throw last ?? new GmintError("transport", "no attempt made");
  }

  private connect(): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const s = connect({
        host: this.o.connectTo?.host ?? this.host,
        port: this.o.connectTo?.port ?? this.port,
        servername: this.host,
        ca: this.ca,
        cert: this.cert,
        key: this.tlsKey,
        minVersion: "TLSv1.3",
        timeout: this.o.timeoutMs ?? 10_000,
      });
      s.once("secureConnect", () => resolve(s));
      s.once("error", (e) => reject(new GmintError("transport", e.message)));
      s.once("timeout", () => {
        s.destroy();
        reject(new GmintError("transport", "timeout"));
      });
    });
  }

  private async post(
    socket: TLSSocket,
    body: string,
  ): Promise<{ status: number; type: string; body: string }> {
    try {
      const res = await postOnSocket(
        socket,
        this.host,
        "/v1/token",
        "application/gmint-req+jws",
        body,
        this.o.timeoutMs ?? 10_000,
      );
      return { status: res.status, type: res.contentType, body: res.body };
    } catch (e) {
      throw new GmintError("transport", (e as Error).message);
    }
  }

  private async once(req: TokenRequest): Promise<GmintToken> {
    const socket = await this.connect();
    let built: BuiltRequest;
    let cb: Uint8Array;
    try {
      const measured = channelBinding(socket);
      if (!measured) throw new GmintError("untrusted", "not a TLS 1.3 connection");
      cb = measured;
      const scope: GithubScope = {
        installation_id: req.installationId,
        repository_ids: req.repositoryIds,
        permissions: req.permissions,
      };
      built = await buildRequest({
        signer: localSigner(this.kid, this.signingKey),
        iss: this.o.clientId,
        aud: `gmint:${this.o.instance}`,
        htu: this.htu,
        seq: await nextSequence(this.o.sequenceFile),
        cb,
        req: {
          provider: "github",
          grant: req.grant,
          scope,
          ...(req.tenant !== undefined ? { tenant: req.tenant } : {}),
          ...(req.purpose !== undefined ? { purpose: req.purpose } : {}),
        },
      });
    } catch (e) {
      socket.destroy();
      if (e instanceof GmintError) throw e;
      throw new GmintError("bad_request", (e as Error).message);
    }

    const res = await this.post(socket, built.jws).finally(() => socket.destroy());
    if (!res.type.startsWith("application/gmint-res+jws")) {
      // An unsigned refusal: the request never authenticated, or a unit was down.
      let code: unknown;
      try {
        code = (JSON.parse(res.body) as { code?: unknown }).code;
      } catch {
        code = undefined;
      }
      throw new GmintError(isCode(code) ? code : "transport", `HTTP ${res.status}`);
    }
    const v = verifyResponse(res.body, {
      serverKeys: (kid) => this.serverKeys.get(kid),
      request: built,
      clientKid: this.kid,
      cb,
    });
    if (!v.ok) throw new GmintError("untrusted", v.reason);
    if (v.value.status === "refused") throw new GmintError(v.value.code, "refused");
    if (v.value.status === "pending")
      throw new GmintError("approval_required", `pending approval ${v.value.requestId}`);
    const issued = v.value.issued;
    return new GmintToken(
      issued.credential,
      new Date(issued.expires_at),
      issued.scope,
      issued.hashed,
      (secret) => this.revoke(secret),
    );
  }

  /** Revokes a token on GitHub with the token itself (`DELETE /installation/token`). */
  private async revoke(secret: string): Promise<void> {
    await fetch(`${this.o.githubApi ?? "https://api.github.com"}/installation/token`, {
      method: "DELETE",
      headers: {
        authorization: `token ${secret}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "gmint-sdk",
      },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  }
}
