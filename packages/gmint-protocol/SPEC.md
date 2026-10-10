# GMint wire protocol, version 1

This is the normative description of the bytes a GMint client and a GMint server exchange for one
mint (sections 3 to 6) and for one certificate renewal (section 7). `src/messages.ts`, `src/renew.ts`
and `src/csr.ts` are its implementation and `src/*.test.ts` its executable checks.
`src/vectors.messages.json` holds one of each message from fixed test keys, every byte
reproducible (`src/vectors.test.ts` is its generator), for implementations in other stacks.

## 1. Transport

- TLS 1.3 only, mutual TLS. The client certificate must chain to the GMint client CA and its key
  must be pinned in the server's signed policy; the server certificate must chain to the GMint root
  the client pins. No WebPKI trust, no session tickets, no 0-RTT.
- One request per connection is the norm; the request must be sent on the connection whose
  exporter it carries.

## 2. Encodings

- **b64url**: base64url without padding (RFC 4648 section 5). Only the canonical spelling is
  accepted: a value that does not re-encode to itself is rejected.
- **Strict JSON**: RFC 8259 plus these restrictions. No duplicate member names; no member named
  `__proto__`, `constructor` or `prototype`; numbers are integers in the IEEE 754 safe range
  (no fraction, no exponent, no `-0`); no lone surrogates; nesting at most 16 deep; nothing after
  the value.
- **Compact JWS** (RFC 7515) with `alg` `EdDSA` over Ed25519 (RFC 8037). The protected header is
  exactly `{"alg":"EdDSA","typ":<typ>,"kid":<kid>}` in any member order, no other member. `kid`
  matches `[A-Za-z0-9._:-]{1,128}`. The signature is 64 bytes. A JWS longer than 16 KiB is rejected
  unread. Signatures cover the exact transmitted bytes; nothing is re-serialised.
- **tls-exporter**: 32 bytes from the TLS 1.3 exporter with label `EXPORTER-Channel-Binding` and an
  empty context (RFC 9266).

## 3. Request

`POST <htu>`, `Content-Type: application/gmint-req+jws`, body a compact JWS with `typ`
`gmint-req+jws`, signed with the client's request-signing key. Payload (strict JSON, exactly these
members):

| Member | Type    | Rule                                                                                                                                                         |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v`    | integer | `1`                                                                                                                                                          |
| `iss`  | string  | The client id, `gmint://` and two to five `/`-separated parts of `[a-z0-9][a-z0-9-]{0,62}` (`gmint://<namespace>/<workload>`); must equal the owner of `kid` |
| `aud`  | string  | `gmint:<instance>`, the instance `[a-z0-9][a-z0-9-]{0,62}`; must equal the server's instance                                                                 |
| `htm`  | string  | `POST`                                                                                                                                                       |
| `htu`  | string  | The exact URL, `https://`, at most 256 characters                                                                                                            |
| `iat`  | integer | Seconds since the epoch; within 60 s of the server's clock                                                                                                   |
| `jti`  | string  | b64url of 16 random bytes; never seen before by the server                                                                                                   |
| `seq`  | integer | At least 1; per client, unseen and within the server's sequence window                                                                                       |
| `cb`   | string  | b64url tls-exporter of the connection the request is sent on                                                                                                 |
| `enc`  | string  | b64url X25519 public key (32 bytes), fresh per request, for the answer                                                                                       |
| `req`  | object  | What is asked for, below                                                                                                                                     |

`req`: exactly `provider`, `grant`, `scope`, optionally `tenant` and `purpose`. The scope names its
repositories by id or by name, or none: a request by name is resolved by GitHub within the
installation, and the server checks the ids GitHub granted against its policy before answering;
a request with no repositories asks for an org-scoped token, which only an org-scoped grant
allows.

