# @ghub/identity-chrome

The shared header controls of the Gelhaus Solutions products: the apps picker and the
account popup. Two custom elements with shadow DOM (`<gp-apps>`, `<gp-account>`) and React
wrappers for them; the browser half under both (what the controls know, what they keep, what
they do when Identity cannot be reached); and the server half (a product's own server asking
GPlatform Identity).

Nothing here depends on a product signing in through Identity. A product that has not
adopted it uses the same package the same way.

## Off unless enabled

```ts
import { createChromeCore } from "@ghub/identity-chrome";

const chrome = createChromeCore({
  enabled: true, // anything but exactly true makes no request and reads no storage
  endpoint: "/api/identity-chrome", // the product's own route, same origin
  storage: window.localStorage, // optional: the last list, held for an outage
});

chrome.subscribe((state) => draw(state));
await chrome.load();
```

A self-hosted or customer-run installation never sets `enabled`, so it never calls anybody.
The last answer is drawn at once while a fresh one is fetched, is kept and marked `stale`
when the refresh fails, and is thirty days old at most. Call `chrome.clear()` on sign-out, so
a shared device never shows the next person the previous one's products.

Every address in an answer is checked before it is drawn: a tile or an icon whose address is
not `http` or `https` is dropped, never repaired, in a fresh answer and in the cached copy
alike.

## The product's own route

```ts
import { createChromeServer } from "@ghub/identity-chrome/server";

const chrome = createChromeServer({
  baseUrl: process.env.GPID_URL,
  product: "advisory",
  token: process.env.GPID_CHROME_TOKEN, // never sent to a browser
});

// Any framework that speaks the web Request and Response:
export const GET = chrome.handler(async (request) => {
  const user = await sessionOf(request);
  return user === null ? null : { email: user.verifiedEmail };
});
```

The route says only who is signed in, by an address the product has verified, and Identity
answers with the products that person has and the public ones they do not, and the two
footer links of the account popup (the terms and the privacy policy, the same in every
product, so a moved address needs no new release here). An unverified
address is a way to ask about somebody else. Answers are reused for a minute, and the token
is never in anything this package throws or answers.

A one-off push of a product's users (`chrome.seed(emails)`) is refused unless staff have
opened a window for it on Identity's product screen, and `chrome.remove(emails)` says people
no longer have access.

## The two controls

```ts
import { createChromeCore, defineChromeElements } from "@ghub/identity-chrome";

defineChromeElements(); // <gp-apps> and <gp-account>, each once; a no-op on a server

const apps = document.querySelector("gp-apps")!;
apps.core = chrome; // the core above: one fetch and one cache behind both

const account = document.querySelector("gp-account")!;
account.core = chrome;
account.product = "GAdvisory"; // your own name, from your catalogue entry
account.person = { name: user.name, email: user.email, id: user.id, avatarUrl: user.picture };
account.organisations = [{ id: "org_1", name: "Hafen Labs", role: "Admin", active: true }];
account.onSwitch = async (id) => switchOrganisation(id); // reject when it did not switch
account.onSignOut = async () => {
  await signOut(); // reject when it failed: the popup says they are still signed in
  location.assign("/"); // you navigate; as this resolves the element forgets the kept list
};
```

Everything is a property, because a core, a person and a callback are objects. Each can be
set before the element is defined. Neither control renders anything while the core is off,
and the account popup renders nothing without a person.

