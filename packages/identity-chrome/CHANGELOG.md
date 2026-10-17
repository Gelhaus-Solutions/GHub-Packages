# @ghub/identity-chrome

## 0.5.0

### Minor Changes

- 2964297: An organisation can carry its own picture: `AccountOrganisation.iconUrl`, absolute or relative to the page, http or https only, is drawn in place of the initial, and the initial comes back where there is none or it does not load.

## 0.4.0

### Minor Changes

- 32965dc: `<gp-account density="compact">` (and `density` on `GpAccount`) draws the account popup a step smaller for a sidebar: 320 wide instead of 384, a 52 px picture, a 16 px name and rows 38 to 44 high, so it no longer covers the rail and half the page. The rows, their order and the words are the same; a top bar keeps the full popup, and below 600 wide both are the same bottom sheet.

## 0.3.0

### Minor Changes

- 0c6da79: The account popup fits a sidebar and carries the product's own items: `layout="row"` draws the trigger as a full width row (the picture, the name over the address), `placement="top"` opens either popup upward, and `items` adds the product's links and actions after the organisations, under its name, with icons kept to their shapes (`iconOf`). Until the product signs in through Identity, Sign out is the last row of that group; with `viaIdentity` it stands on its own.

  Roles are the product's own: `AccountOrganisation.role` is an optional label, already localised and shown as given, instead of the fixed owner, admin or member. `OrganisationRole` and `labels.roles` are removed.

## 0.2.0

### Minor Changes

- fb99ea8: The two header controls themselves: `<gp-apps>`, the apps picker, and `<gp-account>`, the account popup, as custom elements with shadow DOM reading the published `@ghub/tokens` names (`defineChromeElements()`), and `@ghub/identity-chrome/react` with a wrapper for each (React 19 or newer, an optional peer). The account popup shows the person, their organisations and Sign out from the product's own session, and Identity's picture, tint, links and footer from the view; the view now carries `person.tint` and `identity` (the account, picture and set up links and Identity's mark), both null from an Identity that does not send them. `avatarTint` picks one of the seven tints from a stable id.

## 0.1.0

### Minor Changes

- 32cf885: The first version: the shared header controls' browser core (state, a cache held for an outage, silent unless enabled, every address checked before it is drawn, the footer links Identity sends), a reader for a product's own name and marks in Identity's catalogue, and `@ghub/identity-chrome/server` (a product's server asking GPlatform Identity by token, a route handler for any web Request and Response framework, the one-off push of users in batches).
