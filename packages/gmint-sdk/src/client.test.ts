import { execFileSync } from "node:child_process";
import { constants, generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { inspect } from "node:util";
import {
  b64uEncode,
  buildResponse,
  channelBinding,
  localSigner,
  rawPublicKey,
  utf8Decode,
  verifyRequest,
  type Code,
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
  let mode: "issue" | Code | "rogue" = "issue";
  let requests = 0;

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
          requests++;
          const cb = channelBinding(req.socket as TLSSocket)!;
          const v = verifyRequest(utf8Decode(new Uint8Array(Buffer.concat(chunks)))!, {
            resolveKey: (kid) =>
              kid === "c1"
                ? { key: clientSign.publicKey, owner: "gmint://test/client" }
                : undefined,
            aud: "gmint:test",
            htu: `https://localhost:${port}/v1/token`,
            cb,
          });
          if (!v.ok) return reply(403, "application/json", JSON.stringify({ code: "denied" }));
          const signer = localSigner(
            "resp-1",
            (mode === "rogue" ? rogueSign : serverSign).privateKey,
          );
          const jws =
            mode === "issue" || mode === "rogue"
              ? await buildResponse({
                  signer,
                  request: v.value,
                  status: "issued",
                  issued: {
                    credential: `ghs_test${requests}`,
                    expires_at: "2099-01-01T00:00:00Z",
                    scope: v.value.payload.req.scope,
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
