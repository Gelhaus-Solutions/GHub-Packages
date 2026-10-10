/**
 * Certificate renewal against a protocol-speaking stand-in that issues with openssl: the client
 * renews for its own key, writes the chain over its certificate file, keeps working with it, and
 * renews by itself once two thirds of the certificate's life are gone.
 */

import { execFileSync } from "node:child_process";
import { X509Certificate, constants, generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import {
  b64uEncode,
  buildRenewResponse,
  channelBinding,
  csrPem,
  localSigner,
  rawPublicKey,
  sha256,
  utf8Decode,
  verifyRenewRequest,
  type Code,
} from "@ghub/gmint-protocol";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GmintClient } from "./client";
import type { GmintError } from "./errors";

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), "gmint-sdk-renew-"));
const f = (n: string) => join(dir, n);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.runIf(hasOpenssl())("certificate renewal", () => {
  const ossl = (...args: string[]) => execFileSync("openssl", args, { stdio: "ignore" });
  const clientSign = generateKeyPairSync("ed25519");
  const serverSign = generateKeyPairSync("ed25519");
  let server: Server;
  let port = 0;
  let mode: "issue" | "other_key" | Code = "issue";
  let renewals = 0;

  /**
   * Issues a certificate for a CSR with the test root, valid for `days` from now. Only `-days`:
   * `-not_before` and `-not_after` need OpenSSL 3.4, and CI runners have 3.0.
   */
  const issue = (csr: string, days: number) => {
    writeFileSync(f("req.csr"), csr);
    writeFileSync(
      f("leaf.ext"),
      "basicConstraints=critical,CA:false\nextendedKeyUsage=clientAuth\n",
    );
    ossl(
      "x509",
      "-req",
      "-in",
      f("req.csr"),
      "-CA",
      f("ca.pem"),
      "-CAkey",
      f("ca.key"),
      "-CAcreateserial",
      "-days",
      String(days),
      "-copy_extensions",
      "copyall",
      "-extfile",
      f("leaf.ext"),
      "-out",
      f("issued.pem"),
    );
    return readFileSync(f("issued.pem"), "utf8");
  };

  beforeAll(async () => {
    ossl("genpkey", "-algorithm", "ed25519", "-out", f("ca.key"));
    ossl(
      "req",
      "-x509",
      "-new",
      "-key",
      f("ca.key"),
      "-out",
      f("ca.pem"),
      "-days",
      "2",
      "-subj",
      "/CN=test root",
      "-addext",
      "basicConstraints=critical,CA:true",
      "-addext",
      "keyUsage=critical,keyCertSign",
    );
    for (const name of ["server", "client", "other"]) {
      ossl("genpkey", "-algorithm", "ed25519", "-out", f(`${name}.key`));
      ossl(
        "req",
        "-new",
        "-key",
        f(`${name}.key`),
        "-out",
        f(`${name}.csr`),
        "-subj",
        `/CN=${name}`,
      );
    }
    writeFileSync(f("server.ext"), "subjectAltName=DNS:localhost,IP:127.0.0.1\n");
    ossl(
      "x509",
      "-req",
      "-in",
      f("server.csr"),
      "-CA",
      f("ca.pem"),
      "-CAkey",
      f("ca.key"),
      "-CAcreateserial",
      "-days",
      "1",
      "-extfile",
      f("server.ext"),
      "-out",
      f("server.pem"),
    );
    // A day's certificate; the auto-renewal test moves the client's clock 17 hours on, past two
    // thirds of its life, while TLS keeps checking real time.
    writeFileSync(f("client.pem"), issue(readFileSync(f("client.csr"), "utf8"), 1));
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
          const socket = req.socket as TLSSocket;
          const reply = (status: number, type: string, body: string) => {
            res.writeHead(status, {
              "content-type": type,
              "content-length": Buffer.byteLength(body),
            });
            res.end(body);
          };
          if (req.url !== "/v1/cert/renew")
            return reply(404, "application/json", '{"code":"bad_request"}');
          renewals++;
          const v = verifyRenewRequest(utf8Decode(new Uint8Array(Buffer.concat(chunks)))!, {
            resolveKey: (kid) =>
              kid === "c1"
                ? { key: clientSign.publicKey, owner: "gmint://test/client" }
                : undefined,
            aud: "gmint:test",
            htu: `https://localhost:${port}/v1/cert/renew`,
            cb: channelBinding(socket)!,
          });
          if (!v.ok) return reply(403, "application/json", '{"code":"denied"}');
          // The connection's key, and the CSR's, must be the same key.
          const peer = socket
            .getPeerX509Certificate()!
            .publicKey.export({ type: "spki", format: "der" });
          if (b64uEncode(sha256(new Uint8Array(peer))) !== b64uEncode(sha256(v.value.csr.spki)))
            return reply(403, "application/json", '{"code":"denied"}');
          const signer = localSigner("s1", serverSign.privateKey);
          const body =
            mode === "issue" || mode === "other_key"
              ? await buildRenewResponse({
                  signer,
                  request: v.value,
                  status: "issued",
                  chain: [
                    new Uint8Array(
                      new X509Certificate(
                        issue(
                          mode === "issue"
                            ? csrPem(v.value.csrDer)
                            : readFileSync(f("other.csr"), "utf8"),
                          7,
                        ),
                      ).raw,
                    ),
                  ],
                })
              : await buildRenewResponse({
                  signer,
                  request: v.value,
                  status: "refused",
                  code: mode as Exclude<Code, "approval_required">,
                });
          reply(200, "application/gmint-renew-res+jws", body);
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  }, 30_000);

  afterAll(() => server?.close());

  const client = (over: Partial<ConstructorParameters<typeof GmintClient>[0]> = {}) =>
    new GmintClient({
      url: `https://localhost:${port}`,
      instance: "test",
      clientId: "gmint://test/client",
      signingKey: { kid: "c1", file: f("sign.pem") },
      tls: { certFile: f("client.pem"), keyFile: f("client.key"), caFile: f("ca.pem") },
      serverKeys: { s1: b64uEncode(rawPublicKey(serverSign.publicKey)) },
      sequenceFile: f("seq"),
      autoRenew: false,
      ...over,
    });

  it("refuses an answer for another key and leaves the certificate alone", async () => {
    mode = "other_key";
    const before = readFileSync(f("client.pem"), "utf8");
    const c = client();
    await expect(c.renewCertificate()).rejects.toMatchObject({ code: "untrusted" });
    expect(readFileSync(f("client.pem"), "utf8")).toBe(before);
    mode = "locked_down";
    await expect(c.renewCertificate()).rejects.toMatchObject({ code: "locked_down" });
    c.close();
  });

  it("renews by itself when two thirds of the life are gone, for the same key", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 17 * 3_600_000 });
    try {
      mode = "issue";
      const before = new X509Certificate(readFileSync(f("client.pem")));
      const errors: GmintError[] = [];
      const c = client({ autoRenew: true, onRenewError: (e) => errors.push(e) });
      const seen = renewals;
      // getToken renews first; the mint itself then fails here (the stand-in has no token route).
      await expect(
        c.getToken({
          grant: "g",
          installationId: 1,
          repositoryIds: [1],
          permissions: { contents: "read" },
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
      expect(errors).toEqual([]);
      expect(renewals).toBe(seen + 1);
      const after = new X509Certificate(readFileSync(f("client.pem")));
      expect(after.serialNumber).not.toBe(before.serialNumber);
      expect(after.publicKey.export({ type: "spki", format: "der" })).toEqual(
        before.publicKey.export({ type: "spki", format: "der" }),
      );
      expect(c.certificateExpiry().getTime()).toBe(Date.parse(after.validTo));
      expect(statSync(f("client.pem")).mode & 0o777).toBe(0o644 & ~process.umask());

      // Freshly renewed: not due again, and the new certificate is the one the server now sees.
      await c
        .getToken({
          grant: "g",
          installationId: 1,
          repositoryIds: [1],
          permissions: { contents: "read" },
        })
        .catch(() => undefined);
      expect(renewals).toBe(seen + 1);
      expect(await c.renewCertificate()).toBeInstanceOf(Date);
      c.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one renewal between concurrent callers, and another client picks it up from disk", async () => {
    mode = "issue";
    const a = client();
    const seen = renewals;
    const [x, y] = await Promise.all([a.renewCertificate(), a.renewCertificate()]);
    expect(x).toEqual(y);
    expect(renewals).toBe(seen + 1);
    const b = client();
    await a.renewCertificate();
    expect(b.certificateExpiry().getTime()).toBe(
      Date.parse(new X509Certificate(readFileSync(f("client.pem"))).validTo),
    );
    a.close();
    b.close();
  });
});
