import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { afterAll, describe, expect, it } from "vitest";
import {
  GlockdownStage,
  Honeytokens,
  escalate,
  reportDecoys,
  signal,
  spkiPin,
  strictest,
} from "./index";

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

  it("refuses every credential from AAL phase 1, sessions included, and not at SAL full", () => {
    let now = 0;
    const s = new GlockdownStage({ app: "gadvisory", dir, nowMs: () => now });
    for (const [rung, every] of [
      ["full", false],
      ["aal", true],
      ["aal2", true],
      ["ail", true],
    ] as const) {
      write("gadvisory", file("full", rung));
      now += 1000;
      expect(s.reading()).toMatchObject({ stage: "full", rung, source: "file" });
      expect(s.refusesEveryCredential()).toBe(every);
    }
    write("gnew", "not json");
    expect(new GlockdownStage({ app: "gnew", dir }).refusesEveryCredential()).toBe(false);
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
      const told = await signal({
        url,
        edgePins: [spkiPin(edge.cert)],
        ...app,
        signal: "decoy_admin",
        detail: "sign-in as the decoy admin",
      });
      expect(told).toMatchObject({ ok: true });
      expect(seen[2]).toEqual({
        path: "/v1/signal",
        pin: spkiPin(app.cert),
        body: { signal: "decoy_admin", detail: "sign-in as the decoy admin" },
      });
      const decoys = new Honeytokens({
        logins: ["Admin@GAdvisory.org"],
        keySha256: [createHash("sha256").update("gadv_live_decoy").digest("hex")],
        trip: () => {},
      });
      expect(
        await reportDecoys({
          url,
          edgePins: [spkiPin(edge.cert)],
          ...app,
          ...decoys.fingerprints(),
        }),
      ).toMatchObject({ ok: true });
      expect(seen[3]).toEqual({
        path: "/v1/decoyset",
        pin: spkiPin(app.cert),
        body: decoys.fingerprints(),
      });
    } finally {
      server.close();
    }
  });
});

describe("GlockdownStage with the edge as a second source", () => {
  it.runIf(hasEd25519Openssl())(
    "holds the stricter of the file and the edge, and the edge's last answer while it is silent",
    async () => {
      const edge = identity("edge2");
      const app = identity("gadvisory2");
      let answer: unknown = file("full", "aal");
      let up = true;
      const server = createServer(
        {
          cert: edge.cert,
          key: edge.key,
          requestCert: true,
          rejectUnauthorized: false,
          minVersion: "TLSv1.3",
        },
        (req, res) => {
          if (!up) return void req.socket.destroy();
          const peer = (req.socket as TLSSocket).getPeerX509Certificate();
          if (
            req.method !== "GET" ||
            req.url !== "/v1/stage" ||
            !peer ||
            spkiPin(peer.toString()) !== spkiPin(app.cert)
          ) {
            return void res.writeHead(404).end(JSON.stringify({ code: "not_found" }));
          }
          res.writeHead(200).end(JSON.stringify(answer));
        },
      );
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const url = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
      let now = 0;
      try {
        // The file says off (rewritten, say); the edge says AAL phase 1: the edge wins.
        write("gadvisory", file("off"));
        const s = new GlockdownStage({
          app: "gadvisory",
          dir,
          nowMs: () => now,
          edge: { url, edgePins: [spkiPin(edge.cert)], ...app },
        });
        expect(s.current()).toBe("off"); // before the first answer: the file alone
        await s.askEdge();
        expect(s.reading()).toMatchObject({ stage: "full", rung: "aal", source: "edge" });
        expect(s.refusesEveryCredential()).toBe(true);

        // The edge goes silent: its last answer holds.
        up = false;
        now += 60_000;
        await s.askEdge();
        expect(s.refusesEveryCredential()).toBe(true);

        // An answer for another app, or a broken one, changes nothing.
        up = true;
        answer = { ...file("off"), app: "gcontrol" };
        now += 60_000;
        await s.askEdge();
        expect(s.current()).toBe("full");

        // The file stricter than the edge: the file wins.
        answer = file("signups");
        write("gadvisory", file("admins"));
        now += 60_000;
        await s.askEdge();
        expect(s.reading()).toMatchObject({ stage: "admins", source: "file" });
      } finally {
        server.close();
      }
    },
  );
});

describe("Honeytokens", () => {
  const sha = (k: string) => createHash("sha256").update(k).digest("hex");

  it("knows the decoy admin and key, tells GLockdown at most once a minute each, never the key", () => {
    let now = 0;
    const told: { signal: string; detail: string }[] = [];
    const h = new Honeytokens({
      logins: ["Admin@GAdvisory.org", "root-admin"],
      keySha256: [sha("gadv_live_decoy")],
      trip: (s) => void told.push(s),
      now: () => now,
    });
    expect(h.isDecoyLogin("someone@gadvisory.org")).toBe(false);
    expect(h.isDecoyKey("gadv_live_real")).toBe(false);
    expect(told).toEqual([]);
    expect(h.isDecoyLogin(" admin@gadvisory.org", "from 203.0.113.9")).toBe(true);
    expect(h.isDecoyLogin("ROOT-ADMIN")).toBe(true); // still refused; told once a minute
    expect(h.isDecoyKey("gadv_live_decoy", "GET /api/v1/advisories")).toBe(true);
    now += 60_000;
    expect(h.isDecoyLogin("root-admin")).toBe(true);
    expect(told).toEqual([
      { signal: "decoy_admin", detail: "sign-in as the decoy admin: from 203.0.113.9" },
      { signal: "decoy_api_key", detail: "the decoy API key used: GET /api/v1/advisories" },
      { signal: "decoy_admin", detail: "sign-in as the decoy admin" },
    ]);
    expect(JSON.stringify(told)).not.toContain("gadv_live_decoy");
  });

  it("gives what it holds as hashes only, the login as it compares it (L120)", () => {
    const h = new Honeytokens({
      logins: [" Admin@GAdvisory.org "],
      keySha256: [sha("gadv_live_decoy").toUpperCase()],
      trip: () => {},
    });
    expect(h.fingerprints()).toEqual({
      keys: [sha("gadv_live_decoy")],
      logins: [sha("admin@gadvisory.org")],
    });
    expect(JSON.stringify(h.fingerprints())).not.toContain("gadv_live_decoy");
    expect(JSON.stringify(h.fingerprints())).not.toContain("admin");
  });

  it("refuses a hash that is not SHA-256, and survives a trip that throws", () => {
    expect(() => new Honeytokens({ logins: [], keySha256: ["abc"], trip: () => {} })).toThrow(
      /64 hex/,
    );
    const h = new Honeytokens({
      logins: ["admin"],
      keySha256: [],
      trip: () => {
        throw new Error("edge down");
      },
    });
    expect(h.isDecoyLogin("admin")).toBe(true);
  });
});
