import { X509Certificate, createPrivateKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsr } from "./csr";
import { b64uEncode, utf8Encode } from "./encoding";
import { localSigner, signCompact } from "./jws";
import { buildRequest } from "./messages";
import {
  RENEW_RESPONSE_TYP,
  RENEW_TYP,
  buildRenewRequest,
  buildRenewResponse,
  chainPem,
  verifyRenewRequest,
  verifyRenewResponse,
  type BuiltRenewRequest,
  type VerifiedRenewRequest,
} from "./renew";

// A fixed Ed25519 PKI made with openssl (vectors.renew.json says how), valid until 2126.
const V = JSON.parse(readFileSync(join(__dirname, "vectors.renew.json"), "utf8")) as Record<
  string,
  string
>;
const seedKey = (hex: string) =>
  createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(hex, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });
const der = (pem: string) => new Uint8Array(new X509Certificate(pem).raw);

const NOW = 1_800_000_000; // 2027-01-15, inside the vectors' validity
const AUD = "gmint:prod-1";
const HTU = "https://mint.example.org:8443/v1/cert/renew";
const CLIENT = "gmint://gadvisory/api";
const tlsKey = seedKey(V.leafKeySeed!);
const signKeys = generateKeyPairSync("ed25519");
const serverKeys = generateKeyPairSync("ed25519");
const signer = localSigner("gadv-api-1", signKeys.privateKey);
const server = localSigner("gmint-resp-1", serverKeys.privateKey);
const cb = new Uint8Array(randomBytes(32));
const anchors = [new X509Certificate(V.root!)];
const resolveKey = (kid: string) =>
  kid === "gadv-api-1" ? { key: signKeys.publicKey, owner: CLIENT } : undefined;
const serverCtx = { resolveKey, aud: AUD, htu: HTU, cb, now: NOW };

const request = (over: Partial<Parameters<typeof buildRenewRequest>[0]> = {}) =>
  buildRenewRequest({ signer, iss: CLIENT, aud: AUD, htu: HTU, cb, tlsKey, now: NOW, ...over });

async function verified(built: BuiltRenewRequest): Promise<VerifiedRenewRequest> {
  const v = verifyRenewRequest(built.jws, serverCtx);
  if (!v.ok) throw new Error(v.reason);
  return v.value;
}

const clientCheck = (jws: string, built: BuiltRenewRequest, over: object = {}) =>
  verifyRenewResponse(jws, {
    serverKeys: (kid) => (kid === "gmint-resp-1" ? serverKeys.publicKey : undefined),
    request: built,
    cb,
    anchors,
    now: NOW,
    ...over,
  });

describe("renewal round trip", () => {
  it("issues a chain the client accepts for its own key", async () => {
    const built = await request();
    const v = await verified(built);
    expect(v.csr.uris).toEqual([CLIENT]);
    const jws = await buildRenewResponse({
      signer: server,
      request: v,
      status: "issued",
      chain: [der(V.leaf!), der(V.intermediate!)],
      now: NOW,
    });
    const r = clientCheck(jws, built);
    expect(r.ok && r.value.status === "issued" && r.value.chain.length).toBe(2);
    if (r.ok && r.value.status === "issued") {
      expect(r.value.notAfter).toBeGreaterThan(NOW);
      expect(chainPem(r.value.chain)).toBe(V.leaf! + V.intermediate!);
    }
  });

  it("passes a refusal through with its code", async () => {
    const built = await request();
    const jws = await buildRenewResponse({
      signer: server,
      request: await verified(built),
      status: "refused",
      code: "locked_down",
      now: NOW,
    });
    expect(clientCheck(jws, built)).toEqual({
      ok: true,
      value: { status: "refused", code: "locked_down" },
    });
  });
});

