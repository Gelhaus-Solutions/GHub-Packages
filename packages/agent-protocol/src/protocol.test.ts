import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { signAssertion, signKeyProof, testAgent } from "./testing";
import {
  AssertionRefused,
  bodyHash,
  claimsMatch,
  parseAssertion,
  parseKeyProof,
  signatureHolds,
  thumbprint,
  weakKey,
  type AgentProtocol,
} from "./index";

/** GOpenCDR's mirror protocol, which the vectors were written for. */
const MIRROR: AgentProtocol = {
  scheme: "GOCDR-Mirror",
  requestType: "gocdr-mirror+jwt",
  keyProofType: "gocdr-mirror-key+jwt",
  paths: /^\/api\/v1\/mirrors(?:\/[a-z0-9-]{1,64}){1,4}$/,
  agentId: /^[a-z][0-9a-z]{1,31}$/,
};

/** Another product's agents, to show nothing of one protocol is taken by the other. */
const JOIN: AgentProtocol = {
  scheme: "GOCNR-Agent",
  requestType: "gocnr-agent+jwt",
  keyProofType: "gocnr-agent-key+jwt",
  paths: /^\/api\/v1\/routers(?:\/[a-z0-9-]{1,64}){1,4}$/,
  agentId: /^[a-z][0-9a-z]{1,31}$/,
};

const AUDIENCE = "http://localhost:3500";
const PATH = "/api/v1/mirrors/self/bundle";
const agent = testAgent();
const now = new Date("2026-09-30T18:00:00Z");
const at = Math.floor(now.getTime() / 1000);
const facts = {
  audience: AUDIENCE,
  method: "GET",
  path: PATH,
  query: "",
  contentEncoding: undefined,
  body: undefined,
  now,
};
const sign = (options: Partial<Parameters<typeof signAssertion>[2]> = {}) =>
  signAssertion(MIRROR, agent, {
    audience: AUDIENCE,
    method: "GET",
    path: PATH,
    iss: "cm1",
    now: at,
    ...options,
  });

const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof AssertionRefused) return error.message;
    throw error;
  }
  throw new Error("accepted");
};

