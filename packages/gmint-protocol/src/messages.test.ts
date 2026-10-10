import { generateKeyPairSync, randomBytes } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { b64uEncode, utf8Encode } from "./encoding";
import { localSigner, signCompact } from "./jws";
import {
  REQUEST_TYP,
  buildRequest,
  buildResponse,
  publicCode,
  scopeWithin,
  verifyRequest,
  verifyResponse,
  type BuiltRequest,
  type MintRequest,
  type VerifiedRequest,
} from "./messages";

const NOW = 1_790_000_000;
const AUD = "gmint:prod-1";
const HTU = "https://mint.example.org:8443/v1/token";
const CLIENT = "gmint://gadvisory/api";

const clientKeys = generateKeyPairSync("ed25519");
const serverKeys = generateKeyPairSync("ed25519");
const clientSigner = localSigner("gadv-api-1", clientKeys.privateKey);
const serverSigner = localSigner("gmint-resp-1", serverKeys.privateKey);
const cb = new Uint8Array(randomBytes(32));

const mint: MintRequest = {
  provider: "github",
  grant: "gadvisory-git-sync",
  scope: {
    installation_id: 12345678,
    repository_ids: [222, 111],
    permissions: { contents: "read", metadata: "read" },
  },
  tenant: "scope-42",
  purpose: "git-sync scope 42",
};

const resolveKey = (kid: string) =>
  kid === "gadv-api-1" ? { key: clientKeys.publicKey, owner: CLIENT } : undefined;
const serverKey = (kid: string) => (kid === "gmint-resp-1" ? serverKeys.publicKey : undefined);

function request(over: Partial<Parameters<typeof buildRequest>[0]> = {}): Promise<BuiltRequest> {
  return buildRequest({
    signer: clientSigner,
    iss: CLIENT,
    aud: AUD,
    htu: HTU,
    seq: 7,
    cb,
    req: mint,
    now: NOW,
    ...over,
  });
}

function verified(built: BuiltRequest): VerifiedRequest {
  const v = verifyRequest(built.jws, { resolveKey, aud: AUD, htu: HTU, cb, now: NOW });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
}

const issued = {
  credential: "ghs_" + "a".repeat(500),
  expires_at: "2026-10-10T13:00:00Z",
  scope: {
    installation_id: 12345678,
    repository_ids: [111, 222],
    permissions: { contents: "read" as const, metadata: "read" as const },
  },
};

