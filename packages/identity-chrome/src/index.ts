/**
 * @ghub/identity-chrome
 *
 * The shared header controls of the Gelhaus Solutions products. This entry is the
 * browser half: state, cache and the last list held for an outage, and the two
 * controls as custom elements (`<gp-apps>`, `<gp-account>`). The server half,
 * with the token, is `@ghub/identity-chrome/server`; React wrappers are
 * `@ghub/identity-chrome/react`.
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
export {
  catalogueMarkUrl,
  createCatalogue,
  type Catalogue,
  type CatalogueOptions,
} from "./catalogue.js";
export {
  ACCOUNT_LABELS,
  APPS_LABELS,
  createAccountElementClass,
  createAppsElementClass,
  defineAccountElement,
  defineAppsElement,
  defineChromeElements,
  type AccountElement,
  type AccountLabels,
  type AccountOrganisation,
  type AccountPerson,
  type AppsElement,
  type AppsLabels,
  type OrganisationRole,
  type SignOutHandler,
  type SwitchHandler,
} from "./elements/index.js";
export { AVATAR_INK, AVATAR_TINTS, avatarTint } from "./tint.js";
export type {
  CatalogueEntry,
  ChromeIdentityLinks,
  ChromeLegal,
  ChromePerson,
  ChromePublicView,
  ChromeTile,
  ChromeView,
} from "./types.js";
export { safeUrl } from "./validate.js";
