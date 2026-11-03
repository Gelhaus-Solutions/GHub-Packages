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
 *
 * When the grant needs an operator's approval, GMint answers `pending`. The client then keeps the
 * request and polls for it (SPEC section 8), each poll on a fresh connection with the next
 * sequence number, until GMint issues, refuses, or the caller's limit is reached. A pending request
 * is never sent again: that would ask for a second approval.
 *
 * The client certificate lives 7 days. The client renews it for the same key once two thirds of
 * its life are gone (SPEC section 7), on a timer and before a mint, and writes the new chain over
 * the old file in one step; a renewal another process wrote is picked up from disk.
 */

import { X509Certificate, createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { connect, type TLSSocket } from "node:tls";
import {
  POLL_PATH,
  RENEW_PATH,
  b64uDecode,
  buildPoll,
  buildRenewRequest,
  buildRequest,
  chainPem,
  channelBinding,
  ed25519PublicKey,
  isCode,
  localSigner,
  verifyRenewResponse,
  verifyResponse,
  type BuiltRenewRequest,
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
  /** Renew the client certificate on a timer and before mints. Default true. */
  autoRenew?: boolean;
  /** Told about a renewal that failed; the old certificate stays in use while it is valid. */
  onRenewError?: (e: GmintError) => void;
}

/**
 * What one operation needs. Name the repositories by id (`repositoryIds`) or by name within the
 * installation (`repositories`, resolved by GitHub; the token's scope then carries the ids too), or
 * name neither for an org-scoped token, which only an org-scoped grant allows.
 */
export interface TokenRequest {
  grant: string;
  installationId: number;
  repositoryIds?: number[];
  repositories?: string[];
  permissions: Record<string, PermissionLevel>;
  /** The tenant a multi-tenant client acts for, taken from the authenticated session. */
  tenant?: string;
  purpose?: string;
}

/** How one `getToken` call waits when its grant needs an operator's approval. */
export interface GetTokenOptions {
  /** How often to ask whether the approval was decided. Default 2000 ms. */
  approvalPollMs?: number;
  /**
   * How long to wait for a decision, from the pending answer. Default 300 000 ms, the life of an
   * approval in GMint; then `getToken` throws `approval_required` with the approval's id.
   */
  approvalTimeoutMs?: number;
  /** Called once with the approval's id when GMint answers that the request waits for one. */
  onApprovalPending?: (requestId: string) => void;
  /** Stops the wait: no further poll is sent and `getToken` throws `approval_required`. */
  signal?: AbortSignal;
}

const APPROVAL_POLL_MS = 2_000;
const APPROVAL_TIMEOUT_MS = 300_000;

/** A request GMint answered `pending`, kept for the polls that ask after it. */
interface Pending {
  requestId: string;
  request: BuiltRequest;
}

/** Every certificate in a PEM bundle. */
function certificates(pem: Buffer): X509Certificate[] {
  const blocks = pem
    .toString("utf8")
    .match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g);
  return (blocks ?? []).map((b) => new X509Certificate(b));
}

