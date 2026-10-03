/**
 * The consent rules of the Gelhaus Solutions product family.
 *
 * `termsAcceptedAt` proves that somebody agreed and when. It does not prove
 * what they agreed to, because the page it pointed at is live and mutable and
 * changes underneath them. The archive is the other half: an immutable, hashed
 * copy of every published version, and the identifier a consent row carries so
 * that "they agreed" resolves to specific bytes. This package holds the rules
 * that read that identifier against the archive, moved from `@ghub/gctl-terms`
 * 0.1.4 unchanged in meaning.
 *
 * Two things changed. The archive is no longer compiled in: every rule decides
 * from a snapshot (see snapshot.ts), and bind(snapshot) returns the rules bound
 * to one, while offline() binds the one bundled in this release. And a
 * version's dates come from its rollout on each surface, falling back to its
 * default, so one surface can run later than the others without moving theirs.
 *
 * A document can have several versions at once: one in force, and a newer one
 * announced six weeks and a day before it binds. consentStateAt is the question
 * every product asks at its gate and at sign-in, versionToRecord is what an
 * acceptance writes, and announcementsDue is what the notice mail is sent for.
 * Nothing here talks to the network or reads the clock.
 */

export {
  parseSnapshot,
  SnapshotError,
  type ChangeSummary,
  type LanguageTag,
  type Snapshot,
  type SnapshotDocument,
  type SnapshotRollout,
  type AtOnce,
  type SnapshotSurface,
  type SnapshotVersion,
} from "./snapshot.js";
export { earliestInForceFrom, sameClockTimeLater, SUPERSEDING_NOTICE_DAYS } from "./notice.js";
export { canonicalJson } from "./canonical.js";
export {
  parseSnapshotSignature,
  SnapshotSignatureError,
  verifySnapshot,
  type PinnedKey,
  type SnapshotSignature,
} from "./verify.js";
export { PINNED_KEYS } from "./keys.js";
export {
  announcementsDue,
  archivedVersion,
  bind,
  consentLinks,
  consentStateAt,
  documentsFor,
  documentsOfConsent,
  documentStandings,
  UnknownDocumentError,
  UnknownSurfaceError,
  versionToRecord,
  type ArchivedVersion,
  type ConsentAnnouncement,
  type ConsentHolder,
  type ConsentLinks,
  type ConsentState,
  type DocumentStanding,
  type DocumentStandingKind,
  type ScheduledVersion,
  type Terms,
} from "./consent.js";
export { NoBundledSnapshotError, offline } from "./offline.js";
