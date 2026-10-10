/**
 * The two messages of a mint: the client's signed request and GMint's signed, sealed response.
 * `SPEC.md` next to this package is the normative description; this file is its code.
 *
 * Request: a compact JWS (`typ` gmint-req+jws) signed with the client's Ed25519 key, carrying
 * the audience, method and URL, a timestamp, a random `jti`, a strictly increasing `seq`, the
 * TLS exporter of the connection it is sent on (`cb`), an ephemeral X25519 key for the answer
 * (`enc`), and what is asked for.
 *
 * Response: a compact JWS (`typ` gmint-res+jws) signed with GMint's Ed25519 key, bound to the
 * request by its SHA-256 (`req_hash`) and to the same connection (`cb`). When a credential is
 * issued it travels inside an HPKE seal to the request's `enc` key, with the request hash and
 * both key ids bound into the seal, so the relay in between sees ciphertext only.
 *
 * Verification functions return a reason instead of throwing. Reasons are for the audit log;
 * `publicCode` turns one into what a caller may be told.
 */

import type { KeyObject } from "node:crypto";
import { randomBytes } from "node:crypto";
import { isCode, type Code } from "./codes";
import {
  b64uDecode,
  b64uEncode,
  concat,
  constantTimeEqual,
  lengthPrefixed,
  sha256,
  utf8Decode,
  utf8Encode,
} from "./encoding";
import { generateX25519, open, seal } from "./hpke";
import { hasExactKeys, isObject, parseStrictJson, type JsonValue } from "./json";
import { signCompact, verifyCompact, type Ed25519Signer } from "./jws";

export const PROTOCOL_VERSION = 1;
export const REQUEST_TYP = "gmint-req+jws";
export const RESPONSE_TYP = "gmint-res+jws";
/** Seconds a request or response timestamp may differ from the verifier's clock. */
export const IAT_WINDOW_SECONDS = 60;
export const SEAL_INFO_PREFIX = "gmint/v1/seal";

export type PermissionLevel = "read" | "write" | "admin";
const LEVEL_RANK: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };

export interface GithubScope {
  installation_id: number;
  /** Strictly ascending, 1 to 500 entries. */
  repository_ids: number[];
  permissions: Record<string, PermissionLevel>;
}

export interface MintRequest {
  provider: "github";
  grant: string;
  scope: GithubScope;
  tenant?: string;
  purpose?: string;
}

export interface RequestPayload {
  v: 1;
  iss: string;
  aud: string;
  htm: "POST";
  htu: string;
  iat: number;
  jti: string;
  seq: number;
  cb: string;
  enc: string;
  req: MintRequest;
}

export type Status = "issued" | "pending" | "refused";

export interface SealPlaintext {
  credential: string;
  /** RFC 3339 UTC timestamp. */
  expires_at: string;
  scope: GithubScope;
  /** b64url SHA-256 of the credential, the same value GitHub's audit log shows as hashed_token. */
  hashed: string;
}

export interface ResponsePayload {
  v: 1;
  req_hash: string;
  cb: string;
  iat: number;
  status: Status;
  code?: Code;
  request_id?: string;
  seal?: { enc: string; ct: string };
}

export type Reason =
  | "request_malformed"
  | "request_unknown_key"
  | "request_bad_signature"
  | "request_wrong_issuer"
  | "request_wrong_audience"
  | "request_wrong_target"
  | "request_stale"
  | "request_wrong_channel"
  | "response_malformed"
  | "response_unknown_key"
  | "response_bad_signature"
  | "response_wrong_request"
  | "response_wrong_channel"
  | "response_stale"
  | "response_seal_failed"
  | "response_scope_exceeded";

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: Reason };

/** What a client may be told about a refused request. */
export function publicCode(reason: Reason): Code {
  if (reason === "request_malformed") return "bad_request";
  if (reason === "request_stale") return "clock";
  return "denied";
}

// ---------------------------------------------------------------- field rules

