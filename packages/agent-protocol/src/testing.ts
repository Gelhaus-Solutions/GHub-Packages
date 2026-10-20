/**
 * Test support only: an agent as a control plane's tests drive one, with an Ed25519 key of its own
 * and requests signed as the protocol says, any part of the assertion overridable to prove each
 * refusal. Never use it for anything that is not a test: real agents sign through the Go agent
 * core.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { AgentProtocol } from "./protocol";

const b64 = (data: string | Buffer): string => Buffer.from(data).toString("base64url");

export interface TestAgent {
  privateKey: KeyObject;
  /** The raw 32-byte public key in base64url, as a JWK's x. */
  x: string;
  /** Its RFC 7638 thumbprint, the key id enrolment gives it. */
  keyId: string;
}

export function testAgent(): TestAgent {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x ?? "";
  const keyId = createHash("sha256")
    .update(JSON.stringify({ crv: "Ed25519", kty: "OKP", x }))
    .digest("base64url");
  return { privateKey, x, keyId };
}

export interface AssertionOptions {
  /** The api's origin, which the claims name. */
  audience: string;
  method: string;
  path: string;
  /** The body exactly as it will be sent. */
  body?: string;
  /** The agent's id; none on the enrolment. */
  iss?: string;
  /** Name the key in jwk (enrolment) rather than kid. */
  jwk?: boolean;
  /** The iat, in seconds; now by default. */
  now?: number;
  jti?: string;
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
  /** Sign with this key instead of the agent's own. */
  signer?: KeyObject;
}

let counter = 0;

const freshJti = (what: string): string => {
  counter += 1;
  return b64(`${what}-${counter}-${Math.random()}-padding-padding`).slice(0, 32);
};

/** The Authorization header value for one request. */
export function signAssertion(
  protocol: AgentProtocol,
  agent: TestAgent,
  options: AssertionOptions,
): string {
  const iat = options.now ?? Math.floor(Date.now() / 1000);
  const header = {
    alg: "EdDSA",
    typ: protocol.requestType,
    ...(options.jwk === true
      ? { jwk: { kty: "OKP", crv: "Ed25519", x: agent.x } }
      : { kid: agent.keyId }),
    ...options.header,
  };
  const claims = {
    ...(options.iss === undefined ? {} : { iss: options.iss }),
    aud: options.audience,
    iat,
    exp: iat + 60,
    jti: options.jti ?? freshJti("jti"),
    method: options.method,
    path: options.path,
    bodySha256: createHash("sha256")
      .update(options.body ?? "")
      .digest("base64url"),
    ...options.claims,
  };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  const signature = sign(null, Buffer.from(input), options.signer ?? agent.privateKey);
  return `${protocol.scheme} ${input}.${b64(signature)}`;
}

/** A new key's proof of itself for a rotation, signed by that key. */
export function signKeyProof(
  protocol: AgentProtocol,
  next: TestAgent,
  agentId: string,
  audience: string,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = {
    alg: "EdDSA",
    typ: protocol.keyProofType,
    jwk: { kty: "OKP", crv: "Ed25519", x: next.x },
  };
  const claims = { iss: agentId, aud: audience, iat: now, exp: now + 60, jti: freshJti("proof") };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  return `${input}.${b64(sign(null, Buffer.from(input), next.privateKey))}`;
}
