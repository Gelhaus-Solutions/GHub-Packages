import type { PinnedKey } from "./verify.js";

/**
 * The public keys a snapshot may be signed with, pinned into the release.
 *
 * Empty for now. The public half of the GPlatform Terms signing key (key id
 * `gpterms-snapshot`) is pinned here in the release that first carries a
 * snapshot. Until then nothing verifies, which is right: there is nothing yet
 * that should.
 *
 * A key is only ever added here, never replaced. A snapshot signed under an
 * earlier key version has to verify in every later release too, so a rotation
 * adds the new version beside the old one rather than in its place.
 */
export const PINNED_KEYS: readonly PinnedKey[] = Object.freeze([]);
