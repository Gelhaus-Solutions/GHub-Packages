# GMint wire protocol, version 1

This is the normative description of the bytes a GMint client and a GMint server exchange for one
mint. `src/messages.ts` is its implementation and `src/*.test.ts` its executable checks.

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

| Member | Type    | Rule                                                                           |
| ------ | ------- | ------------------------------------------------------------------------------ |
| `v`    | integer | `1`                                                                            |
| `iss`  | string  | The client id, `gmint://<namespace>/<workload>`; must equal the owner of `kid` |
| `aud`  | string  | `gmint:<instance>`; must equal the server's instance                           |
| `htm`  | string  | `POST`                                                                         |
| `htu`  | string  | The exact URL, `https://`, at most 256 characters                              |
| `iat`  | integer | Seconds since the epoch; within 60 s of the server's clock                     |
| `jti`  | string  | b64url of 16 random bytes; never seen before by the server                     |
| `seq`  | integer | At least 1; per client, unseen and within the server's sequence window         |
| `cb`   | string  | b64url tls-exporter of the connection the request is sent on                   |
| `enc`  | string  | b64url X25519 public key (32 bytes), fresh per request, for the answer         |
| `req`  | object  | What is asked for, below                                                       |

`req`: exactly `provider`, `grant`, `scope`, optionally `tenant` and `purpose`.

| Member                  | Rule                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| `provider`              | `github`                                                                       |
| `grant`                 | `[a-z0-9][a-z0-9._-]{0,63}`, the grant id in the server's policy               |
| `scope.installation_id` | Positive integer                                                               |
| `scope.repository_ids`  | 1 to 500 positive integers, strictly ascending                                 |
| `scope.permissions`     | 1 to 64 members, names `[a-z][a-z_]{0,63}`, values `read`, `write` or `admin`  |
| `tenant`                | `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`, the tenant a multi-tenant client acts for |
| `purpose`               | 1 to 200 characters, no control characters                                     |

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
| `seal`       | Only when `issued`: `{ "enc": <b64url 32 bytes>, "ct": <b64url> }`                                   |

### 5.1 Seal

HPKE (RFC 9180) base mode, single shot, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM, to
the request's `enc` key:

- `info` = ASCII `gmint/v1/seal` followed by the 32 bytes of `req_hash`.
- `aad` = `lp(client kid) || lp(server kid) || req_hash`, where `lp` is a two-byte big-endian
  length followed by the UTF-8 bytes.

Plaintext (strict JSON, exactly these members):

| Member       | Rule                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `credential` | 1 to 4096 printable ASCII characters (opaque; GitHub's token format is variable)  |
| `expires_at` | RFC 3339 UTC timestamp                                                            |
| `scope`      | The scope granted, same shape as the request's                                    |
| `hashed`     | b64url SHA-256 of `credential`, the value GitHub's audit log calls `hashed_token` |

### 5.2 Client checks, in order

1. JWS structure; `typ` is `gmint-res+jws`; `kid` in the client's pinned server key set; signature.
2. Strict payload parse and the rules of section 5.
3. `req_hash` equals SHA-256 of the request the client sent.
4. `cb` equals the client's own exporter.
5. `iat` within 60 s.
6. For `issued`: open the seal; the plaintext parses; `hashed` matches `credential`; the granted
   scope is within the requested one (same installation, a subset of the repositories, no
   permission above what was asked).

## 6. Codes

`denied`, `bad_request`, `replay`, `clock`, `quarantined`, `rate_limited`, `witness_stale`,
`approval_required`, `approval_unavailable`, `locked_down`, `unavailable`, `provider_error`.
Every authorization failure is `denied`. `unavailable`, `rate_limited` and `clock` may be retried
unchanged later; nothing else should be.
