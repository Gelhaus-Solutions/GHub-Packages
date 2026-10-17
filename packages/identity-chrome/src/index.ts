/**
 * @ghub/identity-chrome
 *
 * The shared header controls of the Gelhaus Solutions products. This entry is the
 * browser half: state, cache and the last list held for an outage. The server
 * half, with the token, is `@ghub/identity-chrome/server`.
 */

export {
  CACHE_KEY,
  CACHE_MAX_AGE_MS,
  DEFAULT_TIMEOUT_MS,
  createChromeCore,
  type ChromeCore,
  type ChromeCoreOptions,
  type ChromeState,
  type ChromeStatus,
  type StorageLike,
} from "./core.js";
export type {
  ChromeLegal,
  ChromePerson,
  ChromePublicView,
  ChromeTile,
  ChromeView,
} from "./types.js";
export { safeUrl } from "./validate.js";
