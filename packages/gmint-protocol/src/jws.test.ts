import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { b64uDecode, b64uEncode, utf8Encode } from "./encoding";
import {
  ed25519PublicKey,
  localSigner,
  parseCompact,
  rawPublicKey,
  signCompact,
  verifyCompact,
} from "./jws";

// RFC 8037 Appendix A.1 and A.4.
const RFC_D = "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A";
const RFC_X = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const RFC_INPUT = "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc";
const RFC_SIG =
  "hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg";

describe("RFC 8037 vector", () => {
  it("signs the RFC's input to the RFC's signature", () => {
    const key = createPrivateKey({
      key: { kty: "OKP", crv: "Ed25519", d: RFC_D, x: RFC_X },
      format: "jwk",
    });
    expect(b64uEncode(new Uint8Array(sign(null, utf8Encode(RFC_INPUT), key)))).toBe(RFC_SIG);
    expect(b64uEncode(rawPublicKey(ed25519PublicKey(b64uDecode(RFC_X)!)))).toBe(RFC_X);
  });
});

describe("compact JWS", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = localSigner("client-1", privateKey);
  const resolve = (kid: string) => (kid === "client-1" ? publicKey : undefined);
  const payload = utf8Encode('{"hello":"world"}');

  it("signs and verifies", async () => {
    const jws = await signCompact("gmint-req+jws", payload, signer);
    const res = verifyCompact(jws, "gmint-req+jws", resolve);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.payload).toEqual(payload);
  });

  function forge(header: object, body = payload, sigFrom?: string): string {
    const h = b64uEncode(utf8Encode(JSON.stringify(header)));
    const p = b64uEncode(body);
    const s =
      sigFrom ?? b64uEncode(new Uint8Array(sign(null, utf8Encode(`${h}.${p}`), privateKey)));
    return `${h}.${p}.${s}`;
  }

  it.each([
    [{ alg: "none", typ: "gmint-req+jws", kid: "client-1" }, "jws_bad_header"],
    [{ alg: "HS256", typ: "gmint-req+jws", kid: "client-1" }, "jws_bad_header"],
    [{ alg: "ES256", typ: "gmint-req+jws", kid: "client-1" }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-req+jws" }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-req+jws", kid: "client-1", crit: ["b64"] }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-req+jws", kid: "client-1", jwk: {} }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-req+jws", kid: "client-1", jku: "https://x" }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-req+jws", kid: "../../etc" }, "jws_bad_header"],
    [{ alg: "EdDSA", typ: "gmint-res+jws", kid: "client-1" }, "jws_wrong_type"],
    [{ alg: "EdDSA", typ: "gmint-req+jws", kid: "stranger" }, "jws_unknown_key"],
  ])("refuses header %j with %s", (header, error) => {
    expect(verifyCompact(forge(header), "gmint-req+jws", resolve)).toEqual({ ok: false, error });
  });

  it("refuses a duplicate header member", () => {
    const h = b64uEncode(
      utf8Encode('{"alg":"EdDSA","typ":"gmint-req+jws","kid":"client-1","kid":"x"}'),
    );
    const p = b64uEncode(payload);
    const s = b64uEncode(new Uint8Array(sign(null, utf8Encode(`${h}.${p}`), privateKey)));
    expect(verifyCompact(`${h}.${p}.${s}`, "gmint-req+jws", resolve)).toEqual({
      ok: false,
      error: "jws_bad_header",
    });
  });

  it("refuses tampering, wrong keys and malformed structure", async () => {
    const jws = await signCompact("gmint-req+jws", payload, signer);
    const [h, p, s] = jws.split(".") as [string, string, string];
    const other = b64uEncode(utf8Encode('{"hello":"there"}'));
    expect(verifyCompact(`${h}.${other}.${s}`, "gmint-req+jws", resolve)).toEqual({
      ok: false,
      error: "jws_bad_signature",
    });
    const stranger = generateKeyPairSync("ed25519").publicKey;
    expect(verifyCompact(jws, "gmint-req+jws", () => stranger)).toEqual({
      ok: false,
      error: "jws_bad_signature",
    });
    for (const bad of [
      `${h}.${p}`,
      `${h}.${p}.${s}.x`,
      `${h}.${p}.${s}=`,
      `.${p}.${s}`,
      `${h}.${p}.AAAA`,
      "x".repeat(17000),
    ]) {
      expect(verifyCompact(bad, "gmint-req+jws", resolve).ok).toBe(false);
    }
  });

  it("parses without verifying only through parseCompact", async () => {
    const jws = await signCompact("gmint-req+jws", payload, signer);
    expect(parseCompact(jws, "gmint-req+jws").ok).toBe(true);
  });

  it("refuses a signer that returns the wrong length", async () => {
    await expect(
      signCompact("gmint-req+jws", payload, { kid: "k", sign: () => new Uint8Array(10) }),
    ).rejects.toThrow();
  });
});