| Member                  | Rule                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`              | `github`                                                                                                                                                            |
| `grant`                 | `[a-z0-9][a-z0-9._-]{0,63}`, the grant id in the server's policy                                                                                                    |
| `scope.installation_id` | Positive integer                                                                                                                                                    |
| `scope.repository_ids`  | 1 to 500 positive integers, strictly ascending; or, instead, `scope.repositories`; or neither (org-scoped)                                                          |
| `scope.repositories`    | 1 to 500 repository names in the installation, `[A-Za-z0-9._-]{1,100}` but not `.` or `..`, strictly ascending in ASCII order; never together with `repository_ids` |
| `scope.permissions`     | 1 to 64 members, names `[a-z][a-z_]{0,63}`, values `read`, `write` or `admin`                                                                                       |
| `tenant`                | `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`, the tenant a multi-tenant client acts for                                                                                      |
| `purpose`               | 1 to 200 UTF-16 code units, none below U+0020 and no U+007F                                                                                                         |

## 4. Server checks, in order

1. JWS structure and header; `typ` is `gmint-req+jws`; look up `kid` (an unknown `kid` still costs
   one signature verification against a fixed key).
2. Signature over the raw signing input.
3. Strict payload parse and the rules of section 3.
4. `iss` equals the key's owner; `aud`, `htu` equal the server's.
5. `iat` within 60 s.
6. `cb` equals the exporter the server measured on this connection.

The protocol ends here; replay (`jti`), sequence window, certificate pin, source address,
authorization, quotas, time windows, approvals and the witness gate are the server's and come
next, in that order. Every failure is reported with a code from section 6, never with a reason.

## 5. Response

`Content-Type: application/gmint-res+jws`, a compact JWS with `typ` `gmint-res+jws`, signed with
GMint's response key (held in OpenBao). Payload (strict JSON):

| Member       | Rule                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `v`          | `1`                                                                                                  |
| `req_hash`   | b64url SHA-256 of the request JWS bytes exactly as received                                          |
| `cb`         | The request's `cb`                                                                                   |
| `iat`        | Within 60 s of the client's clock                                                                    |
| `status`     | `issued`, `pending` or `refused`                                                                     |
| `code`       | Absent when `issued`; `approval_required` when `pending`; any other code of section 6 when `refused` |
| `request_id` | Only when `pending`: b64url of 16 bytes                                                              |
| `seal`       | Only when `issued`: `{ "enc": <b64url 32 bytes>, "ct": <b64url, 17 to 8192 bytes> }`                 |

### 5.1 Seal

HPKE (RFC 9180) base mode, single shot, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM, to
the request's `enc` key:

- `info` = ASCII `gmint/v1/seal` followed by the 32 bytes of `req_hash`.
- `aad` = `lp(client kid) || lp(server kid) || req_hash`, where `lp` is a two-byte big-endian
  length followed by the UTF-8 bytes.

Plaintext (strict JSON, exactly these members):

| Member       | Rule                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credential` | 1 to 4096 characters from U+0021 to U+007E: printable ASCII without the space (opaque; GitHub's token format is variable)                                                                                     |
| `expires_at` | RFC 3339 UTC timestamp, `YYYY-MM-DDTHH:MM:SS` with an optional fraction of 1 to 9 digits, then `Z` (checked by form)                                                                                          |
| `scope`      | The scope granted: `repository_ids` whenever it has repositories, and `repositories` too when the request named them, holding their names in the order of `repository_ids`; neither for an org-scoped request |
| `hashed`     | b64url SHA-256 of `credential`, the value GitHub's audit log calls `hashed_token`                                                                                                                             |

### 5.2 Client checks, in order

1. JWS structure; `typ` is `gmint-res+jws`; `kid` in the client's pinned server key set; signature.
2. Strict payload parse and the rules of section 5.
3. `req_hash` equals SHA-256 of the request the client sent.
4. `cb` equals the client's own exporter.
5. `iat` within 60 s.
6. For `issued`: open the seal; the plaintext parses; `hashed` matches `credential`; the granted
   scope is within the requested one: the same installation; its repository ids a subset of the
   requested ids, or, for a request by name, its names a subset of the requested names with an id
   for each; no repositories at all for an org-scoped request; no permission above what was asked.

## 6. Codes

`denied`, `bad_request`, `replay`, `clock`, `quarantined`, `rate_limited`, `witness_stale`,
`approval_required`, `approval_unavailable`, `locked_down`, `unavailable`, `provider_error`.
Every authorization failure is `denied`. `unavailable`, `rate_limited` and `clock` may be retried
unchanged later; nothing else should be.

## 7. Certificate renewal

Client and node certificates live 7 days. Before one expires, its holder asks for a new one for
the same key, on a connection made with the certificate it still holds. A key change is never a
renewal: it is a policy change.

### 7.1 Request

`POST <origin>/v1/cert/renew` on the listener the caller uses (clients on the client listener,
nodes on the node listener), `Content-Type: application/gmint-renew+jws`, body a compact JWS with
`typ` `gmint-renew+jws`, signed with the caller's request-signing key. Payload (strict JSON, exactly
these members):

