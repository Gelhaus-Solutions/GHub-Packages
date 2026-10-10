---
"@ghub/gmint-protocol": minor
"@ghub/gmint-sdk": minor
---

A token request may name its repositories by name within the installation instead of by id
(`scope.repositories`, SDK `repositories`), or name none for an org-scoped token. A granted scope
always carries the ids when it has repositories, plus the names aligned with them when the request
named them; the client checks names against names and requires an id for each, and an org-scoped
request must get no repositories back. SPEC section 3 and 5 describe both (GMint D-71).