**The account popup shows mostly what the product passes**: the name and address from your
session, your organisations with the role your product gives them there (its own label, already in the
person's language and shown as given; none, and the row has no second line) and your two actions.
Identity adds the picture, the colour of the initial, the links to its own account and set up
screens and the footer, so the popup still signs somebody out while Identity is down. The
picture is Identity's if the person has one, else yours, else a coloured initial whose tint
Identity picks from its own id; for somebody with no Identity, pass your own stable user id as
`id` and the same hash (`avatarTint`) picks it. Set `viaIdentity` once you sign in through
Identity, and Sign out says it ends both. Sign out leaves this product only.

Every word can be replaced through `labels`; the rest stay English.

### At the bottom of a sidebar, with your own items

```html
<div style="display: flex; align-items: center">
  <gp-account layout="row" placement="top" align="start" style="flex: 1"></gp-account>
  <gp-apps placement="top" align="start"></gp-apps>
</div>
```

```ts
account.labels = { organisations: "Groups" };
account.items = [
  { id: "profile", label: "Profile", href: "/settings/profile", icon: userSvg },
  { id: "account", label: "Account", href: "/settings/account", icon: settingsSvg },
  { id: "replay", label: "Session recording", onSelect: () => openReplayChoice(), icon: videoSvg },
];
```

`layout="row"` draws the trigger as a full width row, the picture with the name over the
address; `placement="top"` opens both popups upward. Your items follow the organisations
under your product's name, as links or as buttons; on a link, `onSelect` may call
`preventDefault()` and navigate with your own router. An icon is SVG markup on a 24 grid and
is kept to its shapes. Until you sign in through Identity, Sign out is the last row of your
items' group; with `viaIdentity` it ends both sessions and stands on its own.

### In React

```tsx
import { GpAccount, GpApps } from "@ghub/identity-chrome/react";

<GpApps core={chrome} />
<GpAccount core={chrome} product="GAdvisory" person={person} organisations={orgs} onSwitch={switchTo} onSignOut={signOut} />
```

The wrappers define the elements and set the properties after mounting, so they render on a
server as the bare tags. React 19 or newer, as an optional peer.

### The host contract

Shadow DOM: nothing reaches in and nothing leaks out but the custom properties a page
declares on its root, which inherit into the shadow. The controls read the published
`@ghub/tokens` names, so a page on `@ghub/tokens` is styled with no setup, and Aurora's frosted
menu where the page is on Aurora:

| Reads                                                                                                                                                                                                | For                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `--ga-menu`, else `--gm-overlay`; `--ga-frost-menu`; `--ga-shadow-menu`, else `--gm-shadow-overlay`                                                                                                  | the picker's surface, its frost and its shadow |
| `--ga-menu`, else `--gm-sunken`                                                                                                                                                                      | the account popup's tinted ground              |
| `--ga-track`, else `--gm-overlay`                                                                                                                                                                    | the account popup's panels                     |
| `--gm-plate`, `--gm-ink`, `--gm-ink-2`, `--gm-ink-3`, `--gm-hairline`, `--gm-control`, `--gm-hover`, `--gm-active`, `--gm-selected`, `--gm-accent`, `--gm-accent-text`, `--gm-ring`, `--gm-crit-ink` | everything else                                |
| `--font-sans`                                                                                                                                                                                        | the face                                       |

A page that declares none of them gets modern light, or modern dark under
`prefers-color-scheme: dark`. There is no second accent: the controls take the page's. Both
follow reduced motion, reduced transparency and forced colours, and below 600 wide each is a
modal bottom sheet. `part="trigger"` and `part="popup"` are there for placement only.

## A product's own name and mark

Identity's catalogue is where every product's name and mark live. Read your own from it for
your top bar, your title and your favicon, and a rename or a new mark reaches you without a
release:

```ts
import { catalogueMarkUrl, createCatalogue } from "@ghub/identity-chrome";

const catalogue = createCatalogue({ baseUrl: process.env.GPID_URL });
const me = await catalogue.entry("gadvisory"); // { displayName, homeUrl, iconUrl, monoIconUrl, ... }

// Where you cannot ask first, an address that always leads to the current mark:
// <link rel="icon" type="image/svg+xml" href={catalogueMarkUrl(process.env.GPID_URL, "gadvisory")} />
```

No token is needed. An entry is reused for a minute, and after a failed ask the last good one
is returned, so an outage leaves the name and mark you last had. A self-hosted install asks
nobody and ships the copy its release was built with.

The shapes are kept in step by hand with `ChromeView` and `CatalogueEntry` in GPlatform
Identity, which this public package cannot depend on.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share.
