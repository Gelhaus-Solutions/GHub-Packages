import { generateKeyPairSync, randomBytes } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { b64uDecode, b64uEncode, sha256, utf8Encode } from "./encoding";
import { localSigner, signCompact } from "./jws";
import {
  POLL_PATH,
  POLL_TYP,
  REQUEST_TYP,
  buildPoll,
  buildPollResponse,
  buildRequest,
  buildResponse,
  publicCode,
  scopeWithin,
  verifyPoll,
  verifyRequest,
  verifyResponse,
  type BuiltPoll,
  type BuiltRequest,
  type MintRequest,
  type VerifiedPoll,
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

describe("repository names and org-scoped requests (D-71)", () => {
  const byName: MintRequest = {
    provider: "github",
    grant: "gadvisory-git-sync",
    scope: {
      installation_id: 12345678,
      repositories: ["web", "api", "web"],
      permissions: { contents: "read", metadata: "read" },
    },
  };
  const orgScoped: MintRequest = {
    provider: "github",
    grant: "gadvisory-org-read",
    scope: { installation_id: 12345678, permissions: { members: "read", metadata: "read" } },
  };
  const ctx = (built: BuiltRequest) => ({
    serverKeys: serverKey,
    request: built,
    clientKid: "gadv-api-1",
    cb,
    now: NOW,
  });
  const answer = async (built: BuiltRequest, scope: object) =>
    buildResponse({
      signer: serverSigner,
      request: verified(built),
      status: "issued",
      issued: { ...issued, scope: scope as typeof issued.scope },
      now: NOW,
    });

  it("sends names sorted and deduplicated, and gets the ids back aligned with them", async () => {
    const built = await request({ req: byName });
    expect(verified(built).payload.req.scope).toEqual({
      installation_id: 12345678,
      repositories: ["api", "web"],
      permissions: { contents: "read", metadata: "read" },
    });
    const granted = {
      installation_id: 12345678,
      repository_ids: [111, 222],
      repositories: ["web", "api"],
      permissions: { contents: "read", metadata: "read" },
    };
    const res = verifyResponse(await answer(built, granted), ctx(built));
    expect(res.ok && res.value.status === "issued" && res.value.issued.scope).toEqual(granted);
  });

  it("refuses a granted name that was not asked for, or names without their ids", async () => {
    const built = await request({ req: byName });
    const other = {
      installation_id: 12345678,
      repository_ids: [111, 333],
      repositories: ["web", "secrets"],
      permissions: { contents: "read" },
    };
    expect(verifyResponse(await answer(built, other), ctx(built))).toEqual({
      ok: false,
      reason: "response_scope_exceeded",
    });
    await expect(
      answer(built, {
        installation_id: 12345678,
        repositories: ["web"],
        permissions: { contents: "read" },
      }),
    ).rejects.toThrow(/does not satisfy/);
  });

  it("asks for an org-scoped token with no repositories, and refuses one that has some", async () => {
    const built = await request({ req: orgScoped });
    expect(verified(built).payload.req.scope).toEqual(orgScoped.scope);
    const ok = verifyResponse(await answer(built, orgScoped.scope), ctx(built));
    expect(ok.ok).toBe(true);
    const withRepos = { ...orgScoped.scope, repository_ids: [111] };
    expect(verifyResponse(await answer(built, withRepos), ctx(built))).toEqual({
      ok: false,
      reason: "response_scope_exceeded",
    });
  });

  async function signedPayload(payload: object): Promise<string> {
    return signCompact(REQUEST_TYP, utf8Encode(JSON.stringify(payload)), clientSigner);
  }

  it.each([
    ["ids and names together", { repository_ids: [1], repositories: ["web"] }],
    ["names out of order", { repositories: ["web", "api"] }],
    ["a name GitHub cannot have", { repositories: ["we b"] }],
    ["a dot name", { repositories: [".."] }],
    ["an empty name list", { repositories: [] }],
    [
      "501 names",
      { repositories: Array.from({ length: 501 }, (_, i) => `r${String(i).padStart(3, "0")}`) },
    ],
  ])("refuses a request with %s", async (_, repos) => {
    const good = (await request({ req: orgScoped })).payload;
    const bad = { ...good, req: { ...good.req, scope: { ...good.req.scope, ...repos } } };
    expect(
      verifyRequest(await signedPayload(bad), { resolveKey, aud: AUD, htu: HTU, cb, now: NOW }),
    ).toEqual({ ok: false, reason: "request_malformed" });
  });

  it("compares by name against a names ceiling and by id against an ids ceiling", () => {
    const names = {
      installation_id: 1,
      repositories: ["api", "web"],
      permissions: { contents: "read" as const },
    };
    const ids = {
      installation_id: 1,
      repository_ids: [1, 2],
      permissions: { contents: "read" as const },
    };
    const org = { installation_id: 1, permissions: { members: "read" as const } };
    const p = { contents: "read" as const };
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [7], repositories: ["web"], permissions: p },
        names,
      ),
    ).toBe(true);
    expect(scopeWithin({ installation_id: 1, repositories: ["web"], permissions: p }, names)).toBe(
      false,
    );
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [7], repositories: ["db"], permissions: p },
        names,
      ),
    ).toBe(false);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [2], repositories: ["x"], permissions: p },
        ids,
      ),
    ).toBe(true);
    expect(scopeWithin({ installation_id: 1, repositories: ["web"], permissions: p }, ids)).toBe(
      false,
    );
    expect(scopeWithin({ installation_id: 1, permissions: { members: "read" } }, org)).toBe(true);
    expect(
      scopeWithin(
        { installation_id: 1, repository_ids: [1], permissions: { members: "read" } },
        org,
      ),
    ).toBe(false);
  });
});

