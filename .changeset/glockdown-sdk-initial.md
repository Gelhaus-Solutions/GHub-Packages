---
"@ghub/glockdown-sdk": minor
---

First release: GLockdown for apps. `GlockdownStage` reads the stage GLockdown's agent writes for the app (off while the agent is not installed, full on a file it cannot read before any good read, the last good stage through any later fault), `refusesEveryCredential` says when the app refuses every credential, existing sessions and API keys included (AAL and above), `strictest` combines the stage with the app's own sources, and `escalate` raises the app one rung over TLS pinned both ways. No dependencies.
