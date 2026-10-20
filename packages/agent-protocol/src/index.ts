export {
  AUDIENCE,
  AssertionRefused,
  KEY_ID,
  REQUEST_LIFETIME_SECONDS,
  SKEW_SECONDS,
  bodyHash,
  claimsMatch,
  parseAssertion,
  parseKeyProof,
  signatureHolds,
  thumbprint,
  weakKey,
} from "./protocol";
export type {
  AgentProtocol,
  AssertionKey,
  KeyProof,
  KeyProofClaims,
  ParsedAssertion,
  RequestClaims,
  RequestFacts,
} from "./protocol";
