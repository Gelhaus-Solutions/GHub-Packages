/**
 * Certificate renewal (SPEC section 7): a client or node asks for a fresh certificate for the TLS
 * key it is connected with, before the one it holds expires.
 *
 * Request: a compact JWS (`typ` gmint-renew+jws) signed with the caller's request-signing key,
 * bound to the connection (`cb`) like a mint, carrying a CSR made with the TLS key. The CSR proves
 * possession of that key and names the caller as its only URI. The server issues only for the key
 * of the connection the request arrived on, which must be one the caller's policy entry pins.
 *
 * Response: a compact JWS (`typ` gmint-renew-res+jws) signed with GMint's response key, bound to
 * the request and the connection, carrying the new chain in the clear (certificates are public).
 * The caller checks that the leaf is for its own key and chains to the GMint root it pins.
 */

import { X509Certificate, type KeyObject } from "node:crypto";
import { randomBytes } from "node:crypto";
import { isCode, type Code } from "./codes";
import { buildCsr, MAX_CSR_BYTES, parseCsr, type ParsedCsr } from "./csr";
import {
  b64uDecode,
  b64uEncode,
  constantTimeEqual,
  sha256,
  utf8Decode,
  utf8Encode,
} from "./encoding";
import { hasExactKeys, isObject, parseStrictJson } from "./json";
import { signCompact, verifyCompact, type Ed25519Signer } from "./jws";
import {
  AUD,
  IAT_WINDOW_SECONDS,
  ISS,
  PROTOCOL_VERSION,
  bytesField,
  isPosInt,
  nowSeconds,
  type RequestKey,
  type Verdict,
} from "./messages";

export const RENEW_TYP = "gmint-renew+jws";
export const RENEW_RESPONSE_TYP = "gmint-renew-res+jws";
/** The path both the client and the node listener answer renewals on. */
export const RENEW_PATH = "/v1/cert/renew";
/** At most this many certificates in an answer (leaf first), each at most this many DER bytes. */
export const MAX_CHAIN = 4;
export const MAX_CERT_BYTES = 2048;

const NODE_ID = /^node:\/\/[a-z0-9][a-z0-9-]{0,62}$/;

export interface RenewPayload {
  v: 1;
  /** A client id (`gmint://...`) or a node id (`node://...`). */
  iss: string;
  aud: string;
  htm: "POST";
  htu: string;
  iat: number;
  jti: string;
  cb: string;
  /** b64url DER PKCS #10 request made with the TLS key. */
  csr: string;
}

export interface RenewResponsePayload {
  v: 1;
  req_hash: string;
  cb: string;
  iat: number;
  status: "issued" | "refused";
  code?: Code;
  /** b64url DER certificates, leaf first. */
  chain?: string[];
}

function parseRenewPayload(bytes: Uint8Array): { payload: RenewPayload; csr: ParsedCsr } | null {
  const text = utf8Decode(bytes);
  const v = text == null ? undefined : parseStrictJson(text);
  if (
    !isObject(v) ||
    !hasExactKeys(v, ["v", "iss", "aud", "htm", "htu", "iat", "jti", "cb", "csr"])
  )
    return null;
  if (v.v !== PROTOCOL_VERSION) return null;
  if (typeof v.iss !== "string" || !(ISS.test(v.iss) || NODE_ID.test(v.iss))) return null;
  if (typeof v.aud !== "string" || !AUD.test(v.aud)) return null;
  if (v.htm !== "POST") return null;
  if (typeof v.htu !== "string" || v.htu.length > 256 || !v.htu.startsWith("https://")) return null;
  if (!isPosInt(v.iat) || !bytesField(v.jti, 16) || !bytesField(v.cb, 32)) return null;
  const der = typeof v.csr === "string" ? b64uDecode(v.csr) : null;
  const csr = der && der.length <= MAX_CSR_BYTES ? parseCsr(der) : null;
  if (!csr) return null;
  return {
    payload: {
      v: 1,
      iss: v.iss,
      aud: v.aud,
      htm: "POST",
      htu: v.htu,
      iat: v.iat,
      jti: v.jti as string,
      cb: v.cb as string,
      csr: v.csr as string,
    },
    csr,
  };
}

function parseChain(v: unknown): Uint8Array[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_CHAIN) return null;
  const out: Uint8Array[] = [];
  for (const c of v) {
    const der = typeof c === "string" ? b64uDecode(c) : null;
    if (!der || der.length < 64 || der.length > MAX_CERT_BYTES) return null;
    out.push(der);
  }
  return out;
}

