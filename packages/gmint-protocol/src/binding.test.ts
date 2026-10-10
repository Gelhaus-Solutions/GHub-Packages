import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, createServer, type TLSSocket } from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHANNEL_BINDING_LABEL, channelBinding } from "./binding";

// A throwaway self-signed certificate for a loopback server, made fresh for each run so no key
// material lives in the repository. Skipped where openssl is not installed.
function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasOpenssl())("tls-exporter channel binding", () => {
  const dir = mkdtempSync(join(tmpdir(), "gmint-binding-"));
  let key: Buffer;
  let cert: Buffer;
  let server: ReturnType<typeof createServer>;
  let port: number;
  const serverSide: Uint8Array[] = [];

  beforeAll(async () => {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        join(dir, "k.pem"),
        "-out",
        join(dir, "c.pem"),
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
      ],
      { stdio: "ignore" },
    );
    key = readFileSync(join(dir, "k.pem"));
    cert = readFileSync(join(dir, "c.pem"));
    server = createServer({ key, cert, minVersion: "TLSv1.3" }, (socket) => {
      serverSide.push(channelBinding(socket)!);
      socket.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function dial(
    session?: Buffer,
  ): Promise<{ cb: Uint8Array; empty: Uint8Array; session?: Buffer; resumed: boolean }> {
    return new Promise((resolve, reject) => {
      let ticket: Buffer | undefined;
      const socket: TLSSocket = connect({
        host: "127.0.0.1",
        port,
        ca: cert,
        servername: "localhost",
        minVersion: "TLSv1.3",
        ...(session ? { session } : {}),
      });
      socket.on("session", (s: Buffer) => (ticket = s));
      socket.once("secureConnect", () => {
        const cb = channelBinding(socket)!;
        const empty = new Uint8Array(
          socket.exportKeyingMaterial(32, CHANNEL_BINDING_LABEL, Buffer.alloc(0)),
        );
        const resumed = socket.isSessionReused();
        socket.on("end", () =>
          resolve({ cb, empty, resumed, ...(ticket ? { session: ticket } : {}) }),
        );
        socket.resume();
      });
      socket.on("error", reject);
    });
  }

  it("is equal on both ends, 32 bytes, and an absent context equals an empty one", async () => {
    const before = serverSide.length;
    const a = await dial();
    expect(a.cb).toHaveLength(32);
    expect(serverSide[before]).toEqual(a.cb);
    expect(a.empty).toEqual(a.cb);
  });

  it("differs on every connection, including a resumed one", async () => {
    const first = await dial();
    const second = await dial();
    expect(first.cb).not.toEqual(second.cb);
    if (first.session) {
      const resumed = await dial(first.session);
      expect(resumed.cb).not.toEqual(first.cb);
    }
  });
});