describe("a request assertion", () => {
  it("parses, verifies and matches its request", () => {
    const parsed = parseAssertion(MIRROR, sign());
    expect(parsed.key).toEqual({ kind: "kid", keyId: agent.keyId });
    expect(parsed.claims).toMatchObject({ iss: "cm1", aud: AUDIENCE, method: "GET", path: PATH });
    expect(signatureHolds(parsed, Buffer.from(agent.x, "base64url"))).toBe(true);
    claimsMatch(parsed.claims, facts);
  });

  it("names a new key in jwk, whose id is its RFC 7638 thumbprint", () => {
    const parsed = parseAssertion(
      MIRROR,
      sign({ method: "POST", path: "/api/v1/mirrors/enrolments", iss: undefined, jwk: true }),
    );
    expect(parsed.key.kind).toBe("jwk");
    expect(parsed.key.keyId).toBe(agent.keyId);
    expect(thumbprint(Buffer.from(agent.x, "base64url"))).toBe(agent.keyId);
  });

  it("does not verify under another key", () => {
    const parsed = parseAssertion(
      MIRROR,
      sign({ signer: generateKeyPairSync("ed25519").privateKey }),
    );
    expect(signatureHolds(parsed, Buffer.from(agent.x, "base64url"))).toBe(false);
  });

  it("is refused by another product's protocol, and takes that product's own", () => {
    expect(refusal(() => parseAssertion(JOIN, sign()))).toMatch(/scheme is not GOCNR-Agent/);
    const swapped = sign().replace(/^GOCDR-Mirror/, "GOCNR-Agent");
    expect(refusal(() => parseAssertion(JOIN, swapped))).toMatch(/typ is not gocnr-agent\+jwt/);
    const own = signAssertion(JOIN, agent, {
      audience: AUDIENCE,
      method: "GET",
      path: "/api/v1/routers/self/bundle",
      iss: "rt1",
      now: at,
    });
    expect(parseAssertion(JOIN, own).claims.path).toBe("/api/v1/routers/self/bundle");
    expect(refusal(() => parseAssertion(MIRROR, own))).toMatch(/scheme/);
  });

  it.each([
    ["no header", undefined, /no Authorization/],
    ["another scheme", "Bearer abc", /scheme/],
    ["two parts", "GOCDR-Mirror a.b", /compact JWS/],
  ])("refuses %s", (_what, header, reason) => {
    expect(refusal(() => parseAssertion(MIRROR, header))).toMatch(reason);
  });

  it.each([
    ["alg none", { header: { alg: "none" } }, /alg/],
    ["alg HS256", { header: { alg: "HS256" } }, /alg/],
    ["another typ", { header: { typ: "JWT" } }, /typ/],
    ["crit", { header: { crit: ["exp"] } }, /carries crit/],
    [
      "both kid and jwk",
      { header: { jwk: { kty: "OKP", crv: "Ed25519", x: agent.x } } },
      /exactly one/,
    ],
    ["a kid that is no key id", { header: { kid: "short" } }, /kid is not a key id/],
    ["another audience", { claims: { aud: "gocdr-api" } }, /aud/],
    ["an unknown claim", { claims: { admin: true } }, /claims do not hold: admin is not a claim/],
    ["a missing claim", { claims: { method: undefined } }, /method is missing/],
    ["a path outside the agent api", { claims: { path: "/api/v1/root/tlds" } }, /path/],
    ["a short jti", { claims: { jti: "abc" } }, /jti/],
    ["a fractional iat", { claims: { iat: at + 0.5 } }, /iat/],
    ["another method", { claims: { method: "PUT" } }, /method/],
    ["an issuer that is no agent id", { claims: { iss: "Mirror 1" } }, /iss/],
  ])("refuses %s", (_what, overrides, reason) => {
    expect(refusal(() => parseAssertion(MIRROR, sign(overrides)))).toMatch(reason);
  });

  it("refuses a jwk that is not a bare Ed25519 key", () => {
    for (const jwk of [
      { kty: "OKP", crv: "X25519", x: agent.x },
      { kty: "OKP", crv: "Ed25519", x: agent.x, d: agent.x },
      { kty: "OKP", crv: "Ed25519", x: agent.x.slice(2) },
    ]) {
      const header = sign({
        method: "POST",
        path: "/api/v1/mirrors/enrolments",
        iss: undefined,
        header: { kid: undefined, jwk },
      });
      expect(() => parseAssertion(MIRROR, header)).toThrow(AssertionRefused);
    }
  });

  it("refuses base64url with padding or another spelling", () => {
    expect(refusal(() => parseAssertion(MIRROR, `${sign()}=`))).toMatch(/base64url/);
  });

  it.each([
    ["an expired assertion", { now: at - 61 }, /expired/],
    ["one from the future", { now: at + 31 }, /future/],
    ["one held too long", { claims: { exp: at + 61 } }, /at most 60/],
    ["another method", { method: "POST" }, /method/],
    ["another path", { path: "/api/v1/mirrors/self/reports" }, /path/],
    ["a body the request did not carry", { body: "{}" }, /bodySha256/],
  ])("refuses %s against the request", (_what, overrides, reason) => {
    const { claims } = parseAssertion(MIRROR, sign(overrides));
    expect(refusal(() => claimsMatch(claims, facts))).toMatch(reason);
  });

  it("refuses an assertion for another api, a query string and a compressed body", () => {
    const { claims } = parseAssertion(MIRROR, sign());
    expect(
      refusal(() => claimsMatch(claims, { ...facts, audience: "https://cdr.gplatform.org" })),
    ).toMatch(/aud/);
    expect(refusal(() => claimsMatch(claims, { ...facts, query: "?wait=30" }))).toMatch(/query/);
    expect(refusal(() => claimsMatch(claims, { ...facts, contentEncoding: "gzip" }))).toMatch(
      /compressed/,
    );
    claimsMatch(claims, { ...facts, contentEncoding: "identity" });
  });

  it("refuses small-order and non-canonical keys, which anyone could sign for", () => {
    const hex = (text: string) => Buffer.from(text, "hex");
    for (const weak of [
      "0100000000000000000000000000000000000000000000000000000000000000",
      "0100000000000000000000000000000000000000000000000000000000000080",
      "0000000000000000000000000000000000000000000000000000000000000000",
      "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
      "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
      "f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
    ]) {
      expect(weakKey(hex(weak)), weak).toBe(true);
      const header = sign({
        method: "POST",
        path: "/api/v1/mirrors/enrolments",
        iss: undefined,
        header: {
          kid: undefined,
          jwk: { kty: "OKP", crv: "Ed25519", x: hex(weak).toString("base64url") },
        },
      });
      expect(refusal(() => parseAssertion(MIRROR, header))).toMatch(/small-order or non-canonical/);
    }
    expect(weakKey(Buffer.from(agent.x, "base64url"))).toBe(false);
  });

  it("accepts GOpenCDR's mirror vectors, which Go signs byte for byte", () => {
    const file = JSON.parse(
      readFileSync(resolve(__dirname, "vectors.gopencdr-mirror-request.json"), "utf8"),
    ) as {
      publicKey: string;
      keyId: string;
      vectors: {
        authorization: string;
        request: { method: string; path: string; body: string };
        claims: string;
      }[];
    };
    expect(file.vectors.length).toBeGreaterThan(0);
    for (const vector of file.vectors) {
      const parsed = parseAssertion(MIRROR, vector.authorization);
      expect(parsed.key.keyId).toBe(file.keyId);
      expect(signatureHolds(parsed, Buffer.from(file.publicKey, "base64url"))).toBe(true);
      const { iat } = JSON.parse(vector.claims) as { iat: number };
      claimsMatch(parsed.claims, {
        audience: "https://cdr.gplatform.org",
        method: vector.request.method,
        path: vector.request.path,
        query: "",
        contentEncoding: undefined,
        body: vector.request.body === "" ? undefined : Buffer.from(vector.request.body),
        now: new Date(iat * 1000),
      });
    }
  });

  it("hashes the body byte for byte, and nothing as the empty string", () => {
    expect(bodyHash(undefined)).toBe(bodyHash(Buffer.alloc(0)));
    expect(bodyHash(Buffer.from('{"a":1}'))).not.toBe(bodyHash(Buffer.from('{"a": 1}')));
  });
});

