# @ghub/glockdown-sdk

GLockdown for apps. [GLockdown](https://ennogelhaus.de) holds the authority to lock down the
whole estate; an app takes part in two ways:

- **It reads its stage.** The GLockdown agent on the app's host writes the stage GLockdown has set
  for the app to `/run/glockdown/apps/<app>.json`. `GlockdownStage` reads it, at most once a
  second, and the app enforces the strictest of it and its own sources (an env floor, its own
  setting). The stages are `off`, `signups`, `members`, `admins` and `full`. From AAL phase 1
  `refusesEveryCredential()` is true: the app then refuses every credential, existing sessions
  and API keys included, not only new sign-ins. Its public pages stay up; GLockdown cuts those
  itself, at AAL phase 2.
- **It can raise itself.** `escalate()` asks GLockdown to raise this app one rung, up to AAL, over
  TLS pinned both ways: the app presents the key the operator's trust document pins for it, and
  talks only to an edge whose key it was given. Identity and Control name the apps they manage.
  Nothing an app does can lower a stage.
- **It keeps honeytokens** (L97). A decoy admin account and a decoy API key sit in the app's
  database like real ones and are used by nobody. `Honeytokens` knows the decoy's sign-in names
  and the SHA-256 of the decoy key; `isDecoyLogin()` and `isDecoyKey()` say whether a presented
  name or key is a decoy and, when it is, tell GLockdown through `signal()` (at most once a minute
  each), which raises AAL phase 1 for the app and whatever shares its host and database. The app
  refuses the attempt exactly as a wrong password or an unknown key, so whoever tried learns
  nothing. The decoy key itself is planted where an intruder would look, never in the app's
  configuration.

Reading never throws and never lowers on a fault. No file and none ever read is `off` (the agent
is not installed yet, so sign-in stays as it was). A file that cannot be read or parsed before any
good read is `full`. After a good read, any fault keeps the last good stage.

```ts
import { GlockdownStage, Honeytokens, escalate, signal, strictest } from "@ghub/glockdown-sdk";

const glockdown = new GlockdownStage({ app: "gadvisory" });
const stage = strictest(envFloor(), instanceSetting(), glockdown.current());

await escalate({ url, edgePins, cert, key, reason: "suspicious sign-ins" });

const edge = { url, edgePins, cert, key };
const honey = new Honeytokens({
  logins: [process.env.GLOCKDOWN_DECOY_LOGIN!],
  keySha256: [process.env.GLOCKDOWN_DECOY_KEY_SHA256!],
  trip: (s) => signal({ ...edge, ...s }),
});
// In sign-in, before the password is checked; in API auth, before the key is looked up:
if (honey.isDecoyLogin(email, `from ${ip}`)) return refuseAsWrongPassword();
if (honey.isDecoyKey(presentedKey, `${method} ${path}`)) return refuseAsUnknownKey();
```

No dependencies: `node:` built-ins only.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
