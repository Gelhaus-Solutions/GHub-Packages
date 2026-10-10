/**
 * Message vectors (E1-08) for anyone implementing GMint in another stack: a mint request, its
 * issued response (with the seal's plaintext), a refusal, and a certificate renewal with its
 * answer, all from fixed keys, so every byte reproduces. `generate()` below is the generator. It
 * writes each message from SPEC.md rather than through the builders (its own seal `info` and
 * `aad`, its own payloads), and the tests check that the file is exactly what it produces and that
 * the package's verifiers accept every message and recover the documented values.
 *
 * Regenerate after a deliberate protocol change: GMINT_WRITE_VECTORS=1 vitest run src/vectors.test.ts
 */

import { X509Certificate, createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsr } from "./csr";
import { b64uEncode, concat, lengthPrefixed, sha256, utf8Encode } from "./encoding";
import { seal, x25519PrivateFromRaw } from "./hpke";
import { localSigner, rawPublicKey, signCompact } from "./jws";
import {
  REQUEST_TYP,
  RESPONSE_TYP,
  SEAL_INFO_PREFIX,
  verifyRequest,
  verifyResponse,
} from "./messages";
import { RENEW_RESPONSE_TYP, RENEW_TYP, verifyRenewRequest, verifyRenewResponse } from "./renew";

const FILE = join(__dirname, "vectors.messages.json");
const RENEW = JSON.parse(readFileSync(join(__dirname, "vectors.renew.json"), "utf8")) as Record<
  string,
  string
>;

/** Every secret in the vectors is SHA-256 of a public label: test keys, nothing else. */
const seed = (label: string) =>
  new Uint8Array(createHash("sha256").update(`gmint-vector:${label}`).digest());
const ed25519 = (raw: Uint8Array) =>
  createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), raw]),
    format: "der",
    type: "pkcs8",
  });
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const x25519Public = (raw: Uint8Array) =>
  createPublicKey(x25519PrivateFromRaw(raw)).export({ format: "jwk" }).x as string;

const IAT = 1_800_000_000; // inside the renewal certificates' validity
const AUD = "gmint:prod-1";
const CLIENT = "gmint://gadvisory/api";
const CLIENT_KID = "gadv-api-2026-10";
const SERVER_KID = "gmint-resp-1";
const ORIGIN = "https://mint.example.org:8443";

async function generate() {
  const clientSeed = seed("client signing key");
  const serverSeed = seed("server response key");
  const encSeed = seed("client response encryption key");
  const ephSeed = seed("server seal ephemeral key");
  const cb = seed("tls-exporter");
  const client = localSigner(CLIENT_KID, ed25519(clientSeed));
  const server = localSigner(SERVER_KID, ed25519(serverSeed));
  const json = (v: unknown) => utf8Encode(JSON.stringify(v));

  // Mint request (SPEC 3).
  const request = {
    v: 1,
    iss: CLIENT,
    aud: AUD,
    htm: "POST",
    htu: `${ORIGIN}/v1/token`,
    iat: IAT,
    jti: b64uEncode(seed("jti").subarray(0, 16)),
    seq: 4711,
    cb: b64uEncode(cb),
    enc: x25519Public(encSeed),
    req: {
      provider: "github",
      grant: "gadvisory-git-sync",
      scope: {
        installation_id: 12345678,
        repository_ids: [111, 222],
        permissions: { contents: "read", metadata: "read" },
      },
      tenant: "scope-42",
      purpose: "git-sync scope 42",
    },
  };
  const requestJws = await signCompact(REQUEST_TYP, json(request), client);
  const reqHash = sha256(utf8Encode(requestJws));

  // Issued response (SPEC 5, 5.1).
  const credential = "ghs_vectorvectorvectorvectorvector0001";
  const plaintext = {
    credential,
    expires_at: "2027-01-15T09:00:00Z",
    scope: request.req.scope,
    hashed: b64uEncode(sha256(utf8Encode(credential))),
  };
  const info = concat(utf8Encode(SEAL_INFO_PREFIX), reqHash);
  const aad = concat(
    lengthPrefixed(utf8Encode(CLIENT_KID)),
    lengthPrefixed(utf8Encode(SERVER_KID)),
    reqHash,
  );
  const eph = x25519PrivateFromRaw(ephSeed);
  const sealed = seal(Buffer.from(x25519Public(encSeed), "base64url"), info, aad, json(plaintext), {
    ephemeral: { privateKey: eph, publicKey: createPublicKey(eph) },
  });
  const issued = {
    v: 1,
    req_hash: b64uEncode(reqHash),
    cb: b64uEncode(cb),
    iat: IAT + 1,
    status: "issued",
    seal: { enc: b64uEncode(sealed.enc), ct: b64uEncode(sealed.ct) },
  };
  const refused = {
    v: 1,
    req_hash: b64uEncode(reqHash),
    cb: b64uEncode(cb),
    iat: IAT + 1,
    status: "refused",
    code: "locked_down",
  };

  // Certificate renewal (SPEC 7), with the TLS key and chain of vectors.renew.json.
  const tlsKey = ed25519(Buffer.from(RENEW.leafKeySeed!, "hex"));
  const renew = {
    v: 1,
    iss: CLIENT,
    aud: AUD,
    htm: "POST",
    htu: `${ORIGIN}/v1/cert/renew`,
    iat: IAT,
    jti: b64uEncode(seed("renew jti").subarray(0, 16)),
    cb: b64uEncode(cb),
    csr: b64uEncode(buildCsr(tlsKey, CLIENT)),
  };
  const renewJws = await signCompact(RENEW_TYP, json(renew), client);
  const renewed = {
    v: 1,
    req_hash: b64uEncode(sha256(utf8Encode(renewJws))),
    cb: b64uEncode(cb),
    iat: IAT + 1,
    status: "issued",
    chain: [RENEW.leaf!, RENEW.intermediate!].map((pem) =>
      b64uEncode(new Uint8Array(new X509Certificate(pem).raw)),
    ),
  };

  return {
    _note:
      "GMint protocol vectors, generated by src/vectors.test.ts from fixed test keys (each secret is SHA-256 of a public label; never use them for anything else). Renewal certificates and the TLS key come from vectors.renew.json.",
    keys: {
      client_signing_seed: hex(clientSeed),
      client_signing_public: b64uEncode(rawPublicKey(createPublicKey(ed25519(clientSeed)))),
      server_response_seed: hex(serverSeed),
      server_response_public: b64uEncode(rawPublicKey(createPublicKey(ed25519(serverSeed)))),
      client_enc_private: hex(encSeed),
      server_ephemeral_private: hex(ephSeed),
      tls_exporter: hex(cb),
    },
    mint: {
      request_payload: JSON.stringify(request),
      request_jws: requestJws,
      seal_info: hex(info),
      seal_aad: hex(aad),
      seal_plaintext: JSON.stringify(plaintext),
      issued_payload: JSON.stringify(issued),
      issued_jws: await signCompact(RESPONSE_TYP, json(issued), server),
      refused_payload: JSON.stringify(refused),
      refused_jws: await signCompact(RESPONSE_TYP, json(refused), server),
    },
    renew: {
      request_payload: JSON.stringify(renew),
      request_jws: renewJws,
      issued_payload: JSON.stringify(renewed),
      issued_jws: await signCompact(RENEW_RESPONSE_TYP, json(renewed), server),
    },
  };
}

