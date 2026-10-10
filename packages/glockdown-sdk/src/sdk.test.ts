import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { afterAll, describe, expect, it } from "vitest";
import { GlockdownStage, escalate, spkiPin, strictest } from "./index";

const dir = mkdtempSync(join(tmpdir(), "glockdown-sdk-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function write(app: string, body: unknown): void {
  const tmp = join(dir, `${app}.json.tmp`);
  writeFileSync(tmp, typeof body === "string" ? body : JSON.stringify(body));
  renameSync(tmp, join(dir, `${app}.json`));
}

const file = (stage: string, rung = stage) => ({
  v: 1,
  app: "gadvisory",
  rung,
  stage,
  at: 1_791_633_600,
});

describe("GlockdownStage", () => {
  it("is off while the agent is not installed, then follows the file", () => {
    let now = 0;
    const s = new GlockdownStage({ app: "gadvisory", dir, refreshMs: 1000, nowMs: () => now });
    expect(s.reading()).toEqual({ stage: "off", rung: null, at: null, source: "absent" });
    write("gadvisory", file("members"));
    expect(s.current()).toBe("off"); // read again only after refreshMs
    now = 1000;
    expect(s.current()).toBe("members");
    write("gadvisory", file("full", "sil"));
    now = 2000;
    expect(s.reading()).toMatchObject({ stage: "full", rung: "sil", source: "file" });
  });

  it("holds the last good stage through any fault, the file gone included", () => {
    let now = 0;
    const s = new GlockdownStage({ app: "gadvisory", dir, nowMs: () => now });
    write("gadvisory", file("admins"));
    expect(s.current()).toBe("admins");
    for (const broken of [
      "{",
      JSON.stringify({ ...file("off"), app: "gcontrol" }),
      JSON.stringify({ ...file("off"), extra: 1 }),
    ]) {
      write("gadvisory", broken);
      now += 1000;
      expect(s.reading()).toMatchObject({ stage: "admins", source: "held" });
    }
    rmSync(join(dir, "gadvisory.json"));
    now += 1000;
    expect(s.reading()).toMatchObject({ stage: "admins", source: "held" });
  });

  it("locks fully on a file it cannot read when it never read a good one", () => {
    write("gbroken", "not json");
    const s = new GlockdownStage({ app: "gbroken", dir });
    expect(s.reading()).toEqual({ stage: "full", rung: null, at: null, source: "unreadable" });
    expect(() => new GlockdownStage({ app: "../etc/passwd", dir })).toThrow(TypeError);
  });

  it("combines with the app's own sources, strictest wins", () => {
    expect(strictest("off", "members", "signups")).toBe("members");
    expect(strictest()).toBe("off");
  });
});

function hasEd25519Openssl(): boolean {
  try {
    const d = mkdtempSync(join(dir, "probe-"));
    execFileSync("openssl", ["genpkey", "-algorithm", "ed25519", "-out", join(d, "k")], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function identity(name: string): { cert: string; key: string } {
  const d = mkdtempSync(join(dir, `${name}-`));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ed25519",
      "-nodes",
      "-subj",
      `/CN=${name}`,
      "-days",
      "30",
      "-keyout",
      join(d, "k"),
      "-out",
      join(d, "c"),
    ],
    { stdio: "ignore" },
  );
  return { cert: readFileSync(join(d, "c"), "utf8"), key: readFileSync(join(d, "k"), "utf8") };
}

describe("escalate", () => {
  it.runIf(hasEd25519Openssl())("talks only to a pinned edge, as a pinned app", async () => {
    const edge = identity("edge");
    const app = identity("gadvisory");
    const stranger = identity("stranger");
    const seen: unknown[] = [];
    const server = createServer(
      {
        cert: edge.cert,
        key: edge.key,
        requestCert: true,
        rejectUnauthorized: false,
        minVersion: "TLSv1.3",
      },
      (req, res) => {
        const peer = (req.socket as TLSSocket).getPeerX509Certificate();
        const pin = peer ? spkiPin(peer.toString()) : null;
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          seen.push({ path: req.url, pin, body: JSON.parse(Buffer.concat(chunks).toString()) });
          if (pin !== spkiPin(app.cert)) {
            res.writeHead(403).end(JSON.stringify({ code: "denied" }));
            return;
          }
          res.writeHead(200).end(JSON.stringify({ ok: true, outcomes: [{ kind: "held" }] }));
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const ok = await escalate({
        url,
        edgePins: [spkiPin(edge.cert)],
        ...app,
        reason: "decoy admin used",
      });
      expect(ok).toMatchObject({ ok: true, body: { outcomes: [{ kind: "held" }] } });
      expect(seen[0]).toEqual({
        path: "/v1/escalate",
        pin: spkiPin(app.cert),
        body: { apps: null, reason: "decoy admin used" },
      });
      expect(
        await escalate({ url, edgePins: [spkiPin(edge.cert)], ...stranger, reason: "x" }),
      ).toEqual({
        ok: false,
        status: 403,
        code: "denied",
      });
      const wrongEdge = await escalate({
        url,
        edgePins: [spkiPin(stranger.cert)],
        ...app,
        reason: "x",
      });
      expect(wrongEdge).toMatchObject({
        ok: false,
        code: "unavailable",
        detail: "the edge's key is not pinned",
      });
      expect(seen).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
