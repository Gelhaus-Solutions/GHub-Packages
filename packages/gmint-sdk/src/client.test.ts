import { execFileSync } from "node:child_process";
import { constants, generateKeyPairSync, randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { inspect } from "node:util";
import {
  POLL_PATH,
  b64uEncode,
  buildPollResponse,
  buildResponse,
  channelBinding,
  constantTimeEqual,
  localSigner,
  rawPublicKey,
  utf8Decode,
  verifyPoll,
  verifyRequest,
  type Code,
  type VerifiedRequest,
} from "@ghub/gmint-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GmintClient } from "./client";
import { GmintError } from "./errors";
import { nextSequence } from "./sequence";

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), "gmint-sdk-"));
const f = (n: string) => join(dir, n);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.runIf(hasOpenssl())("GmintClient against a protocol-speaking stand-in", () => {
  const ossl = (...args: string[]) => execFileSync("openssl", args, { stdio: "ignore" });
  const clientSign = generateKeyPairSync("ed25519");
  const serverSign = generateKeyPairSync("ed25519");
  const rogueSign = generateKeyPairSync("ed25519");
  let server: Server;
  let github: HttpServer;
  let port = 0;
  let githubPort = 0;
  const revoked: string[] = [];
  let mode: "issue" | Code | "rogue" | "pending" = "issue";
  let requests = 0;
  // Approvals: a request answered pending is kept by its id, as Core keeps it; each poll for it
  // takes the next step of the script, and an empty script keeps it pending.
  const approvals = new Map<string, VerifiedRequest>();
  let pollScript: ("pending" | "issue" | Exclude<Code, "approval_required">)[] = [];
  let polls = 0;
  // The sequence number of every request and poll, in the order they arrived.
  const seqs: number[] = [];

  beforeAll(async () => {
    ossl(
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      f("ca.key"),
      "-out",
      f("ca.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=test root",
    );
    for (const [name, ext] of [
      ["server", "subjectAltName=DNS:localhost,IP:127.0.0.1\n"],
      ["client", "extendedKeyUsage=clientAuth\n"],
    ] as const) {
      ossl(
        "req",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        f(`${name}.key`),
        "-out",
        f(`${name}.csr`),
        "-subj",
        `/CN=${name}`,
      );
      writeFileSync(f(`${name}.ext`), ext);
      ossl(
        "x509",
        "-req",
        "-in",
        f(`${name}.csr`),
        "-CA",
        f("ca.pem"),
        "-CAkey",
        f("ca.key"),
        "-CAcreateserial",
        "-out",
        f(`${name}.pem`),
        "-days",
        "1",
        "-extfile",
        f(`${name}.ext`),
      );
    }
    chmodSync(f("client.key"), 0o600);
    writeFileSync(f("sign.pem"), clientSign.privateKey.export({ format: "pem", type: "pkcs8" }), {
      mode: 0o600,
    });

    server = createServer(
      {
        key: readFileSync(f("server.key")),
        cert: readFileSync(f("server.pem")),
        ca: readFileSync(f("ca.pem")),
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: "TLSv1.3",
        secureOptions: constants.SSL_OP_NO_TICKET,
      },
      (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", async () => {
          const reply = (status: number, type: string, body: string) => {
            res.writeHead(status, {
              "content-type": type,
              "content-length": Buffer.byteLength(body),
            });
            res.end(body);
          };
          const cb = channelBinding(req.socket as TLSSocket)!;
          const body = utf8Decode(new Uint8Array(Buffer.concat(chunks)))!;
          const resolveKey = (kid: string) =>
            kid === "c1" ? { key: clientSign.publicKey, owner: "gmint://test/client" } : undefined;
          const signer = localSigner(
            "resp-1",
            (mode === "rogue" ? rogueSign : serverSign).privateKey,
          );
          const denied = () => reply(403, "application/json", JSON.stringify({ code: "denied" }));

          if (req.url === POLL_PATH) {
            polls++;
            const p = verifyPoll(body, {
              resolveKey,
              aud: "gmint:test",
              htu: `https://localhost:${port}${POLL_PATH}`,
              cb,
            });
            const original = p.ok ? approvals.get(p.value.requestId) : undefined;
            if (!p.ok || !original || !constantTimeEqual(original.reqHash, p.value.reqHash))
              return denied();
            seqs.push(p.value.payload.seq);
            const step = pollScript.shift() ?? "pending";
            const answer =
              step === "pending"
                ? await buildPollResponse({
                    signer,
                    request: original,
                    cb,
                    status: "pending",
                    requestId: p.value.requestId,
                  })
                : step === "issue"
                  ? await buildPollResponse({
                      signer,
                      request: original,
                      cb,
                      status: "issued",
                      issued: {
                        credential: `ghs_approved${polls}`,
                        expires_at: "2099-01-01T00:00:00Z",
                        scope: original.payload.req.scope,
                      },
                    })
                  : await buildPollResponse({
                      signer,
                      request: original,
                      cb,
                      status: "refused",
                      code: step,
                    });
            return reply(200, "application/gmint-res+jws", answer);
          }

          requests++;
          const v = verifyRequest(body, {
            resolveKey,
            aud: "gmint:test",
            htu: `https://localhost:${port}/v1/token`,
            cb,
          });
          if (!v.ok) return denied();
          seqs.push(v.value.payload.seq);
          if (mode === "pending") {
            const requestId = b64uEncode(new Uint8Array(randomBytes(16)));
            approvals.set(requestId, v.value);
            const pending = await buildResponse({
              signer,
              request: v.value,
              status: "pending",
              requestId,
            });
            return reply(200, "application/gmint-res+jws", pending);
          }
          const jws =
            mode === "issue" || mode === "rogue"
              ? await buildResponse({
                  signer,
                  request: v.value,
                  status: "issued",
                  issued: {
                    credential: `ghs_test${requests}`,
                    expires_at: "2099-01-01T00:00:00Z",
                    // As GMint answers a request by name: the ids GitHub resolved, aligned.
                    scope: v.value.payload.req.scope.repositories
                      ? {
                          ...v.value.payload.req.scope,
                          repository_ids: v.value.payload.req.scope.repositories.map(
                            (_, i) => 100 + i,
                          ),
                        }
                      : v.value.payload.req.scope,
                  },
                })
              : await buildResponse({
                  signer,
                  request: v.value,
                  status: "refused",
                  code: mode as Exclude<Code, "approval_required">,
                });
          reply(200, "application/gmint-res+jws", jws);
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    github = createHttpServer((req, res) => {
      revoked.push(String(req.headers.authorization));
      res.writeHead(204).end();
    });
    await new Promise<void>((resolve) => github.listen(0, "127.0.0.1", resolve));
    githubPort = (github.address() as { port: number }).port;
  });

  afterAll(() => {
    server?.close();
    github?.close();
  });

  const client = (over: Partial<ConstructorParameters<typeof GmintClient>[0]> = {}) =>
    new GmintClient({
      url: `https://localhost:${port}`,
      instance: "test",
      clientId: "gmint://test/client",
      signingKey: { kid: "c1", file: f("sign.pem") },
      tls: { certFile: f("client.pem"), keyFile: f("client.key"), caFile: f("ca.pem") },
      serverKeys: { "resp-1": b64uEncode(rawPublicKey(serverSign.publicKey)) },
      sequenceFile: f("seq"),
      githubApi: `http://127.0.0.1:${githubPort}`,
      attempts: 2,
      ...over,
    });

  const ask = {
    grant: "g",
    installationId: 1,
    repositoryIds: [3, 2],
    permissions: { contents: "read" as const },
  };

  it("gets a token that never prints itself and revokes it on dispose", async () => {
    mode = "issue";
    const token = await client().getToken(ask);
    expect(token.reveal()).toMatch(/^ghs_test/);
    expect(String(token)).toBe("[GmintToken redacted]");
    expect(JSON.stringify({ token })).toBe('{"token":"[GmintToken redacted]"}');
    expect(inspect(token)).toBe("[GmintToken redacted]");
    expect(token.scope.repository_ids).toEqual([2, 3]);
    await token[Symbol.asyncDispose]();
    expect(revoked.at(-1)).toBe(`token ghs_test${requests}`);
    expect(() => token.reveal()).toThrow(/revoked/);
  });

  it("asks by repository name and learns the ids, or for an org-scoped token (D-71)", async () => {
    mode = "issue";
    const { repositoryIds: _ids, ...rest } = ask;
    await using byName = await client().getToken({ ...rest, repositories: ["web", "api"] });
    expect(byName.scope.repositories).toEqual(["api", "web"]);
    expect(byName.scope.repository_ids).toEqual([100, 101]);
    await using org = await client().getToken({ ...rest, permissions: { members: "read" } });
    expect(org.scope.repository_ids).toBeUndefined();
    await expect(client().getToken({ ...ask, repositories: ["web"] })).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("maps refusals to typed errors and retries only what may be retried", async () => {
    mode = "denied";
    const before = requests;
    await expect(client().getToken(ask)).rejects.toMatchObject({
      code: "denied",
      retryable: false,
    });
    expect(requests - before).toBe(1);
    mode = "unavailable";
    const before2 = requests;
    await expect(client().getToken(ask)).rejects.toMatchObject({
      code: "unavailable",
      retryable: true,
    });
    expect(requests - before2).toBe(2);
    mode = "locked_down";
    await expect(client().getToken(ask)).rejects.toMatchObject({ code: "locked_down" });
  });

  it("treats a response signed by an unpinned key as untrusted, without retrying", async () => {
    mode = "rogue";
    const before = requests;
    const err = await client()
      .getToken(ask)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GmintError);
    expect(err).toMatchObject({ code: "untrusted", retryable: false });
    expect(requests - before).toBe(1);
  });

  describe("approvals (E12-04)", () => {
    const fast = { approvalPollMs: 10 };

    it("waits while the request is pending, then returns the token the approval issued", async () => {
      mode = "pending";
      pollScript = ["pending", "pending", "issue"];
      const before = { requests, polls, seqs: seqs.length };
      const told: string[] = [];
      await using token = await client().getToken(ask, {
        ...fast,
        onApprovalPending: (id) => told.push(id),
      });
      expect(token.reveal()).toBe(`ghs_approved${polls}`);
      expect(String(token)).toBe("[GmintToken redacted]");
      expect(token.scope.repository_ids).toEqual([2, 3]);
      expect(told).toHaveLength(1);
      expect(approvals.has(told[0]!)).toBe(true);
      // One request, never sent again; three polls for it.
      expect(requests - before.requests).toBe(1);
      expect(polls - before.polls).toBe(3);
      // The request and every poll took the next number of the same counter.
      const taken = seqs.slice(before.seqs);
      expect(taken).toHaveLength(4);
      for (let i = 1; i < taken.length; i++) expect(taken[i]!).toBeGreaterThan(taken[i - 1]!);
    });

    it.each(["denied", "approval_expired"] as const)(
      "throws %s when a poll is refused, and asks no more",
      async (code) => {
        mode = "pending";
        pollScript = ["pending", code];
        const before = { requests, polls };
        await expect(client().getToken(ask, fast)).rejects.toMatchObject({
          code,
          retryable: false,
        });
        expect(requests - before.requests).toBe(1);
        expect(polls - before.polls).toBe(2);
      },
    );

    it("keeps polling through an outage at one poll", async () => {
      mode = "pending";
      pollScript = ["unavailable", "issue"];
      const before = polls;
      await using token = await client().getToken(ask, fast);
      expect(token.reveal()).toMatch(/^ghs_approved/);
      expect(polls - before).toBe(2);
    });

    it("gives up after approvalTimeoutMs with approval_required and the approval's id", async () => {
      mode = "pending";
      pollScript = [];
      const told: string[] = [];
      const err = await client()
        .getToken(ask, {
          approvalPollMs: 10,
          approvalTimeoutMs: 60,
          onApprovalPending: (id) => told.push(id),
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GmintError);
      expect(err).toMatchObject({ code: "approval_required", retryable: false });
      expect(told).toHaveLength(1);
      expect((err as GmintError).message).toContain(told[0]!);
    });

    it("stops polling when the caller's signal aborts", async () => {
      mode = "pending";
      pollScript = [];
      const stop = new AbortController();
      const before = polls;
      const err = await client()
        .getToken(ask, {
          ...fast,
          signal: stop.signal,
          onApprovalPending: () => void setTimeout(() => stop.abort(), 50),
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "approval_required" });
      expect((err as GmintError).message).toMatch(/aborted/);
      const after = polls;
      expect(after - before).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(polls).toBe(after);
    });

    it("sends no poll for a signal that aborted before the answer came", async () => {
      mode = "pending";
      const before = { requests, polls };
      await expect(client().getToken(ask, { signal: AbortSignal.abort() })).rejects.toMatchObject({
        code: "approval_required",
      });
      expect(requests - before.requests).toBe(1);
      expect(polls - before.polls).toBe(0);
    });

    it("refuses wait options that make no sense before sending anything", async () => {
      const before = requests;
      await expect(client().getToken(ask, { approvalPollMs: 0 })).rejects.toMatchObject({
        code: "bad_request",
      });
      await expect(client().getToken(ask, { approvalTimeoutMs: -1 })).rejects.toMatchObject({
        code: "bad_request",
      });
      expect(requests).toBe(before);
    });
  });

  it("refuses key files others can read", () => {
    writeFileSync(f("loose.pem"), readFileSync(f("sign.pem")), { mode: 0o644 });
    chmodSync(f("loose.pem"), 0o644);
    expect(() => client({ signingKey: { kid: "c1", file: f("loose.pem") } })).toThrow(/chmod 600/);
  });
});

describe("nextSequence", () => {
  it("is strictly increasing and unique under concurrency", async () => {
    const path = join(dir, "seq-concurrent");
    const values = await Promise.all(Array.from({ length: 40 }, () => nextSequence(path)));
    expect(new Set(values).size).toBe(40);
    expect(Math.max(...values)).toBe(40);
    expect(await nextSequence(path)).toBe(41);
  });
});
