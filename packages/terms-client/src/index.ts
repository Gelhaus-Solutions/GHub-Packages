/**
 * The client every Gelhaus Solutions product uses to talk to GPlatform Terms:
 * where an account stands with the documents its product asks it to accept,
 * the acceptances it makes, and the account facts notices are sent by.
 *
 * Built on @ghub/terms-rules, whose rules it binds to the newest verified
 * snapshot the service serves, and which it falls back to when the service
 * cannot answer. Nobody is locked out because the service is down.
 */

export {
  createTermsClient,
  QUIET_AFTER_FAILURE_MS,
  type Delivery,
  type FlushReport,
  type LocalRecord,
  type Queued,
  type ReadyReport,
  type RecordOutcome,
  type Standing,
  type TermsClient,
  type TermsClientOptions,
} from "./client.js";
export { TermsApiError, type FetchLike } from "./http.js";
export {
  FIRST_RETRY_MS,
  isOutage,
  isRetryable,
  memoryOutboxStore,
  nextAttemptAfter,
  RETRY_CEILING_MS,
  type OutboxEntry,
  type OutboxKind,
  type OutboxStore,
} from "./outbox.js";
export { OUTBOX_TABLE_SQL, postgresOutboxStore, type SqlQuery } from "./postgres-outbox.js";
export {
  TermsUnavailableError,
  type SnapshotSource,
  type SnapshotStore,
  type StoredSnapshot,
} from "./snapshot-cache.js";
export {
  UnreadableAnswerError,
  type ConsentRow,
  type ConsentToRecord,
  type DocumentStandingSummary,
  type Locale,
  type Objection,
  type OwnRecord,
  type ProductConsentSource,
  type SubjectFacts,
} from "./wire.js";
export type {
  ConsentAnnouncement,
  ConsentLinks,
  ConsentState,
  DocumentStandingKind,
  PinnedKey,
  ScheduledVersion,
  Terms,
} from "@ghub/terms-rules";