function parseRenewResponsePayload(bytes: Uint8Array): RenewResponsePayload | null {
  const text = utf8Decode(bytes);
  const v = text == null ? undefined : parseStrictJson(text);
  if (!isObject(v) || !hasExactKeys(v, ["v", "req_hash", "cb", "iat", "status"], ["code", "chain"]))
    return null;
  if (
    v.v !== PROTOCOL_VERSION ||
    !bytesField(v.req_hash, 32) ||
    !bytesField(v.cb, 32) ||
    !isPosInt(v.iat)
  )
    return null;
  const out: RenewResponsePayload = {
    v: 1,
    req_hash: v.req_hash as string,
    cb: v.cb as string,
    iat: v.iat,
    status: "refused",
  };
  if (v.status === "issued") {
    if ("code" in v || !parseChain(v.chain)) return null;
    return { ...out, status: "issued", chain: v.chain as string[] };
  }
  if (v.status === "refused") {
    if ("chain" in v || !isCode(v.code) || v.code === "approval_required") return null;
    return { ...out, code: v.code };
  }
  return null;
}

// ---------------------------------------------------------------- request

export interface BuildRenewRequestOptions {
  signer: Ed25519Signer;
  iss: string;
  aud: string;
  htu: string;
  /** The tls-exporter value of the connection the request will be sent on. */
  cb: Uint8Array;
  /** The TLS private key the new certificate is for (the one this connection uses). */
  tlsKey: KeyObject;
  now?: number;
}

export interface BuiltRenewRequest {
  jws: string;
  payload: RenewPayload;
  /** The DER SubjectPublicKeyInfo the certificate must be for. */
  spki: Uint8Array;
}

export async function buildRenewRequest(
  opts: BuildRenewRequestOptions,
): Promise<BuiltRenewRequest> {
  if (opts.cb.length !== 32) throw new TypeError("cb must be the 32-byte tls-exporter value");
  const der = buildCsr(opts.tlsKey, opts.iss);
  const payload: RenewPayload = {
    v: 1,
    iss: opts.iss,
    aud: opts.aud,
    htm: "POST",
    htu: opts.htu,
    iat: nowSeconds(opts.now),
    jti: b64uEncode(new Uint8Array(randomBytes(16))),
    cb: b64uEncode(opts.cb),
    csr: b64uEncode(der),
  };
  const bytes = utf8Encode(JSON.stringify(payload));
  const parsed = parseRenewPayload(bytes);
  if (!parsed) throw new TypeError("renewal request does not satisfy the protocol rules");
  const jws = await signCompact(RENEW_TYP, bytes, opts.signer);
  return { jws, payload, spki: parsed.csr.spki };
}

export interface VerifyRenewContext {
  resolveKey: (kid: string) => RequestKey | undefined;
  aud: string;
  htu: string;
  /** The tls-exporter value the edge measured on the connection the request arrived on. */
  cb: Uint8Array;
  now?: number;
}

export interface VerifiedRenewRequest {
  payload: RenewPayload;
  kid: string;
  reqHash: Uint8Array;
  /** The CSR, its self-signature checked; its only URI name is `iss`. */
  csr: ParsedCsr;
  /** The CSR's DER bytes, for the issuer. */
  csrDer: Uint8Array;
}

/**
 * The protocol half of the server's checks, in SPEC order: header, signature, strict payload with
 * a CSR whose signature verifies, issuer (the key's owner, and the CSR's only URI), audience and
 * target, time, channel. Replay, the pin, source, lockdown and issuance are the server's.
 */
export function verifyRenewRequest(
  jws: string,
  ctx: VerifyRenewContext,
): Verdict<VerifiedRenewRequest> {
  let owner: string | undefined;
  const verified = verifyCompact(jws, RENEW_TYP, (kid) => {
    const k = ctx.resolveKey(kid);
    owner = k?.owner;
    return k?.key;
  });
  if (!verified.ok) {
    if (verified.error === "jws_unknown_key") return { ok: false, reason: "request_unknown_key" };
    if (verified.error === "jws_bad_signature")
      return { ok: false, reason: "request_bad_signature" };
    return { ok: false, reason: "request_malformed" };
  }
  const parsed = parseRenewPayload(verified.value.payload);
  if (!parsed) return { ok: false, reason: "request_malformed" };
  const { payload, csr } = parsed;
  if (payload.iss !== owner) return { ok: false, reason: "request_wrong_issuer" };
  if (csr.uris.length !== 1 || csr.uris[0] !== payload.iss)
    return { ok: false, reason: "request_wrong_issuer" };
  if (payload.aud !== ctx.aud) return { ok: false, reason: "request_wrong_audience" };
  if (payload.htu !== ctx.htu) return { ok: false, reason: "request_wrong_target" };
  if (Math.abs(payload.iat - nowSeconds(ctx.now)) > IAT_WINDOW_SECONDS)
    return { ok: false, reason: "request_stale" };
  if (!constantTimeEqual(b64uDecode(payload.cb)!, ctx.cb))
    return { ok: false, reason: "request_wrong_channel" };
  return {
    ok: true,
    value: {
      payload,
      kid: verified.value.header.kid,
      reqHash: sha256(utf8Encode(jws)),
      csr,
      csrDer: b64uDecode(payload.csr)!,
    },
  };
}

