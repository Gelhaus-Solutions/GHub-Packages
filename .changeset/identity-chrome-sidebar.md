---
"@ghub/identity-chrome": minor
---

The account popup fits a sidebar and carries the product's own items: `layout="row"` draws the trigger as a full width row (the picture, the name over the address), `placement="top"` opens either popup upward, and `items` adds the product's links and actions after the organisations, under its name, with icons kept to their shapes (`iconOf`). Until the product signs in through Identity, Sign out is the last row of that group; with `viaIdentity` it stands on its own.

Roles are the product's own: `AccountOrganisation.role` is an optional label, already localised and shown as given, instead of the fixed owner, admin or member. `OrganisationRole` and `labels.roles` are removed.
