import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCsr, commonNameFor, csrPem, parseCsr } from "./csr";

// Made with `openssl req -new -key <ed25519> -subj /CN=gmint-gadvisory-api
// -addext subjectAltName=URI:gmint://gadvisory/api -outform DER` (OpenSSL 3.6), the shape
// `gmint-ops enrol` produces.
const OPENSSL_CSR =
  "MIHRMIGEAgEAMB4xHDAaBgNVBAMME2dtaW50LWdhZHZpc29yeS1hcGkwKjAFBgMrZXADIQBwGsGQBWkISQ8Ps6UD3F5IZbA2R4Tyc6/1nbficdMK3aAzMDEGCSqGSIb3DQEJDjEkMCIwIAYDVR0RBBkwF4YVZ21pbnQ6Ly9nYWR2aXNvcnkvYXBpMAUGAytlcANBAOsnDrRkbY9625UsxmiyYqpVnYTW/K/JQNbO3MVQtfOvkbq+p3d2f/a+bv/mrKjRforbGO6fkYEQwpQTdwXc1gE=";
const OPENSSL_SPKI = "MCowBQYDK2VwAyEAcBrBkAVpCEkPD7OlA9xeSGWwNkeE8nOv9Z234nHTCt0=";

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const key = generateKeyPairSync("ed25519");
const spkiOf = (k: typeof key.publicKey) =>
  new Uint8Array(k.export({ type: "spki", format: "der" }));

describe("CSR", () => {
  it("reads an openssl CSR: its key and its URI name", () => {
    expect(parseCsr(b64(OPENSSL_CSR))).toEqual({
      spki: b64(OPENSSL_SPKI),
      uris: ["gmint://gadvisory/api"],
    });
  });

  it("round-trips its own CSR", () => {
    const der = buildCsr(key.privateKey, "node://homelab-1");
    expect(parseCsr(der)).toEqual({ spki: spkiOf(key.publicKey), uris: ["node://homelab-1"] });
    expect(csrPem(der)).toMatch(
      /^-----BEGIN CERTIFICATE REQUEST-----\n[A-Za-z0-9+/=\n]+-----END CERTIFICATE REQUEST-----\n$/,
    );
    expect(commonNameFor("gmint://gadvisory/api")).toBe("gmint-gadvisory-api");
  });

  it("refuses a CSR whose signature does not match its key", () => {
    const der = buildCsr(key.privateKey, "gmint://gadvisory/api");
    const flipped = der.slice();
    flipped[flipped.length - 1]! ^= 1;
    expect(parseCsr(flipped)).toBeNull();
    // Another key's SPKI swapped in: the signature no longer verifies.
    const other = spkiOf(generateKeyPairSync("ed25519").publicKey);
    const own = spkiOf(key.publicKey);
    const at = Buffer.from(der).indexOf(Buffer.from(own));
    const swapped = der.slice();
    swapped.set(other, at);
    expect(parseCsr(swapped)).toBeNull();
  });

  it("refuses anything that is not strict DER of the expected shape", () => {
    const der = buildCsr(key.privateKey, "gmint://gadvisory/api");
    expect(parseCsr(der.subarray(0, der.length - 1))).toBeNull(); // truncated
    expect(parseCsr(new Uint8Array([...der, 0]))).toBeNull(); // trailing byte
    expect(parseCsr(new Uint8Array(2000))).toBeNull(); // oversize
    // A non-minimal length: 0x81 for a length below 128.
    const inner = der.subarray(3); // the outer header is 30 81 xx
    expect(der[1]).toBe(0x81);
    const longForm = new Uint8Array([0x30, 0x82, 0x00, inner.length, ...inner]);
    expect(parseCsr(longForm)).toBeNull();
    // Indefinite length (BER).
    expect(parseCsr(new Uint8Array([0x30, 0x80, ...inner, 0, 0]))).toBeNull();
  });

  it("writes only Ed25519 CSRs", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
    expect(() => buildCsr(rsa.privateKey, "gmint://a/b")).toThrow(/Ed25519/);
    expect(() => buildCsr(key.privateKey, "has space")).toThrow(/URI/);
    // The public half of an openssl key parses the same way Node exports it.
    expect(
      createPublicKey(
        createPrivateKey(key.privateKey.export({ type: "pkcs8", format: "pem" })),
      ).export({ type: "spki", format: "der" }).length,
    ).toBe(44);
  });
});
