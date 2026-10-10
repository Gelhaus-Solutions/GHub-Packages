# @ghub/glockdown-sdk

GLockdown for apps. [GLockdown](https://ennogelhaus.de) holds the authority to lock down the
whole estate; an app takes part in two ways:

- **It reads its stage.** The GLockdown agent on the app's host writes the stage GLockdown has set
  for the app to `/run/glockdown/apps/<app>.json`. `GlockdownStage` reads it, at most once a
  second, and the app enforces the strictest of it and its own sources (an env floor, its own
  setting). The stages are `off`, `signups`, `members`, `admins` and `full`.
- **It can raise itself.** `escalate()` asks GLockdown to raise this app one rung, up to AAL, over
  TLS pinned both ways: the app presents the key the operator's trust document pins for it, and
  talks only to an edge whose key it was given. Identity and Control name the apps they manage.
  Nothing an app does can lower a stage.

Reading never throws and never lowers on a fault. No file and none ever read is `off` (the agent
is not installed yet, so sign-in stays as it was). A file that cannot be read or parsed before any
good read is `full`. After a good read, any fault keeps the last good stage.

```ts
import { GlockdownStage, escalate, strictest } from "@ghub/glockdown-sdk";

const glockdown = new GlockdownStage({ app: "gadvisory" });
const stage = strictest(envFloor(), instanceSetting(), glockdown.current());

await escalate({ url, edgePins, cert, key, reason: "decoy admin account used" });
```

No dependencies: `node:` built-ins only.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