| Member | Rule                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `v`    | `1`                                                                                                                                    |
| `iss`  | The caller's id: a client id as in section 3, or a node id `node://<name>` with the name `[a-z0-9][a-z0-9-]{0,62}`; the owner of `kid` |
| `aud`  | As in section 3                                                                                                                        |
| `htm`  | `POST`                                                                                                                                 |
| `htu`  | The exact renewal URL, `https://`, at most 256 characters                                                                              |
| `iat`  | As in section 3                                                                                                                        |
| `jti`  | As in section 3                                                                                                                        |
| `cb`   | b64url tls-exporter of the connection the request is sent on                                                                           |
| `csr`  | b64url of a DER PKCS #10 request (RFC 2986), at most 1024 bytes, made with the connection's key                                        |

The CSR:

- DER only: definite lengths in their shortest form, nothing after the outer element.
- Ed25519 key (`1.3.101.112`) and Ed25519 signature, the signature verifying over the
  `CertificationRequestInfo` with the CSR's own key (proof of possession).
- Exactly one URI subjectAltName, in an `extensionRequest` attribute, equal to `iss`; a URI name is
  1 to 255 characters from U+0021 to U+007E. Names of other kinds are ignored by the parser and
  refused by the issuing role. The subject is a CN derived from `iss` (every run of characters
  outside `[A-Za-z0-9._-]` becomes `-`, at most 64 characters), set by the builder and not checked
  by the verifier: it carries no authority, because identity comes from the pinned key, never from
  a name.

### 7.2 Server checks, in order

1. JWS structure and header; `typ` is `gmint-renew+jws`; look up `kid` among the keys of the
   listener's kind (client keys on the client listener, node keys on the node listener).
2. Signature over the raw signing input.
3. Strict payload parse, the rules of section 7.1, and the CSR's signature.
4. `iss` equals the key's owner, and the CSR's only URI equals `iss`; `aud`, `htu` equal the
   server's.
5. `iat` within 60 s.
6. `cb` equals the exporter the server measured on this connection.

Then the server's own: the connection's TLS key is one the caller's policy entry pins, and the CSR
is for that same key; the source address; `jti` unused; lockdown and quarantine; a renewal rate
limit. The certificate is issued for 7 days by the GMint intermediate, and the server checks that
what came back is for the connection's key before answering.

### 7.3 Response

`Content-Type: application/gmint-renew-res+jws`, a compact JWS with `typ` `gmint-renew-res+jws`,
signed with GMint's response key. Payload (strict JSON):

| Member     | Rule                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| `v`        | `1`                                                                                   |
| `req_hash` | b64url SHA-256 of the request JWS bytes exactly as received                           |
| `cb`       | The request's `cb`                                                                    |
| `iat`      | Within 60 s of the caller's clock                                                     |
| `status`   | `issued` or `refused`                                                                 |
| `code`     | Only when `refused`: a code of section 6 other than `approval_required`               |
| `chain`    | Only when `issued`: 1 to 4 b64url DER certificates, leaf first, each 64 to 2048 bytes |

Certificates are public, so nothing is sealed.

### 7.4 Caller checks, in order

1. JWS structure; `typ` is `gmint-renew-res+jws`; `kid` in the pinned server key set; signature.
2. Strict payload parse and the rules of section 7.3.
3. `req_hash` equals SHA-256 of the request the caller sent; `cb` equals its own exporter; `iat`
   within 60 s.
4. For `issued`: the leaf's public key is the caller's own TLS key; the leaf is not a CA; each
   certificate is signed by the next, which is a CA; the last is a pinned root or is signed by
   one; every certificate is valid now, a start up to 60 s in the future counting as valid. Only
   then is the chain written where the caller keeps its certificate, replacing the old one in one
   step.