describe("server checks", () => {
  it("refuses another message kind, a foreign key, and bad bytes", async () => {
    const mint = await buildRequest({
      signer,
      iss: CLIENT,
      aud: AUD,
      htu: HTU,
      seq: 1,
      cb,
      req: {
        provider: "github",
        grant: "g",
        scope: { installation_id: 1, repository_ids: [1], permissions: { contents: "read" } },
      },
      now: NOW,
    });
    expect(verifyRenewRequest(mint.jws, serverCtx)).toEqual({
      ok: false,
      reason: "request_malformed",
    });
    const stranger = localSigner("someone", generateKeyPairSync("ed25519").privateKey);
    expect(verifyRenewRequest((await request({ signer: stranger })).jws, serverCtx)).toEqual({
      ok: false,
      reason: "request_unknown_key",
    });
  });

  it("refuses a wrong issuer, audience, target, time or channel", async () => {
    const cases: [Partial<Parameters<typeof buildRenewRequest>[0]>, string][] = [
      [{ iss: "gmint://gadvisory/web" }, "request_wrong_issuer"],
      [{ aud: "gmint:other" }, "request_wrong_audience"],
      [{ htu: "https://mint.example.org:8443/v1/token" }, "request_wrong_target"],
      [{ now: NOW - 61 }, "request_stale"],
      [{ cb: new Uint8Array(32) }, "request_wrong_channel"],
    ];
    for (const [over, reason] of cases)
      expect(verifyRenewRequest((await request(over)).jws, serverCtx), reason).toEqual({
        ok: false,
        reason,
      });
  });

  it("refuses a CSR that names someone else or does not verify", async () => {
    const payload = (csr: Uint8Array) => ({
      v: 1,
      iss: CLIENT,
      aud: AUD,
      htm: "POST",
      htu: HTU,
      iat: NOW,
      jti: b64uEncode(new Uint8Array(16)),
      cb: b64uEncode(cb),
      csr: b64uEncode(csr),
    });
    const send = async (csr: Uint8Array) =>
      verifyRenewRequest(
        await signCompact(RENEW_TYP, utf8Encode(JSON.stringify(payload(csr))), signer),
        serverCtx,
      );
    expect(await send(buildCsr(tlsKey, "gmint://gadvisory/web"))).toEqual({
      ok: false,
      reason: "request_wrong_issuer",
    });
    const broken = buildCsr(tlsKey, CLIENT);
    broken[broken.length - 1]! ^= 1;
    expect(await send(broken)).toEqual({ ok: false, reason: "request_malformed" });
    expect((await send(buildCsr(tlsKey, CLIENT))).ok).toBe(true);
  });

  it("takes node identities too", async () => {
    const nodeCtx = {
      ...serverCtx,
      resolveKey: (kid: string) =>
        kid === "gadv-api-1" ? { key: signKeys.publicKey, owner: "node://homelab-1" } : undefined,
    };
    expect(verifyRenewRequest((await request({ iss: "node://homelab-1" })).jws, nodeCtx).ok).toBe(
      true,
    );
  });
});

describe("client checks", () => {
  const issued = async (chain: string[], over: object = {}) => {
    const built = await request();
    const jws = await buildRenewResponse({
      signer: server,
      request: await verified(built),
      status: "issued",
      chain: chain.map(der),
      now: NOW,
    });
    return clientCheck(jws, built, over);
  };

  it("refuses a certificate for another key", async () => {
    expect(await issued([V.other!, V.intermediate!])).toEqual({
      ok: false,
      reason: "response_wrong_key",
    });
  });

  it("refuses a chain that does not reach the pinned root, or has expired", async () => {
    const untrusted = { ok: false, reason: "response_untrusted_certificate" };
    expect(await issued([V.rogueLeaf!])).toEqual(untrusted); // same names, another root
    expect(await issued([V.leaf!])).toEqual(untrusted); // the intermediate missing
    expect(
      await issued([V.leaf!, V.intermediate!], { anchors: [new X509Certificate(V.rogueRoot!)] }),
    ).toEqual(untrusted);
    expect(await issued([V.leaf!, V.intermediate!, V.root!])).toMatchObject({ ok: true }); // the root itself may come along
    expect(await issued([V.leaf!, V.leaf!])).toEqual(untrusted); // a leaf is not an issuer
  });

  it("refuses an answer to another request, another connection, an old one or a foreign signer", async () => {
    const built = await request();
    const other = await request();
    const answer = (signWith = server, now = NOW) =>
      verified(built).then((v) =>
        buildRenewResponse({
          signer: signWith,
          request: v,
          status: "refused",
          code: "denied",
          now,
        }),
      );
    expect(clientCheck(await answer(), other)).toEqual({
      ok: false,
      reason: "response_wrong_request",
    });
    expect(clientCheck(await answer(), built, { cb: new Uint8Array(32) })).toEqual({
      ok: false,
      reason: "response_wrong_channel",
    });
    expect(clientCheck(await answer(server, NOW - 61), built)).toEqual({
      ok: false,
      reason: "response_stale",
    });
    const rogue = localSigner("gmint-resp-1", generateKeyPairSync("ed25519").privateKey);
    expect(clientCheck(await answer(rogue), built)).toEqual({
      ok: false,
      reason: "response_bad_signature",
    });
  });

  it("refuses a malformed answer: a chain with a refusal, a code with an issue", async () => {
    const built = await request();
    const v = await verified(built);
    const base = { v: 1, req_hash: b64uEncode(v.reqHash), cb: v.payload.cb, iat: NOW };
    for (const body of [
      { ...base, status: "refused", code: "denied", chain: [b64uEncode(der(V.leaf!))] },
      { ...base, status: "issued", code: "denied", chain: [b64uEncode(der(V.leaf!))] },
      { ...base, status: "issued", chain: [] },
      { ...base, status: "issued", chain: ["AAAA"] },
    ]) {
      const jws = await signCompact(RENEW_RESPONSE_TYP, utf8Encode(JSON.stringify(body)), server);
      expect(clientCheck(jws, built)).toEqual({ ok: false, reason: "response_malformed" });
    }
  });
});