type Vectors = Awaited<ReturnType<typeof generate>>;

describe("protocol vectors", () => {
  it("reproduce byte for byte", async () => {
    const fresh = await generate();
    if (process.env.GMINT_WRITE_VECTORS === "1")
      writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(fresh);
  });

  // Read when a test runs, after the first test may have written the file.
  const load = () => {
    const V = JSON.parse(readFileSync(FILE, "utf8")) as Vectors;
    const pub = (b64: string) =>
      createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64 }, format: "jwk" });
    const clientPublic = pub(V.keys.client_signing_public);
    const serverPublic = pub(V.keys.server_response_public);
    return {
      V,
      cb: Buffer.from(V.keys.tls_exporter, "hex"),
      resolveKey: (kid: string) =>
        kid === CLIENT_KID ? { key: clientPublic, owner: CLIENT } : undefined,
      serverKeys: (kid: string) => (kid === SERVER_KID ? serverPublic : undefined),
    };
  };

  it("a server accepts the mint request, and the client opens the issued response", () => {
    const { V, cb, resolveKey, serverKeys } = load();
    const req = verifyRequest(V.mint.request_jws, {
      resolveKey,
      aud: AUD,
      htu: `${ORIGIN}/v1/token`,
      cb,
      now: IAT,
    });
    expect(req.ok && JSON.stringify(req.value.payload)).toBe(V.mint.request_payload);
    const request = {
      jws: V.mint.request_jws,
      encPrivate: x25519PrivateFromRaw(Buffer.from(V.keys.client_enc_private, "hex")),
      payload: JSON.parse(V.mint.request_payload) as never,
    };
    const issued = verifyResponse(V.mint.issued_jws, {
      serverKeys,
      request,
      clientKid: CLIENT_KID,
      cb,
      now: IAT,
    });
    expect(
      issued.ok && issued.value.status === "issued" && JSON.stringify(issued.value.issued),
    ).toBe(V.mint.seal_plaintext);
    expect(
      verifyResponse(V.mint.refused_jws, {
        serverKeys,
        request,
        clientKid: CLIENT_KID,
        cb,
        now: IAT,
      }),
    ).toEqual({
      ok: true,
      value: { status: "refused", code: "locked_down" },
    });
  });

  it("a server accepts the renewal, and the client accepts the chain for its key", () => {
    const { V, cb, resolveKey, serverKeys } = load();
    const req = verifyRenewRequest(V.renew.request_jws, {
      resolveKey,
      aud: AUD,
      htu: `${ORIGIN}/v1/cert/renew`,
      cb,
      now: IAT,
    });
    expect(req.ok && JSON.stringify(req.value.payload)).toBe(V.renew.request_payload);
    const res = verifyRenewResponse(V.renew.issued_jws, {
      serverKeys,
      request: {
        jws: V.renew.request_jws,
        payload: JSON.parse(V.renew.request_payload) as never,
        spki: req.ok ? req.value.csr.spki : new Uint8Array(),
      },
      cb,
      anchors: [new X509Certificate(RENEW.root!)],
      now: IAT,
    });
    expect(res.ok && res.value.status === "issued" && res.value.chain.length).toBe(2);
  });
});