describe("request", () => {
  it("round-trips and normalizes repository ids", async () => {
    const built = await request();
    const v = verified(built);
    expect(v.payload.req.scope.repository_ids).toEqual([111, 222]);
    expect(v.payload.req.tenant).toBe("scope-42");
    expect(v.reqHash).toHaveLength(32);
  });

  it.each([
    ["another connection", { cb: new Uint8Array(32) }, "request_wrong_channel"],
    ["another audience", { aud: "gmint:staging" }, "request_wrong_audience"],
    ["another target", { htu: "https://mint.example.org:8443/v1/other" }, "request_wrong_target"],
    ["a stale clock", { now: NOW + 61 }, "request_stale"],
  ] as const)("refuses a request checked against %s", async (_, ctx, reason) => {
    const built = await request();
    expect(
      verifyRequest(built.jws, { resolveKey, aud: AUD, htu: HTU, cb, now: NOW, ...ctx }),
    ).toEqual({ ok: false, reason });
  });

  it("refuses an issuer that does not own the key", async () => {
    const built = await request({ iss: "gmint://other/client" });
    expect(verifyRequest(built.jws, { resolveKey, aud: AUD, htu: HTU, cb, now: NOW })).toEqual({
      ok: false,
      reason: "request_wrong_issuer",
    });
  });

  it("refuses unknown keys and maps reasons to policy-blind codes", async () => {
    const built = await request();
    const res = verifyRequest(built.jws, {
      resolveKey: () => undefined,
      aud: AUD,
      htu: HTU,
      cb,
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "request_unknown_key" });
    expect(publicCode("request_unknown_key")).toBe("denied");
    expect(publicCode("request_bad_signature")).toBe("denied");
    expect(publicCode("request_malformed")).toBe("bad_request");
  });

  async function signed(payload: object): Promise<string> {
    return signCompact(REQUEST_TYP, utf8Encode(JSON.stringify(payload)), clientSigner);
  }

  it("refuses well-signed payloads that break the rules", async () => {
    const good = (await request()).payload;
    const variants: object[] = [
      { ...good, extra: 1 },
      { ...good, v: 2 },
      { ...good, htm: "GET" },
      { ...good, seq: 0 },
      { ...good, jti: b64uEncode(new Uint8Array(8)) },
      { ...good, req: { ...good.req, provider: "gitlab" } },
      { ...good, req: { ...good.req, grant: "Has Spaces" } },
      { ...good, req: { ...good.req, tenant: "" } },
      { ...good, req: { ...good.req, purpose: "line\nbreak" } },
      { ...good, req: { ...good.req, scope: { ...good.req.scope, repository_ids: [222, 111] } } },
      { ...good, req: { ...good.req, scope: { ...good.req.scope, repository_ids: [] } } },
      { ...good, req: { ...good.req, scope: { ...good.req.scope, permissions: {} } } },
      {
        ...good,
        req: { ...good.req, scope: { ...good.req.scope, permissions: { contents: "owner" } } },
      },
      { ...good, req: { ...good.req, scope: { ...good.req.scope, installation_id: -1 } } },
    ];
    for (const payload of variants) {
      expect(
        verifyRequest(await signed(payload), { resolveKey, aud: AUD, htu: HTU, cb, now: NOW }),
      ).toEqual({
        ok: false,
        reason: "request_malformed",
      });
    }
  });

  it("refuses to build what the verifier would refuse", async () => {
    await expect(request({ req: { ...mint, grant: "BAD GRANT" } })).rejects.toThrow();
    await expect(request({ cb: new Uint8Array(31) })).rejects.toThrow();
  });

  it("rejects every single-character mutation of a valid request", async () => {
    const built = await request();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    fc.assert(
      fc.property(fc.nat(built.jws.length - 1), fc.nat(alphabet.length - 1), (i, c) => {
        const ch = alphabet[c]!;
        fc.pre(built.jws[i] !== ch);
        const mutated = built.jws.slice(0, i) + ch + built.jws.slice(i + 1);
        return !verifyRequest(mutated, { resolveKey, aud: AUD, htu: HTU, cb, now: NOW }).ok;
      }),
      { numRuns: 400 },
    );
  });
});

