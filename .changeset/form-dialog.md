---
"@ghub/ui": minor
---

`FormDialog` and `LeaveGuard` in `@ghub/ui/modern` (D158, drawn for GPlatform Legal). `FormDialog` is a popup that holds a form, so what a form needs is made without leaving it and the form behind keeps what was typed: its fields scroll between a head and a pinned foot, focus starts on the first field, and Escape and the scrim close it unless `dismissible` is false while it holds typed input; as an `alertdialog` it asks a question. `LeaveGuard` asks before a dirty form is left by a link (the rail, a breadcrumb, a Cancel link): Stay and finish, leave and keep it for later, or discard it and leave. It pairs with `useDraftKeeper`, which keeps the text and offers it back. Every popup, `PickerDialog` included, now carries the page's own auroras as frosted glass over a 74 per cent scrim (`AURORA_POPUP`, `AURORA_SCRIM`), never a flat grey card, and they share one modal contract.
