import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveKeyPair,
  encapForTest,
  generateX25519,
  open,
  scheduleForTest,
  seal,
  x25519PrivateFromRaw,
  x25519RawPublic,
  type Aead,
} from "./hpke";

// RFC 9180 base-mode vectors for DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, from the CFRG's
// test-vectors.json: AES-128-GCM (the RFC's Appendix A.1) and AES-256-GCM (the protocol's suite).
interface Vector {
  aead_id: number;
  info: string;
  ikmE: string;
  skEm: string;
  pkEm: string;
  skRm: string;
  pkRm: string;
  enc: string;
  shared_secret: string;
  key: string;
  base_nonce: string;
  exporter_secret: string;
  encryptions: { aad: string; ct: string; nonce: string; pt: string }[];
}
const vectors = JSON.parse(readFileSync(join(__dirname, "vectors.hpke.json"), "utf8")) as Vector[];
const hex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const AEADS: Record<number, Aead> = { 1: "aes-128-gcm", 2: "aes-256-gcm" };

describe.each(vectors.map((v) => [AEADS[v.aead_id]!, v] as const))(
  "RFC 9180 vector, %s",
  (aead, v) => {
    it("derives the ephemeral key pair from ikmE", () => {
      const { publicKey } = deriveKeyPair(hex(v.ikmE));
      expect(toHex(x25519RawPublic(publicKey))).toBe(v.pkEm);
    });

    it("encapsulates to the shared secret and schedules the key, nonce and exporter secret", () => {
      const shared = encapForTest(x25519PrivateFromRaw(hex(v.skEm)), hex(v.pkRm));
      expect(toHex(shared)).toBe(v.shared_secret);
      const ctx = scheduleForTest(aead, shared, hex(v.info));
      expect(toHex(ctx.key)).toBe(v.key);
      expect(toHex(ctx.baseNonce)).toBe(v.base_nonce);
      expect(toHex(ctx.exporterSecret)).toBe(v.exporter_secret);
    });

    it("seals and opens each encryption", () => {
      const ephemeral = deriveKeyPair(hex(v.ikmE));
      const skR = x25519PrivateFromRaw(hex(v.skRm));
      v.encryptions.forEach((e, seq) => {
        const sealed = seal(hex(v.pkRm), hex(v.info), hex(e.aad), hex(e.pt), {
          aead,
          ephemeral,
          seq,
        });
        expect(toHex(sealed.enc)).toBe(v.enc);
        expect(toHex(sealed.ct)).toBe(e.ct);
        expect(
          toHex(open(skR, sealed.enc, hex(v.info), hex(e.aad), hex(e.ct), { aead, seq })!),
        ).toBe(e.pt);
      });
    });
  },
);

describe("seal and open", () => {
  const r = generateX25519();
  const info = new TextEncoder().encode("gmint/v1/seal");
  const aad = new TextEncoder().encode("aad");
  const pt = new TextEncoder().encode("ghs_secret");

  it("round-trips with a fresh ephemeral key each time", () => {
    const a = seal(r.publicRaw, info, aad, pt);
    const b = seal(r.publicRaw, info, aad, pt);
    expect(toHex(a.enc)).not.toBe(toHex(b.enc));
    expect(open(r.privateKey, a.enc, info, aad, a.ct)).toEqual(pt);
  });

  it("fails on a wrong info, aad, key, enc or a flipped bit", () => {
    const s = seal(r.publicRaw, info, aad, pt);
    const other = generateX25519();
    expect(open(r.privateKey, s.enc, new TextEncoder().encode("x"), aad, s.ct)).toBeNull();
    expect(open(r.privateKey, s.enc, info, new TextEncoder().encode("x"), s.ct)).toBeNull();
    expect(open(other.privateKey, s.enc, info, aad, s.ct)).toBeNull();
    expect(open(r.privateKey, other.publicRaw, info, aad, s.ct)).toBeNull();
    const flipped = new Uint8Array(s.ct);
    flipped[0]! ^= 1;
    expect(open(r.privateKey, s.enc, info, aad, flipped)).toBeNull();
    expect(open(r.privateKey, s.enc, info, aad, s.ct.subarray(0, 10))).toBeNull();
  });

  it("refuses a low-order recipient key", () => {
    expect(() => seal(new Uint8Array(32), info, aad, pt)).toThrow();
    expect(open(r.privateKey, new Uint8Array(32), info, aad, new Uint8Array(32))).toBeNull();
  });
});