describe("response", () => {
  it("issues: the client opens the seal and gets the credential", async () => {
    const built = await request();
    const jws = await buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued,
      now: NOW,
    });
    const res = verifyResponse(jws, {
      serverKeys: serverKey,
      request: built,
      clientKid: "gadv-api-1",
      cb,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.value.status === "issued") {
      expect(res.value.issued.credential).toBe(issued.credential);
      expect(res.value.issued.hashed).toHaveLength(43);
    }
    // The credential never appears in the signed envelope in the clear.
    expect(Buffer.from(jws.split(".")[1]!, "base64url").toString()).not.toContain("ghs_");
  });

  it("carries pending and refused outcomes", async () => {
    const built = await request();
    const v = verified(built);
    const pending = await buildResponse({
      signer: serverSigner,
      request: v,
      status: "pending",
      requestId: "A".repeat(22),
      now: NOW,
    });
    expect(
      verifyResponse(pending, {
        serverKeys: serverKey,
        request: built,
        clientKid: "gadv-api-1",
        cb,
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      value: { status: "pending", requestId: "A".repeat(22) },
    });
    const refused = await buildResponse({
      signer: serverSigner,
      request: v,
      status: "refused",
      code: "locked_down",
      now: NOW,
    });
    expect(
      verifyResponse(refused, {
        serverKeys: serverKey,
        request: built,
        clientKid: "gadv-api-1",
        cb,
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      value: { status: "refused", code: "locked_down" },
    });
  });

  it("refuses a response to another request (substitution)", async () => {
    const a = await request();
    const b = await request({ seq: 8 });
    const forB = await buildResponse({
      signer: serverSigner,
      request: verified(b),
      status: "issued",
      issued,
      now: NOW,
    });
    expect(
      verifyResponse(forB, {
        serverKeys: serverKey,
        request: a,
        clientKid: "gadv-api-1",
        cb,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      reason: "response_wrong_request",
    });
  });

  it("refuses another connection, a stale clock, an unknown server key and a forged server", async () => {
    const built = await request();
    const jws = await buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued,
      now: NOW,
    });
    const ctx = { serverKeys: serverKey, request: built, clientKid: "gadv-api-1", cb, now: NOW };
    expect(verifyResponse(jws, { ...ctx, cb: new Uint8Array(32) })).toEqual({
      ok: false,
      reason: "response_wrong_channel",
    });
    expect(verifyResponse(jws, { ...ctx, now: NOW + 120 })).toEqual({
      ok: false,
      reason: "response_stale",
    });
    expect(verifyResponse(jws, { ...ctx, serverKeys: () => undefined })).toEqual({
      ok: false,
      reason: "response_unknown_key",
    });
    const rogue = localSigner("gmint-resp-1", generateKeyPairSync("ed25519").privateKey);
    const forged = await buildResponse({
      signer: rogue,
      request: verified(built),
      status: "issued",
      issued,
      now: NOW,
    });
    expect(verifyResponse(forged, ctx)).toEqual({ ok: false, reason: "response_bad_signature" });
  });

  it("refuses a seal bound to another client kid", async () => {
    const built = await request();
    const jws = await buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued,
      now: NOW,
    });
    expect(
      verifyResponse(jws, {
        serverKeys: serverKey,
        request: built,
        clientKid: "someone-else",
        cb,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      reason: "response_seal_failed",
    });
  });

  it("refuses a credential wider than what was asked", async () => {
    const built = await request({
      req: { ...mint, scope: { ...mint.scope, repository_ids: [111] } },
    });
    const wider = { ...issued, scope: { ...issued.scope, repository_ids: [111, 222] } };
    const jws = await buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued: wider,
      now: NOW,
    });
    expect(
      verifyResponse(jws, {
        serverKeys: serverKey,
        request: built,
        clientKid: "gadv-api-1",
        cb,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      reason: "response_scope_exceeded",
    });
  });

  it("rejects every single-character mutation of a valid response", async () => {
    const built = await request();
    const jws = await buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued,
      now: NOW,
    });
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    fc.assert(
      fc.property(fc.nat(jws.length - 1), fc.nat(alphabet.length - 1), (i, c) => {
        const ch = alphabet[c]!;
        fc.pre(jws[i] !== ch);
        const mutated = jws.slice(0, i) + ch + jws.slice(i + 1);
        return !verifyResponse(mutated, {
          serverKeys: serverKey,
          request: built,
          clientKid: "gadv-api-1",
          cb,
          now: NOW,
        }).ok;
      }),
      { numRuns: 400 },
    );
  });
});

describe("scopeWithin", () => {
  const ceiling = {
    installation_id: 1,
    repository_ids: [1, 2, 3],
    permissions: { contents: "write" as const, issues: "read" as const },
  };
  it("allows subsets and lower levels only", () => {
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [2], permissions: { contents: "read" } },
        ceiling,
      ),
    ).toBe(true);
    expect(
      scopeWithin(
        { installation_id: 2, repository_ids: [2], permissions: { contents: "read" } },
        ceiling,
      ),
    ).toBe(false);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [4], permissions: { contents: "read" } },
        ceiling,
      ),
    ).toBe(false);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [1], permissions: { issues: "write" } },
        ceiling,
      ),
    ).toBe(false);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [1], permissions: { administration: "read" } },
        ceiling,
      ),
    ).toBe(false);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [1], permissions: JSON.parse('{"toString":"read"}') },
        ceiling,
      ),
    ).toBe(false);
  });
});
