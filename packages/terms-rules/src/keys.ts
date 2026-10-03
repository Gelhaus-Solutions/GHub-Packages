import type { PinnedKey } from "./verify.js";

/**
 * The public keys a snapshot may be signed with, pinned into the release.
 *
 * `gpterms-snapshot` version 1 is the Ed25519 key GPlatform Terms signs its
 * snapshot with (Vault Transit `prod-transit/keys/gpterms-snapshot`, never
 * exportable). Pinned in 0.1.3, the release that first carries a snapshot,
 * from what the service publishes at `/api/public/v1/keys`, read the same over
 * the public address and on the host itself on 2026-10-03.
 *
 * A key is only ever added here, never replaced. A snapshot signed under an
 * earlier key version has to verify in every later release too, so a rotation
 * adds the new version beside the old one rather than in its place.
 */
export const PINNED_KEYS: readonly PinnedKey[] = Object.freeze([
  Object.freeze({
    keyId: "gpterms-snapshot",
    keyVersion: 1,
    publicKeySpkiDer: "MCowBQYDK2VwAyEAbnqjxxqT35jte5ZYqZLUmf2tn6eMa+2Rj0BITmTv9/0=",
  }),
]);
