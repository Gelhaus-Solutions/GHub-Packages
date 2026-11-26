import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  softwareCertificate,
  softwareEd25519Signer,
  softwarePasskey,
  softwareSkSigner,
  type SignOptions,
} from "./testing";
import { concat, wireString } from "./wire";
import {
  FLAG_USER_PRESENT,
  FLAG_USER_VERIFIED,
  SK_ECDSA_P256,
  signedData,
  verifySshsig,
  type VerifyOptions,
} from "./index";

const NS = "git";
const PRINCIPAL = "operator@yubikey-git";
const message = new TextEncoder().encode("tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\n");
const dir = mkdtempSync(join(tmpdir(), "sshsig-passkey-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function hasSshKeygen(): boolean {
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

/** OpenSSH's own verdict on a signature, without the operator's agent. */
function opensshVerifies(signature: string, signersLine: string): boolean {
  const sig = join(dir, `${Math.random()}.sig`);
  const signers = join(dir, `${Math.random()}.signers`);
  writeFileSync(sig, signature);
  writeFileSync(signers, `${signersLine}\n`);
  try {
    const out = execFileSync(
      "ssh-keygen",
      ["-Y", "verify", "-f", signers, "-I", PRINCIPAL, "-n", NS, "-s", sig],
      { input: message, encoding: "utf8", env: { ...process.env, SSH_AUTH_SOCK: "" } },
    );
    return out.includes("Good");
  } catch {
    return false;
  }
}

describe("a passkey as certificate authority", () => {
  const passkey = softwarePasskey("launcher.example.de");
  const authorities = [{ key: passkey.key, principals: [PRINCIPAL] }];
  const session = softwareEd25519Signer("session");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const certified = (authority: SignOptions = {}) =>
    softwareCertificate(passkey, session, {
      principals: [PRINCIPAL],
      validAfter: now - 60n,
      validBefore: now + 8n * 3600n,
      authority,
    });
  const verify = (signature: string, extra: Partial<VerifyOptions> = {}) =>
    verifySshsig({
      signature,
      message,
      namespace: NS,
      allowed: [],
      authorities,
      allowWebauthn: true,
      ...extra,
    });

  it("is an sk-ecdsa key whose application is the RP ID", () => {
    expect(passkey.key).toMatchObject({ type: SK_ECDSA_P256, application: "launcher.example.de" });
  });

  it("vouches for a session key through its browser signature", () => {
    expect(verify(certified().sign(message, NS))).toMatchObject({
      ok: true,
      value: { certificate: { flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED, counter: 0 } },
    });
  });

  it.runIf(hasSshKeygen())("is what OpenSSH verifies through a cert-authority line", () => {
    const line = `${PRINCIPAL} cert-authority,namespaces="${NS}" ${passkey.line}`;
    expect(opensshVerifies(certified().sign(message, NS), line)).toBe(true);
    const changed = certified({
      clientData: (c, o) => `{"type":"webauthn.get","challenge":"${c}x","origin":"${o}"}`,
    });
    expect(opensshVerifies(changed.sign(message, NS), line)).toBe(false);
  });

  it("counts only where the caller allows passkey signatures", () => {
    expect(verify(certified().sign(message, NS), { allowWebauthn: undefined })).toEqual({
      ok: false,
      error: "webauthn_not_allowed",
    });
  });

  it("requires user presence, as for any sk- key", () => {
    const signature = certified({ flags: FLAG_USER_VERIFIED }).sign(message, NS);
    expect(verify(signature)).toEqual({ ok: false, error: "user_presence_required" });
  });

  it("takes fields after type, challenge and origin, but nothing else in their place", () => {
    const extra = certified({
      clientData: (c, o) =>
        `{"type":"webauthn.get","challenge":"${c}","origin":"${o}","crossOrigin":false,"other":1}`,
    });
    expect(verify(extra.sign(message, NS)).ok).toBe(true);
    const refused: ((c: string, o: string) => string)[] = [
      (c, o) => `{"type":"webauthn.create","challenge":"${c}","origin":"${o}"}`,
      (c, o) => `{"challenge":"${c}","type":"webauthn.get","origin":"${o}"}`,
      (c, o) => `{"type":"webauthn.get","challenge":"${c.slice(1)}","origin":"${o}"}`,
      (c) => `{"type":"webauthn.get","challenge":"${c}","origin":"https://elsewhere.example"}`,
      (c) => `{"type":"webauthn.get","challenge":"${c}"}`,
    ];
    for (const clientData of refused) {
      expect(verify(certified({ clientData }).sign(message, NS))).toEqual({
        ok: false,
        error: "malformed_certificate",
      });
    }
  });

  it("refuses attested data, and extension data the flags do not announce", () => {
    for (const flags of [0x45, 0x85]) {
      expect(verify(certified({ flags }).sign(message, NS))).toEqual({
        ok: false,
        error: "malformed_certificate",
      });
    }
  });
});

describe("a passkey signing itself", () => {
  const passkey = softwarePasskey("launcher.example.de");
  const verify = (signature: string, allowWebauthn = true) =>
    verifySshsig({ signature, message, namespace: NS, allowed: [passkey.key], allowWebauthn });

  it("verifies only when allowed", () => {
    const signature = passkey.sign(message, NS);
    expect(verify(signature).ok).toBe(true);
    expect(verify(signature, false)).toEqual({ ok: false, error: "webauthn_not_allowed" });
  });

  it.runIf(hasSshKeygen())("is what OpenSSH verifies with a plain line", () => {
    expect(
      opensshVerifies(passkey.sign(message, NS), `${PRINCIPAL} namespaces="${NS}" ${passkey.line}`),
    ).toBe(true);
  });

  it("is never read as another key type's signature", () => {
    // The passkey's browser signature inside an SSHSIG naming a YubiKey's sk-ed25519 key.
    const yk = softwareSkSigner("yk");
    const sig = passkey.signRaw(signedData(NS, "sha512", message));
    const outer = concat(
      new TextEncoder().encode("SSHSIG"),
      new Uint8Array([0, 0, 0, 1]),
      wireString(yk.key.blob),
      wireString(NS),
      wireString(new Uint8Array(0)),
      wireString("sha512"),
      wireString(sig),
    );
    const signature = `-----BEGIN SSH SIGNATURE-----\n${Buffer.from(outer).toString("base64")}\n-----END SSH SIGNATURE-----\n`;
    expect(
      verifySshsig({ signature, message, namespace: NS, allowed: [yk.key], allowWebauthn: true }),
    ).toEqual({ ok: false, error: "malformed_signature" });
  });
});
