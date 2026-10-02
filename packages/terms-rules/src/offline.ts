import { bind, type Terms } from "./consent.js";
import { PINNED_KEYS } from "./keys.js";
import { SnapshotError, type Snapshot } from "./snapshot.js";
import { parseSnapshotSignature, verifySnapshot, type PinnedKey } from "./verify.js";

/**
 * The snapshot bundled in the release, for a deployment that never talks to
 * GPlatform Terms.
 *
 * Self-hosted GControl and GAdvisory run without any connection to GPlatform
 * Terms, and
 * standalone operation gains no phone-home from this package. What they decide
 * from instead is the snapshot this release carries, verified against the keys
 * this release pins, so a new archived version reaches them with each release,
 * as it always has.
 */

/** Thrown by offline() while no release has carried a snapshot yet. */
export class NoBundledSnapshotError extends Error {
  override readonly name: string = "NoBundledSnapshotError";

  constructor() {
    super(
      "No snapshot is bundled with this release of @ghub/terms-rules yet. It arrives with the first release that carries one; until then offline() has nothing to decide from, and a caller binds a snapshot it holds itself with bind().",
    );
  }
}

/**
 * The snapshot in a directory holding `snapshot.json` and `snapshot.sig.json`,
 * verified against `keys`.
 *
 * Neither file means no snapshot was ever bundled, which is a state of the
 * release (NoBundledSnapshotError). One without the other is a broken release,
 * and is refused as one rather than reported as the same thing.
 *
 * `node:fs` and `node:path` are loaded here, when this is called, and not when
 * the package is imported: everything else in it is plain computation, and a
 * bundler following the package's imports never meets the file system. Loaded
 * through `process.getBuiltinModule` (Node 22.3 and later) rather than
 * `require`, which a bundler would follow just the same.
 */
export function bundledSnapshotIn(directory: string, keys: readonly PinnedKey[]): Snapshot {
  const fs = process.getBuiltinModule("node:fs");
  const path = process.getBuiltinModule("node:path");
  const snapshotFile = path.join(directory, "snapshot.json");
  const signatureFile = path.join(directory, "snapshot.sig.json");
  const hasSnapshot = fs.existsSync(snapshotFile);
  const hasSignature = fs.existsSync(signatureFile);
  if (!hasSnapshot && !hasSignature) throw new NoBundledSnapshotError();
  if (!hasSnapshot || !hasSignature) {
    const [present, missing] = hasSnapshot
      ? ["snapshot.json", "snapshot.sig.json"]
      : ["snapshot.sig.json", "snapshot.json"];
    throw new SnapshotError(
      `the release bundles ${present} without ${missing} in ${directory}. A snapshot is only ever used with its signature, so this release is broken rather than merely without one.`,
    );
  }
  let signature: unknown;
  try {
    signature = JSON.parse(fs.readFileSync(signatureFile, "utf8"));
  } catch {
    throw new SnapshotError(`${signatureFile} is not JSON.`);
  }
  return verifySnapshot(
    fs.readFileSync(snapshotFile, "utf8"),
    parseSnapshotSignature(signature),
    keys,
  );
}

let bundled: Terms | null = null;

/**
 * The consent rules bound to the snapshot bundled in this release.
 *
 * Read and verified once per process, on the first call, and the bound rules
 * kept: the bundled snapshot is part of the installed package and does not
 * change while the process runs. A failure is not kept, so the next call reads
 * again.
 *
 * Resolved from the package root (`dist/..`, or `src/..` under test), where the
 * release puts `snapshot/`. Until a release carries a snapshot that directory
 * holds only a README saying so, and this throws NoBundledSnapshotError.
 */
export function offline(): Terms {
  if (bundled === null) {
    const path = process.getBuiltinModule("node:path");
    bundled = bind(bundledSnapshotIn(path.join(__dirname, "..", "snapshot"), PINNED_KEYS));
  }
  return bundled;
}