/** How often the renewal timer looks at the certificate. */
const RENEW_CHECK_MS = 60 * 60 * 1000;

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
  private cert: Buffer;
  private certMtime = 0;
  private readonly tlsKey: Buffer;
  private readonly ca: Buffer;
  private renewing: Promise<Date> | null = null;
  private readonly timer: NodeJS.Timeout | null = null;
  private readonly serverKeys = new Map<string, KeyObject>();
  private readonly host: string;
  private readonly port: number;
  private readonly origin: string;
  private readonly htu: string;
  private readonly pollHtu: string;

  constructor(private readonly o: GmintClientOptions) {
    const url = new URL(o.url);
    if (url.protocol !== "https:") throw new GmintError("bad_request", "url must be https");
    this.host = url.hostname;
    this.port = Number(url.port || 443);
    this.origin = url.origin;
    this.htu = `${url.origin}/v1/token`;
    this.pollHtu = `${url.origin}${POLL_PATH}`;
    this.kid = o.signingKey.kid;
    this.signingKey =
      "key" in o.signingKey ? o.signingKey.key : createPrivateKey(readPrivate(o.signingKey.file));
    if (this.signingKey.asymmetricKeyType !== "ed25519")
      throw new GmintError("bad_request", "the signing key must be Ed25519");
    this.cert = readFileSync(o.tls.certFile);
    this.certMtime = statSync(o.tls.certFile).mtimeMs;
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
    if (o.autoRenew !== false) {
      this.timer = setInterval(() => void this.renewIfDue(), RENEW_CHECK_MS);
      this.timer.unref();
    }
  }

  /** Stops the renewal timer. The timer never keeps the process alive either way. */
  close(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** When the certificate in use expires. */
  certificateExpiry(): Date {
    this.reloadCertificate();
    return new Date(certificates(this.cert)[0]!.validTo);
  }

  /** Picks up a certificate another process renewed. */
  private reloadCertificate(): void {
    try {
      const mtime = statSync(this.o.tls.certFile).mtimeMs;
      if (mtime === this.certMtime) return;
      this.cert = readFileSync(this.o.tls.certFile);
      this.certMtime = mtime;
    } catch {
      // Keep the certificate in memory; the next renewal writes the file again.
    }
  }

  /** Renews once two thirds of the certificate's life are gone; errors go to `onRenewError`. */
  private async renewIfDue(now = Date.now()): Promise<void> {
    this.reloadCertificate();
    const leaf = certificates(this.cert)[0];
    if (!leaf) return;
    const from = Date.parse(leaf.validFrom);
    const to = Date.parse(leaf.validTo);
    if (now < from + ((to - from) * 2) / 3) return;
    try {
      await this.renewCertificate();
    } catch (e) {
      this.o.onRenewError?.(e instanceof GmintError ? e : new GmintError("transport", String(e)));
    }
  }

  /**
   * Asks GMint for a new certificate for the same TLS key and writes it over the certificate
   * file. Concurrent calls share one renewal. Returns the new expiry.
   */
  renewCertificate(): Promise<Date> {
    this.renewing ??= this.renewOnce().finally(() => (this.renewing = null));
    return this.renewing;
  }

  private async renewOnce(): Promise<Date> {
    const socket = await this.connect();
    let built: BuiltRenewRequest;
    let cb: Uint8Array;
    try {
      const measured = channelBinding(socket);
      if (!measured) throw new GmintError("untrusted", "not a TLS 1.3 connection");
      cb = measured;
      built = await buildRenewRequest({
        signer: localSigner(this.kid, this.signingKey),
        iss: this.o.clientId,
        aud: `gmint:${this.o.instance}`,
        htu: `${this.origin}${RENEW_PATH}`,
        cb,
        tlsKey: createPrivateKey(this.tlsKey),
      });
    } catch (e) {
      socket.destroy();
      if (e instanceof GmintError) throw e;
      throw new GmintError("bad_request", (e as Error).message);
    }
    const res = await this.post(
      socket,
      RENEW_PATH,
      "application/gmint-renew+jws",
      built.jws,
    ).finally(() => socket.destroy());
    if (!res.type.startsWith("application/gmint-renew-res+jws")) throw unsignedRefusal(res);
    const v = verifyRenewResponse(res.body, {
      serverKeys: (kid) => this.serverKeys.get(kid),
      request: built,
      cb,
      anchors: certificates(this.ca),
    });
    if (!v.ok) throw new GmintError("untrusted", v.reason);
    if (v.value.status === "refused") throw new GmintError(v.value.code, "renewal refused");
    const pem = chainPem(v.value.chain);
    // Same directory, then rename: a reader sees the old file or the new one, never half of one.
    const tmp = `${this.o.tls.certFile}.${process.pid}.tmp`;
    writeFileSync(tmp, pem, { mode: statSync(this.o.tls.certFile).mode & 0o777 });
    renameSync(tmp, this.o.tls.certFile);
    this.cert = Buffer.from(pem);
    this.certMtime = statSync(this.o.tls.certFile).mtimeMs;
    return new Date(v.value.notAfter * 1000);
  }

  /**
   * A token for exactly `req`. When the grant needs an operator's approval this waits for it as
   * `options` say, polling GMint, and returns the token once it is approved and issued.
   */
  async getToken(req: TokenRequest, options: GetTokenOptions = {}): Promise<GmintToken> {
    const every = options.approvalPollMs ?? APPROVAL_POLL_MS;
    const limit = options.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS;
    if (!(every > 0) || !(limit >= 0))
      throw new GmintError(
        "bad_request",
        "approvalPollMs must be positive and approvalTimeoutMs not negative",
      );
    if (this.o.autoRenew !== false) await this.renewIfDue();
    const attempts = this.o.attempts ?? 3;
    let last: GmintError | null = null;
    let outcome: GmintToken | Pending | null = null;
    for (let i = 0; i < attempts && !outcome; i++) {
      try {
        outcome = await this.once(req);
      } catch (e) {
        last = asGmintError(e);
        if (!last.retryable || i === attempts - 1) throw last;
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** i + Math.random() * 200));
      }
    }
    if (!outcome) throw last ?? new GmintError("transport", "no attempt made");
    if (outcome instanceof GmintToken) return outcome;
    // Outside the retry loop on purpose: whatever the wait ends in, the request is not sent again.
    return this.awaitApproval(outcome, every, limit, options);
  }

  /**
   * Polls for a pending request until GMint issues or refuses, or the wait ends. The request, and
   * with it the private half of its `enc` that the token will be sealed to, lives only as long as
   * this call: nothing else holds it.
   */
  private async awaitApproval(
    pending: Pending,
    every: number,
    limit: number,
    o: GetTokenOptions,
  ): Promise<GmintToken> {
    const { requestId } = pending;
    const deadline = Date.now() + limit;
    const stillPending = (why: string) =>
      new GmintError("approval_required", `pending approval ${requestId} (${why})`);
    o.onApprovalPending?.(requestId);
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) throw stillPending("no decision in time");
      await pause(Math.min(every, left), o.signal);
      if (o.signal?.aborted) throw stillPending("the wait was aborted");
      let answer: GmintToken | Pending;
      try {
        answer = await this.poll(pending);
      } catch (e) {
        const err = asGmintError(e);
        // An outage or a busy GMint costs one poll, not the approval: ask again at the next turn.
        // Everything else (a refusal, the approval expired, an answer that fails verification) ends
        // the wait.
        if (err.retryable) continue;
        throw err;
      }
      if (!(answer instanceof GmintToken)) {
        if (answer.requestId !== requestId)
          throw new GmintError("untrusted", "a poll was answered for another approval");
        continue;
      }
      if (o.signal?.aborted) {
        // The caller stopped waiting while this poll was on the wire: nobody will use the token.
        void answer.revoke();
        throw stillPending("the wait was aborted");
      }
      return answer;
    }
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
    path: string,
    contentType: string,
    body: string,
  ): Promise<{ status: number; type: string; body: string }> {
    try {
      const res = await postOnSocket(
        socket,
        this.host,
        path,
        contentType,
        body,
        this.o.timeoutMs ?? 10_000,
      );
      return { status: res.status, type: res.contentType, body: res.body };
    } catch (e) {
      throw new GmintError("transport", (e as Error).message);
    }
  }

  private async once(req: TokenRequest): Promise<GmintToken | Pending> {
    const socket = await this.connect();
    let built: BuiltRequest;
    let cb: Uint8Array;
    try {
      const measured = channelBinding(socket);
      if (!measured) throw new GmintError("untrusted", "not a TLS 1.3 connection");
      cb = measured;
      if (req.repositoryIds && req.repositories)
        throw new GmintError("bad_request", "name repositories by id or by name, not both");
      const scope: GithubScope = {
        installation_id: req.installationId,
        ...(req.repositoryIds ? { repository_ids: req.repositoryIds } : {}),
        ...(req.repositories ? { repositories: req.repositories } : {}),
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

    const res = await this.post(
      socket,
      "/v1/token",
      "application/gmint-req+jws",
      built.jws,
    ).finally(() => socket.destroy());
    return this.answer(res, built, cb);
  }

  /**
   * One poll for a pending request (SPEC section 8): a connection of its own, its own exporter and
   * the next sequence number, and an answer checked against the ORIGINAL request.
   */
  private async poll(pending: Pending): Promise<GmintToken | Pending> {
    const socket = await this.connect();
    let jws: string;
    let cb: Uint8Array;
    try {
      const measured = channelBinding(socket);
      if (!measured) throw new GmintError("untrusted", "not a TLS 1.3 connection");
      cb = measured;
      const built = await buildPoll({
        signer: localSigner(this.kid, this.signingKey),
        iss: this.o.clientId,
        aud: `gmint:${this.o.instance}`,
        htu: this.pollHtu,
        seq: await nextSequence(this.o.sequenceFile),
        cb,
        requestId: pending.requestId,
        request: pending.request,
      });
      jws = built.jws;
    } catch (e) {
      socket.destroy();
      if (e instanceof GmintError) throw e;
      throw new GmintError("bad_request", (e as Error).message);
    }

    const res = await this.post(socket, POLL_PATH, "application/gmint-poll+jws", jws).finally(() =>
      socket.destroy(),
    );
    return this.answer(res, pending.request, cb);
  }

  /**
   * Checks GMint's answer to a request or to a poll for it: both are bound to the request, and to
   * the exporter of the connection the answer came back on.
   */
  private answer(
    res: { status: number; type: string; body: string },
    request: BuiltRequest,
    cb: Uint8Array,
  ): GmintToken | Pending {
    if (!res.type.startsWith("application/gmint-res+jws")) throw unsignedRefusal(res);
    const v = verifyResponse(res.body, {
      serverKeys: (kid) => this.serverKeys.get(kid),
      request,
      clientKid: this.kid,
      cb,
    });
    if (!v.ok) throw new GmintError("untrusted", v.reason);
    if (v.value.status === "refused") throw new GmintError(v.value.code, "refused");
    if (v.value.status === "pending") return { requestId: v.value.requestId, request };
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

function asGmintError(e: unknown): GmintError {
  return e instanceof GmintError ? e : new GmintError("transport", (e as Error).message);
}

/** Resolves after `ms`, or at once when `signal` aborts. Never rejects. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** An unsigned refusal: the request never authenticated, or a unit was down. */
function unsignedRefusal(res: { status: number; body: string }): GmintError {
  let code: unknown;
  try {
    code = (JSON.parse(res.body) as { code?: unknown }).code;
  } catch {
    code = undefined;
  }
  return new GmintError(isCode(code) ? code : "transport", `HTTP ${res.status}`);
}