// ---------------------------------------------------------------- response

export type BuildRenewResponseOptions = {
  signer: Ed25519Signer;
  request: VerifiedRenewRequest;
  now?: number;
} & (
  | { status: "issued"; chain: Uint8Array[] }
  | { status: "refused"; code: Exclude<Code, "approval_required"> }
);

export async function buildRenewResponse(opts: BuildRenewResponseOptions): Promise<string> {
  const payload: RenewResponsePayload = {
    v: 1,
    req_hash: b64uEncode(opts.request.reqHash),
    cb: opts.request.payload.cb,
    iat: nowSeconds(opts.now),
    status: opts.status,
  };
  if (opts.status === "issued") payload.chain = opts.chain.map(b64uEncode);
  else payload.code = opts.code;
  const bytes = utf8Encode(JSON.stringify(payload));
  if (!parseRenewResponsePayload(bytes))
    throw new TypeError("renewal response does not satisfy the protocol rules");
  return signCompact(RENEW_RESPONSE_TYP, bytes, opts.signer);
}

export interface VerifyRenewResponseContext {
  serverKeys: (kid: string) => KeyObject | undefined;
  request: BuiltRenewRequest;
  cb: Uint8Array;
  /** The GMint root (and any other anchor) the caller pins. */
  anchors: readonly X509Certificate[];
  now?: number;
}

export type VerifiedRenewResponse =
  | { status: "issued"; chain: X509Certificate[]; notAfter: number }
  | { status: "refused"; code: Code };

/** Each certificate is signed by the next, the last by a pinned anchor, and all are valid now. */
function chainTrusted(chain: X509Certificate[], anchors: readonly X509Certificate[], now: number) {
  const valid = (c: X509Certificate) =>
    Date.parse(c.validFrom) / 1000 <= now + IAT_WINDOW_SECONDS &&
    Date.parse(c.validTo) / 1000 > now;
  if (!chain.every(valid) || chain[0]!.ca) return false;
  for (let i = 0; i + 1 < chain.length; i++) {
    const [c, issuer] = [chain[i]!, chain[i + 1]!];
    if (!issuer.ca || !c.checkIssued(issuer) || !c.verify(issuer.publicKey)) return false;
  }
  const last = chain[chain.length - 1]!;
  return anchors.some(
    (a) =>
      a.fingerprint256 === last.fingerprint256 ||
      (valid(a) && a.ca && last.checkIssued(a) && last.verify(a.publicKey)),
  );
}

/** The caller's checks, in SPEC order: signature, request, channel, time, then the chain. */
export function verifyRenewResponse(
  jws: string,
  ctx: VerifyRenewResponseContext,
): Verdict<VerifiedRenewResponse> {
  const verified = verifyCompact(jws, RENEW_RESPONSE_TYP, ctx.serverKeys);
  if (!verified.ok) {
    if (verified.error === "jws_unknown_key") return { ok: false, reason: "response_unknown_key" };
    if (verified.error === "jws_bad_signature")
      return { ok: false, reason: "response_bad_signature" };
    return { ok: false, reason: "response_malformed" };
  }
  const payload = parseRenewResponsePayload(verified.value.payload);
  if (!payload) return { ok: false, reason: "response_malformed" };
  if (!constantTimeEqual(b64uDecode(payload.req_hash)!, sha256(utf8Encode(ctx.request.jws))))
    return { ok: false, reason: "response_wrong_request" };
  if (!constantTimeEqual(b64uDecode(payload.cb)!, ctx.cb))
    return { ok: false, reason: "response_wrong_channel" };
  const now = nowSeconds(ctx.now);
  if (Math.abs(payload.iat - now) > IAT_WINDOW_SECONDS)
    return { ok: false, reason: "response_stale" };
  if (payload.status === "refused")
    return { ok: true, value: { status: "refused", code: payload.code! } };

  let chain: X509Certificate[];
  try {
    chain = payload.chain!.map((c) => new X509Certificate(Buffer.from(b64uDecode(c)!)));
  } catch {
    return { ok: false, reason: "response_malformed" };
  }
  const leafKey = new Uint8Array(chain[0]!.publicKey.export({ type: "spki", format: "der" }));
  if (!constantTimeEqual(sha256(leafKey), sha256(ctx.request.spki)))
    return { ok: false, reason: "response_wrong_key" };
  if (!chainTrusted(chain, ctx.anchors, now))
    return { ok: false, reason: "response_untrusted_certificate" };
  return {
    ok: true,
    value: { status: "issued", chain, notAfter: Math.floor(Date.parse(chain[0]!.validTo) / 1000) },
  };
}

/** PEM for a chain, leaf first: what a caller writes to its certificate file. */
export function chainPem(chain: readonly X509Certificate[]): string {
  return chain.map((c) => c.toString()).join("");
}
