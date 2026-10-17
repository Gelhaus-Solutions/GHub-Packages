# @ghub/identity-chrome

## 0.2.0

### Minor Changes

- fb99ea8: The two header controls themselves: `<gp-apps>`, the apps picker, and `<gp-account>`, the account popup, as custom elements with shadow DOM reading the published `@ghub/tokens` names (`defineChromeElements()`), and `@ghub/identity-chrome/react` with a wrapper for each (React 19 or newer, an optional peer). The account popup shows the person, their organisations and Sign out from the product's own session, and Identity's picture, tint, links and footer from the view; the view now carries `person.tint` and `identity` (the account, picture and set up links and Identity's mark), both null from an Identity that does not send them. `avatarTint` picks one of the seven tints from a stable id.

## 0.1.0

### Minor Changes

- 32cf885: The first version: the shared header controls' browser core (state, a cache held for an outage, silent unless enabled, every address checked before it is drawn, the footer links Identity sends), a reader for a product's own name and marks in Identity's catalogue, and `@ghub/identity-chrome/server` (a product's server asking GPlatform Identity by token, a route handler for any web Request and Response framework, the one-off push of users in batches).