const ISS = /^gmint:\/\/[a-z0-9][a-z0-9-]{0,62}(\/[a-z0-9][a-z0-9-]{0,62}){1,4}$/;
const AUD = /^gmint:[a-z0-9][a-z0-9-]{0,62}$/;
const GRANT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TENANT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PERMISSION = /^[a-z][a-z_]{0,63}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
// Printable ASCII only: a credential is a token, never text with control characters.
const CREDENTIAL = /^[\x21-\x7e]{1,4096}$/;
const MAX_PURPOSE = 200;
const MAX_REPOS = 500;
const MAX_PERMISSIONS = 64;

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function isPosInt(v: JsonValue | undefined): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}

function bytesField(v: JsonValue | undefined, length: number): Uint8Array | null {
  if (typeof v !== "string") return null;
  const b = b64uDecode(v);
  return b && b.length === length ? b : null;
}

function parseScope(v: JsonValue | undefined): GithubScope | null {
  if (!isObject(v) || !hasExactKeys(v, ["installation_id", "repository_ids", "permissions"]))
    return null;
  const { installation_id, repository_ids, permissions } = v;
  if (!isPosInt(installation_id)) return null;
  if (
    !Array.isArray(repository_ids) ||
    repository_ids.length < 1 ||
    repository_ids.length > MAX_REPOS
  ) {
    return null;
  }
  for (let i = 0; i < repository_ids.length; i++) {
    const id = repository_ids[i];
    if (!isPosInt(id)) return null;
    if (i > 0 && id <= (repository_ids[i - 1] as number)) return null; // strictly ascending
  }
  if (!isObject(permissions)) return null;
  const names = Object.keys(permissions);
  if (names.length < 1 || names.length > MAX_PERMISSIONS) return null;
  const perms: Record<string, PermissionLevel> = {};
  for (const name of names) {
    const level = permissions[name];
    if (!PERMISSION.test(name) || (level !== "read" && level !== "write" && level !== "admin"))
      return null;
    perms[name] = level;
  }
  return { installation_id, repository_ids: repository_ids as number[], permissions: perms };
}

function parseMintRequest(v: JsonValue | undefined): MintRequest | null {
  if (!isObject(v) || !hasExactKeys(v, ["provider", "grant", "scope"], ["tenant", "purpose"]))
    return null;
  if (v.provider !== "github" || typeof v.grant !== "string" || !GRANT.test(v.grant)) return null;
  const scope = parseScope(v.scope);
  if (!scope) return null;
  const out: MintRequest = { provider: "github", grant: v.grant, scope };
  if ("tenant" in v) {
    if (typeof v.tenant !== "string" || !TENANT.test(v.tenant)) return null;
    out.tenant = v.tenant;
  }
  if ("purpose" in v) {
    const p = v.purpose;
    if (typeof p !== "string" || p.length < 1 || p.length > MAX_PURPOSE || hasControlCharacter(p)) {
      return null;
    }
    out.purpose = p;
  }
  return out;
}

function parseRequestPayload(bytes: Uint8Array): RequestPayload | null {
  const text = utf8Decode(bytes);
  const v = text == null ? undefined : parseStrictJson(text);
  if (
    !isObject(v) ||
    !hasExactKeys(v, ["v", "iss", "aud", "htm", "htu", "iat", "jti", "seq", "cb", "enc", "req"])
  ) {
    return null;
  }
  if (v.v !== PROTOCOL_VERSION) return null;
  if (typeof v.iss !== "string" || !ISS.test(v.iss)) return null;
  if (typeof v.aud !== "string" || !AUD.test(v.aud)) return null;
  if (v.htm !== "POST") return null;
  if (typeof v.htu !== "string" || v.htu.length > 256 || !v.htu.startsWith("https://")) return null;
  if (!isPosInt(v.iat) || !isPosInt(v.seq)) return null;
  if (!bytesField(v.jti, 16) || !bytesField(v.cb, 32) || !bytesField(v.enc, 32)) return null;
  const req = parseMintRequest(v.req);
  if (!req) return null;
  return {
    v: 1,
    iss: v.iss,
    aud: v.aud,
    htm: "POST",
    htu: v.htu,
    iat: v.iat,
    jti: v.jti as string,
    seq: v.seq,
    cb: v.cb as string,
    enc: v.enc as string,
    req,
  };
}