describe("a key rotation's proof", () => {
  const file = JSON.parse(
    readFileSync(resolve(__dirname, "vectors.gopencdr-mirror-key-proof.json"), "utf8"),
  ) as { publicKey: string; keyId: string; vectors: { jws: string; claims: string }[] };
  const CDR = "https://cdr.gplatform.org";

  it("accepts GOpenCDR's mirror vector, which Go signs byte for byte", () => {
    expect(file.vectors.length).toBeGreaterThan(0);
    for (const vector of file.vectors) {
      const claims = JSON.parse(vector.claims) as { iat: number };
      const proof = parseKeyProof(MIRROR, vector.jws, CDR, new Date(claims.iat * 1000));
      expect(proof.keyId).toBe(file.keyId);
      expect(proof.publicKey.toString("base64url")).toBe(file.publicKey);
      expect(proof.claims).toEqual(claims);
    }
  });

  it("refuses the vector for another api, once it has expired, with its signature changed, or under another protocol", () => {
    for (const vector of file.vectors) {
      const { iat, exp } = JSON.parse(vector.claims) as { iat: number; exp: number };
      const when = new Date(iat * 1000);
      expect(refusal(() => parseKeyProof(MIRROR, vector.jws, AUDIENCE, when))).toMatch(
        /aud is not this api/,
      );
      expect(refusal(() => parseKeyProof(MIRROR, vector.jws, CDR, new Date(exp * 1000)))).toMatch(
        /not current/,
      );
      const [header = "", payload = "", signature = ""] = vector.jws.split(".");
      const flipped = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
      expect(
        refusal(() => parseKeyProof(MIRROR, `${header}.${payload}.${flipped}`, CDR, when)),
      ).toMatch(/does not verify/);
      expect(refusal(() => parseKeyProof(JOIN, vector.jws, CDR, when))).toMatch(
        /typ is not gocnr-agent-key\+jwt/,
      );
    }
  });

  it("takes a proof the test agent signs, and refuses claims that do not hold", () => {
    const next = testAgent();
    const proof = parseKeyProof(
      MIRROR,
      signKeyProof(MIRROR, next, "cm1", AUDIENCE, at),
      AUDIENCE,
      now,
    );
    expect(proof.keyId).toBe(next.keyId);
    expect(proof.claims.iss).toBe("cm1");
    expect(
      refusal(() =>
        parseKeyProof(MIRROR, signKeyProof(MIRROR, next, "Mirror 1", AUDIENCE, at), AUDIENCE, now),
      ),
    ).toMatch(/proof's claims do not hold: iss/);
  });
});
