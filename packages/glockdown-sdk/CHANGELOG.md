# @ghub/glockdown-sdk

## 0.2.0

### Minor Changes

- The edge as a second source of the stage: `GlockdownStage` takes an optional `edge` (the app's pinned TLS identity and the edge's pins), asks `GET /v1/stage` in the background at most every `edgeEveryMs` (15 s), and holds the stricter of the agent's file and the edge's last good answer, so a file deleted, blocked or rewritten on the host no longer lowers the stage and a silent edge keeps its last answer. `askStage` asks directly.

## 0.1.0

### Minor Changes

- First release: GLockdown for apps. `GlockdownStage` reads the stage GLockdown's agent writes for the app (off while the agent is not installed, full on a file it cannot read before any good read, the last good stage through any later fault), `refusesEveryCredential` says when the app refuses every credential, existing sessions and API keys included (AAL and above), `strictest` combines the stage with the app's own sources, and `escalate` raises the app one rung over TLS pinned both ways. `Honeytokens` knows the app's decoy admin and decoy API key and, when one is used, tells GLockdown through `signal()` over the same pinned TLS (L97). No dependencies.