function parseResponsePayload(bytes: Uint8Array): ResponsePayload | null {
  const text = utf8Decode(bytes);
  const v = text == null ? undefined : parseStrictJson(text);
  if (
    !isObject(v) ||
    !hasExactKeys(v, ["v", "req_hash", "cb", "iat", "status"], ["code", "request_id", "seal"])
  ) {
    return null;
  }
  if (
    v.v !== PROTOCOL_VERSION ||
    !bytesField(v.req_hash, 32) ||
    !bytesField(v.cb, 32) ||
    !isPosInt(v.iat)
  ) {
    return null;
  }
  const out: ResponsePayload = {
    v: 1,
    req_hash: v.req_hash as string,
    cb: v.cb as string,
    iat: v.iat,
    status: v.status as Status,
  };
  if (v.status === "issued") {
    if (
      "code" in v ||
      "request_id" in v ||
      !isObject(v.seal) ||
      !hasExactKeys(v.seal, ["enc", "ct"])
    )
      return null;
    const enc = bytesField(v.seal.enc, 32);
    const ct = typeof v.seal.ct === "string" ? b64uDecode(v.seal.ct) : null;
    if (!enc || !ct || ct.length < 17 || ct.length > 8192) return null;
    out.seal = { enc: v.seal.enc as string, ct: v.seal.ct as string };
    return out;
  }
  if (v.status === "pending") {
    if ("seal" in v || v.code !== "approval_required") return null;
    if (!bytesField(v.request_id, 16)) return null;
    out.code = "approval_required";
    out.request_id = v.request_id as string;
    return out;
  }
  if (v.status === "refused") {
    if ("seal" in v || "request_id" in v || !isCode(v.code) || v.code === "approval_required")
      return null;
    out.code = v.code;
    return out;
  }
  return null;
}

function parseSealPlaintext(bytes: Uint8Array): SealPlaintext | null {
  const text = utf8Decode(bytes);
  const v = text == null ? undefined : parseStrictJson(text);
  if (!isObject(v) || !hasExactKeys(v, ["credential", "expires_at", "scope", "hashed"]))
    return null;
  if (typeof v.credential !== "string" || !CREDENTIAL.test(v.credential)) return null;
  if (typeof v.expires_at !== "string" || !RFC3339_UTC.test(v.expires_at)) return null;
  const hashed = bytesField(v.hashed, 32);
  const scope = parseScope(v.scope);
  if (!hashed || !scope) return null;
  if (!constantTimeEqual(hashed, sha256(utf8Encode(v.credential)))) return null;
  return { credential: v.credential, expires_at: v.expires_at, scope, hashed: v.hashed as string };
}

/** True when `granted` asks for nothing beyond `ceiling`: same installation, subset of repositories, no higher level. */
export function scopeWithin(granted: GithubScope, ceiling: GithubScope): boolean {
  if (granted.installation_id !== ceiling.installation_id) return false;
  const allowed = new Set(ceiling.repository_ids);
  if (!granted.repository_ids.every((id) => allowed.has(id))) return false;
  for (const [name, level] of Object.entries(granted.permissions)) {
    const max = Object.hasOwn(ceiling.permissions, name) ? ceiling.permissions[name] : undefined;
    if (!max || LEVEL_RANK[level] > LEVEL_RANK[max]) return false;
  }
  return true;
}

/** Normalizes a scope for sending: repository ids sorted ascending and deduplicated. */
export function normalizeScope(scope: GithubScope): GithubScope {
  return {
    installation_id: scope.installation_id,
    repository_ids: [...new Set(scope.repository_ids)].sort((a, b) => a - b),
    permissions: { ...scope.permissions },
  };
}

function sealInfo(reqHash: Uint8Array): Uint8Array {
  return concat(utf8Encode(SEAL_INFO_PREFIX), reqHash);
}

function sealAad(clientKid: string, serverKid: string, reqHash: Uint8Array): Uint8Array {
  return concat(
    lengthPrefixed(utf8Encode(clientKid)),
    lengthPrefixed(utf8Encode(serverKid)),
    reqHash,
  );
}

