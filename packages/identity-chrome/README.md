# @ghub/identity-chrome

The shared header controls of the Gelhaus Solutions products: the apps picker and the
account popup. This version is the part with no markup in it: the browser half (what the
controls know, what they keep, what they do when Identity cannot be reached) and the server
half (a product's own server asking GPlatform Identity). The Web Component and the React
wrapper come with the design.

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

The shapes are kept in step by hand with `ChromeView` in GPlatform Identity, which this
public package cannot depend on.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share.