describe("poll (approvals)", () => {
  const POLL_HTU = `https://mint.example.org:8443${POLL_PATH}`;
  // Each poll travels on a connection of its own, so its exporter is not the request's.
  const pollCb = new Uint8Array(randomBytes(32));
  const requestId = b64uEncode(new Uint8Array(randomBytes(16)));
  const pollCtx = { resolveKey, aud: AUD, htu: POLL_HTU, cb: pollCb, now: NOW };

  function poll(
    built: BuiltRequest,
    over: Partial<Parameters<typeof buildPoll>[0]> = {},
  ): Promise<BuiltPoll> {
    return buildPoll({
      signer: clientSigner,
      iss: CLIENT,
      aud: AUD,
      htu: POLL_HTU,
      seq: 8,
      cb: pollCb,
      requestId,
      request: built,
      now: NOW,
      ...over,
    });
  }

  function verifiedPoll(jws: string): VerifiedPoll {
    const v = verifyPoll(jws, pollCtx);
    if (!v.ok) throw new Error(v.reason);
    return v.value;
  }

  const answerCtx = (built: BuiltRequest) => ({
    serverKeys: serverKey,
    request: built,
    clientKid: "gadv-api-1",
    cb: pollCb,
    now: NOW,
  });

  async function signedPoll(payload: object): Promise<string> {
    return signCompact(POLL_TYP, utf8Encode(JSON.stringify(payload)), clientSigner);
  }

  it("round-trips and names the request it waits for by hash", async () => {
    const built = await request();
    const p = await poll(built);
    const v = verifiedPoll(p.jws);
    expect(v.payload).toEqual(p.payload);
    expect(v.kid).toBe("gadv-api-1");
    expect(v.requestId).toBe(requestId);
    expect(v.reqHash).toEqual(verified(built).reqHash);
    expect(v.pollHash).toEqual(sha256(utf8Encode(p.jws)));
    expect(Object.keys(p.payload)).toEqual([
      "v",
      "iss",
      "aud",
      "htm",
      "htu",
      "iat",
      "jti",
      "seq",
      "cb",
      "request_id",
      "req_hash",
    ]);
  });

  it("is answered issued: sealed to the original enc, opened with the original request and the poll's cb", async () => {
    const built = await request();
    const jws = await buildPollResponse({
      signer: serverSigner,
      request: verified(built),
      cb: pollCb,
      status: "issued",
      issued,
      now: NOW,
    });
    const res = verifyResponse(jws, answerCtx(built));
    expect(res.ok && res.value.status === "issued" && res.value.issued.credential).toBe(
      issued.credential,
    );
    // Bound to the poll's connection, not to the one the request travelled on.
    expect(verifyResponse(jws, { ...answerCtx(built), cb })).toEqual({
      ok: false,
      reason: "response_wrong_channel",
    });
    // And only the key of the original request opens it.
    const other = await request();
    expect(verifyResponse(jws, answerCtx({ ...built, encPrivate: other.encPrivate }))).toEqual({
      ok: false,
      reason: "response_seal_failed",
    });
  });

  it("is answered from what the server stored: the payload as JSON, the kid and the b64url hash", async () => {
    const built = await request();
    const v = verified(built);
    const stored = {
      request: JSON.stringify(v.payload),
      kid: v.kid,
      req_hash: b64uEncode(v.reqHash),
    };
    const jws = await buildPollResponse({
      signer: serverSigner,
      request: {
        payload: JSON.parse(stored.request),
        kid: stored.kid,
        reqHash: b64uDecode(stored.req_hash)!,
      },
      cb: pollCb,
      status: "issued",
      issued,
      now: NOW,
    });
    expect(verifyResponse(jws, answerCtx(built)).ok).toBe(true);
  });

  it.each([
    ["pending", { status: "pending", requestId }, { status: "pending", requestId }],
    ["denied", { status: "refused", code: "denied" }, { status: "refused", code: "denied" }],
    [
      "approval_expired",
      { status: "refused", code: "approval_expired" },
      { status: "refused", code: "approval_expired" },
    ],
    ["replay", { status: "refused", code: "replay" }, { status: "refused", code: "replay" }],
  ] as const)("is answered %s", async (_, outcome, value) => {
    const built = await request();
    const jws = await buildPollResponse({
      signer: serverSigner,
      request: verified(built),
      cb: pollCb,
      now: NOW,
      ...outcome,
    });
    expect(verifyResponse(jws, answerCtx(built))).toEqual({ ok: true, value });
  });

  it("is not a request, and a request is not a poll, whatever the typ says", async () => {
    const built = await request();
    const p = await poll(built);
    // Checked as a request with the poll's own target and connection, it still fails on its typ.
    const asRequestCtx = { resolveKey, aud: AUD, htu: POLL_HTU, cb: pollCb, now: NOW };
    expect(verifyRequest(p.jws, asRequestCtx)).toEqual({
      ok: false,
      reason: "request_malformed",
    });
    expect(verifyPoll(built.jws, { ...pollCtx, htu: HTU, cb })).toEqual({
      ok: false,
      reason: "poll_malformed",
    });
    // The same payloads signed under each other's typ still fail on their members.
    const asRequest = await signCompact(
      REQUEST_TYP,
      utf8Encode(JSON.stringify(p.payload)),
      clientSigner,
    );
    expect(verifyRequest(asRequest, asRequestCtx)).toEqual({
      ok: false,
      reason: "request_malformed",
    });
    expect(verifyPoll(await signedPoll(built.payload), { ...pollCtx, htu: HTU, cb })).toEqual({
      ok: false,
      reason: "poll_malformed",
    });
  });

  it.each([
    ["another connection", { cb: new Uint8Array(32) }, "poll_wrong_channel"],
    ["the request's connection", { cb }, "poll_wrong_channel"],
    ["another audience", { aud: "gmint:staging" }, "poll_wrong_audience"],
    ["the request's target", { htu: HTU }, "poll_wrong_target"],
    ["a stale clock", { now: NOW + 61 }, "poll_stale"],
    ["no known key", { resolveKey: () => undefined }, "poll_unknown_key"],
  ] as const)("refuses a poll checked against %s", async (_, ctx, reason) => {
    const p = await poll(await request());
    expect(verifyPoll(p.jws, { ...pollCtx, ...ctx })).toEqual({ ok: false, reason });
  });

  it("refuses an issuer that does not own the key", async () => {
    const p = await poll(await request());
    expect(
      verifyPoll(await signedPoll({ ...p.payload, iss: "gmint://other/client" }), pollCtx),
    ).toEqual({ ok: false, reason: "poll_wrong_issuer" });
  });

  it("refuses a req_hash changed after signing, and reports a re-signed one as the client's claim", async () => {
    const built = await request();
    const p = await poll(built);
    const [h, , sig] = p.jws.split(".");
    const tampered = {
      ...p.payload,
      req_hash: b64uEncode(sha256(utf8Encode("another request"))),
    };
    const forged = `${h}.${b64uEncode(utf8Encode(JSON.stringify(tampered)))}.${sig}`;
    expect(verifyPoll(forged, pollCtx)).toEqual({ ok: false, reason: "poll_bad_signature" });
    // Signed by the client itself, the protocol accepts it: the server compares reqHash with
    // the hash it stored with the approval, and this one is not it.
    const claimed = verifiedPoll(await signedPoll(tampered));
    expect(claimed.reqHash).not.toEqual(verified(built).reqHash);
  });

  it("refuses well-signed polls that break the rules", async () => {
    const good = (await poll(await request())).payload;
    const { request_id: _id, ...noId } = good;
    const variants: object[] = [
      { ...good, extra: 1 },
      { ...good, enc: b64uEncode(new Uint8Array(32)) },
      noId,
      { ...good, v: 2 },
      { ...good, htm: "GET" },
      { ...good, seq: 0 },
      { ...good, jti: b64uEncode(new Uint8Array(8)) },
      { ...good, request_id: b64uEncode(new Uint8Array(15)) },
      { ...good, request_id: b64uEncode(new Uint8Array(17)) },
      { ...good, request_id: `${good.request_id}=` },
      { ...good, req_hash: b64uEncode(new Uint8Array(31)) },
      { ...good, req_hash: 42 },
    ];
    for (const payload of variants) {
      expect(verifyPoll(await signedPoll(payload), pollCtx)).toEqual({
        ok: false,
        reason: "poll_malformed",
      });
    }
  });

  it("maps its reasons to policy-blind codes like a request's", () => {
    expect(publicCode("poll_malformed")).toBe("bad_request");
    expect(publicCode("poll_stale")).toBe("clock");
    for (const r of [
      "poll_unknown_key",
      "poll_bad_signature",
      "poll_wrong_issuer",
      "poll_wrong_audience",
      "poll_wrong_target",
      "poll_wrong_channel",
    ] as const)
      expect(publicCode(r)).toBe("denied");
  });

  it("refuses an answer bound to the poll instead of the request it names", async () => {
    const built = await request();
    const p = verifiedPoll((await poll(built)).jws);
    for (const outcome of [
      { status: "issued", issued },
      { status: "pending", requestId },
      { status: "refused", code: "denied" },
    ] as const) {
      const jws = await buildPollResponse({
        signer: serverSigner,
        request: { ...verified(built), reqHash: p.pollHash },
        cb: pollCb,
        now: NOW,
        ...outcome,
      });
      expect(verifyResponse(jws, answerCtx(built))).toEqual({
        ok: false,
        reason: "response_wrong_request",
      });
    }
  });

  it("refuses to build what the verifier would refuse", async () => {
    const built = await request();
    await expect(poll(built, { cb: new Uint8Array(31) })).rejects.toThrow();
    await expect(poll(built, { requestId: "short" })).rejects.toThrow();
    await expect(poll(built, { iss: "gmint://other/client" })).rejects.toThrow(/issuer/);
    await expect(poll(built, { aud: "gmint:staging" })).rejects.toThrow(/audience/);
    await expect(
      buildPollResponse({
        signer: serverSigner,
        request: verified(built),
        cb: new Uint8Array(31),
        status: "refused",
        code: "denied",
      }),
    ).rejects.toThrow();
    await expect(
      buildPollResponse({
        signer: serverSigner,
        request: { ...verified(built), payload: { ...verified(built).payload, enc: "x" } },
        cb: pollCb,
        status: "issued",
        issued,
      }),
    ).rejects.toThrow(/enc/);
  });

  it("rejects every single-character mutation of a valid poll", async () => {
    const p = await poll(await request());
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    fc.assert(
      fc.property(fc.nat(p.jws.length - 1), fc.nat(alphabet.length - 1), (i, c) => {
        const ch = alphabet[c]!;
        fc.pre(p.jws[i] !== ch);
        const mutated = p.jws.slice(0, i) + ch + p.jws.slice(i + 1);
        return !verifyPoll(mutated, pollCtx).ok;
      }),
      { numRuns: 400 },
    );
  });
});