function nowSeconds(now?: number): number {
  return now ?? Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------- request

export interface BuildRequestOptions {
  signer: Ed25519Signer;
  iss: string;
  aud: string;
  htu: string;
  seq: number;
  /** The tls-exporter value of the connection the request will be sent on. */
  cb: Uint8Array;
  req: MintRequest;
  now?: number;
}

export interface BuiltRequest {
  jws: string;
  /** The private half of `enc`; keep it until the response is opened, then drop it. */
  encPrivate: KeyObject;
  payload: RequestPayload;
}

export async function buildRequest(opts: BuildRequestOptions): Promise<BuiltRequest> {
  if (opts.cb.length !== 32) throw new TypeError("cb must be the 32-byte tls-exporter value");
  const eph = generateX25519();
  const payload: RequestPayload = {
    v: 1,
    iss: opts.iss,
    aud: opts.aud,
    htm: "POST",
    htu: opts.htu,
    iat: nowSeconds(opts.now),
    jti: b64uEncode(new Uint8Array(randomBytes(16))),
    seq: opts.seq,
    cb: b64uEncode(opts.cb),
    enc: b64uEncode(eph.publicRaw),
    req: { ...opts.req, scope: normalizeScope(opts.req.scope) },
  };
  const bytes = utf8Encode(JSON.stringify(payload));
  // Refuse to send what the verifier would refuse to read.
  if (!parseRequestPayload(bytes))
    throw new TypeError("request does not satisfy the protocol rules");
  const jws = await signCompact(REQUEST_TYP, bytes, opts.signer);
  return { jws, encPrivate: eph.privateKey, payload };
}

export interface RequestKey {
  key: KeyObject;
  /** The client id this key belongs to; the request's `iss` must equal it. */
  owner: string;
}

export interface VerifyRequestContext {
  resolveKey: (kid: string) => RequestKey | undefined;
  aud: string;
  htu: string;
  /** The tls-exporter value the edge measured on the connection the request arrived on. */
  cb: Uint8Array;
  now?: number;
}

export interface VerifiedRequest {
  payload: RequestPayload;
  kid: string;
  /** SHA-256 of the exact request bytes, the value the response binds to. */
  reqHash: Uint8Array;
}

/**
 * The protocol half of Core's checks, in SPEC order: header, signature, strict payload,
 * issuer, audience and target, time, channel. Replay, sequence, pins, source, policy and
 * everything after are the server's.
 */
export function verifyRequest(jws: string, ctx: VerifyRequestContext): Verdict<VerifiedRequest> {
  let owner: string | undefined;
  const verified = verifyCompact(jws, REQUEST_TYP, (kid) => {
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
  const payload = parseRequestPayload(verified.value.payload);
  if (!payload) return { ok: false, reason: "request_malformed" };
  if (payload.iss !== owner) return { ok: false, reason: "request_wrong_issuer" };
  if (payload.aud !== ctx.aud) return { ok: false, reason: "request_wrong_audience" };
  if (payload.htu !== ctx.htu) return { ok: false, reason: "request_wrong_target" };
  if (Math.abs(payload.iat - nowSeconds(ctx.now)) > IAT_WINDOW_SECONDS)
    return { ok: false, reason: "request_stale" };
  if (!constantTimeEqual(b64uDecode(payload.cb)!, ctx.cb))
    return { ok: false, reason: "request_wrong_channel" };
  return {
    ok: true,
    value: { payload, kid: verified.value.header.kid, reqHash: sha256(utf8Encode(jws)) },
  };
}

// ---------------------------------------------------------------- response

export type BuildResponseOptions = {
  signer: Ed25519Signer;
  /** The verified request this answers. */
  request: VerifiedRequest;
  now?: number;
} & (
  | { status: "issued"; issued: Omit<SealPlaintext, "hashed"> }
  | { status: "pending"; requestId: string }
  | { status: "refused"; code: Exclude<Code, "approval_required"> }
);

export async function buildResponse(opts: BuildResponseOptions): Promise<string> {
  const { request } = opts;
  const payload: ResponsePayload = {
    v: 1,
    req_hash: b64uEncode(request.reqHash),
    cb: request.payload.cb,
    iat: nowSeconds(opts.now),
    status: opts.status,
  };
  if (opts.status === "issued") {
    const plaintext: SealPlaintext = {
      ...opts.issued,
      hashed: b64uEncode(sha256(utf8Encode(opts.issued.credential))),
    };
    const pt = utf8Encode(JSON.stringify(plaintext));
    if (!parseSealPlaintext(pt))
      throw new TypeError("issued credential does not satisfy the protocol rules");
    const sealed = seal(
      b64uDecode(request.payload.enc)!,
      sealInfo(request.reqHash),
      sealAad(request.kid, opts.signer.kid, request.reqHash),
      pt,
    );
    payload.seal = { enc: b64uEncode(sealed.enc), ct: b64uEncode(sealed.ct) };
  } else if (opts.status === "pending") {
    payload.code = "approval_required";
    payload.request_id = opts.requestId;
  } else {
    payload.code = opts.code;
  }
  const bytes = utf8Encode(JSON.stringify(payload));
  if (!parseResponsePayload(bytes))
    throw new TypeError("response does not satisfy the protocol rules");
  return signCompact(RESPONSE_TYP, bytes, opts.signer);
}

export interface VerifyResponseContext {
  /** GMint's pinned response keys. */
  serverKeys: (kid: string) => KeyObject | undefined;
  /** The request exactly as sent. */
  request: BuiltRequest;
  /** The client's own kid (the request signer's). */
  clientKid: string;
  /** The tls-exporter value of the connection the request was sent on. */
  cb: Uint8Array;
  now?: number;
}

export type VerifiedResponse =
  | { status: "issued"; issued: SealPlaintext }
  | { status: "pending"; requestId: string }
  | { status: "refused"; code: Code };

/** The client's checks, in SPEC order: signature, request binding, channel, time, seal, scope. */
export function verifyResponse(jws: string, ctx: VerifyResponseContext): Verdict<VerifiedResponse> {
  let serverKid = "";
  const verified = verifyCompact(jws, RESPONSE_TYP, (kid) => {
    serverKid = kid;
    return ctx.serverKeys(kid);
  });
  if (!verified.ok) {
    if (verified.error === "jws_unknown_key") return { ok: false, reason: "response_unknown_key" };
    if (verified.error === "jws_bad_signature")
      return { ok: false, reason: "response_bad_signature" };
    return { ok: false, reason: "response_malformed" };
  }
  const payload = parseResponsePayload(verified.value.payload);
  if (!payload) return { ok: false, reason: "response_malformed" };
  const reqHash = sha256(utf8Encode(ctx.request.jws));
  if (!constantTimeEqual(b64uDecode(payload.req_hash)!, reqHash))
    return { ok: false, reason: "response_wrong_request" };
  if (!constantTimeEqual(b64uDecode(payload.cb)!, ctx.cb))
    return { ok: false, reason: "response_wrong_channel" };
  if (Math.abs(payload.iat - nowSeconds(ctx.now)) > IAT_WINDOW_SECONDS)
    return { ok: false, reason: "response_stale" };

  if (payload.status === "pending")
    return { ok: true, value: { status: "pending", requestId: payload.request_id! } };
  if (payload.status === "refused")
    return { ok: true, value: { status: "refused", code: payload.code! } };

  const pt = open(
    ctx.request.encPrivate,
    b64uDecode(payload.seal!.enc)!,
    sealInfo(reqHash),
    sealAad(ctx.clientKid, serverKid, reqHash),
    b64uDecode(payload.seal!.ct)!,
  );
  const issued = pt && parseSealPlaintext(pt);
  if (!issued) return { ok: false, reason: "response_seal_failed" };
  if (!scopeWithin(issued.scope, ctx.request.payload.req.scope))
    return { ok: false, reason: "response_scope_exceeded" };
  return { ok: true, value: { status: "issued", issued } };
}
