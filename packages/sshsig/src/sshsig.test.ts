import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { concat, wireString } from "./wire";
import {
  ED25519,
  FLAG_USER_PRESENT,
  FLAG_USER_VERIFIED,
  SK_ED25519,
  parsePublicKey,
  signedData,
  verifySshsig,
  type SshPublicKey,
} from "./index";

const NS = "gmint-policy";
const message = new TextEncoder().encode('{"version":42}');
const dir = mkdtempSync(join(tmpdir(), "gmint-sshsig-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function hasSshKeygen(): boolean {
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
    return true;
  } catch (e) {
    // ssh-keygen -? exits non-zero but exists; ENOENT means it is missing.
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function rawPublic(key: KeyObject): Uint8Array {
  return new Uint8Array(Buffer.from(key.export({ format: "jwk" }).x as string, "base64url"));
}

/** A software stand-in for a FIDO2 authenticator: the same bytes a YubiKey would sign. */
function skSigner(application = "ssh:") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = concat(
    wireString(SK_ED25519),
    wireString(rawPublic(publicKey)),
    wireString(application),
  );
  const line = `${SK_ED25519} ${Buffer.from(blob).toString("base64")} test-yk`;
  const signArmored = (
    msg: Uint8Array,
    opts: {
      namespace?: string;
      flags?: number;
      counter?: number;
      hash?: string;
      version?: number;
      reserved?: Uint8Array;
      trailing?: boolean;
    } = {},
  ) => {
    const ns = opts.namespace ?? NS;
    const hash = opts.hash ?? "sha512";
    const flags = opts.flags ?? FLAG_USER_PRESENT;
    const counter = opts.counter ?? 7;
    const data = signedData(ns, hash, msg);
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter);
    const sha = (d: Uint8Array) => new Uint8Array(createHash("sha256").update(d).digest());
    const covered = concat(
      sha(new TextEncoder().encode(application)),
      new Uint8Array([flags]),
      counterBytes,
      sha(data),
    );
    const raw = new Uint8Array(sign(null, covered, privateKey));
    const sigBlob = concat(
      wireString(SK_ED25519),
      wireString(raw),
      new Uint8Array([flags]),
      counterBytes,
    );
    const version = new Uint8Array(4);
    new DataView(version.buffer).setUint32(0, opts.version ?? 1);
    const outer = concat(
      new TextEncoder().encode("SSHSIG"),
      version,
      wireString(blob),
      wireString(ns),
      wireString(opts.reserved ?? new Uint8Array(0)),
      wireString(hash),
      wireString(sigBlob),
      opts.trailing ? new Uint8Array([0]) : new Uint8Array(0),
    );
    const b64 = Buffer.from(outer)
      .toString("base64")
      .replace(/(.{70})/g, "$1\n");
    return `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----\n`;
  };
  const parsed = parsePublicKey(line);
  if (!parsed.ok) throw new Error(parsed.error);
  return { line, key: parsed.value, signArmored };
}

describe("sk-ssh-ed25519", () => {
  const yk = skSigner();

  it("verifies a hardware-shaped signature and reports flags and counter", () => {
    const res = verifySshsig({
      signature: yk.signArmored(message),
      message,
      namespace: NS,
      allowed: [yk.key],
    });
    expect(res).toMatchObject({ ok: true, value: { flags: FLAG_USER_PRESENT, counter: 7 } });
  });

  it.runIf(hasSshKeygen())("is the format OpenSSH itself verifies", () => {
    const msgFile = join(dir, "msg");
    const sigFile = join(dir, "msg.sig");
    const signers = join(dir, "allowed_signers");
    writeFileSync(msgFile, message);
    writeFileSync(sigFile, yk.signArmored(message));
    writeFileSync(signers, `enno namespaces="${NS}" ${yk.line}\n`);
    const out = execFileSync(
      "ssh-keygen",
      ["-Y", "verify", "-f", signers, "-I", "enno", "-n", NS, "-s", sigFile],
      { input: readFileSync(msgFile), encoding: "utf8" },
    );
    expect(out).toContain("Good");
  });

  it("refuses a signature without user presence", () => {
    const signature = yk.signArmored(message, { flags: 0 });
    expect(verifySshsig({ signature, message, namespace: NS, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "user_presence_required",
    });
  });

  it("can require user verification", () => {
    const signature = yk.signArmored(message);
    expect(
      verifySshsig({
        signature,
        message,
        namespace: NS,
        allowed: [yk.key],
        requireUserVerification: true,
      }),
    ).toEqual({ ok: false, error: "user_verification_required" });
    const verified = yk.signArmored(message, { flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED });
    expect(
      verifySshsig({
        signature: verified,
        message,
        namespace: NS,
        allowed: [yk.key],
        requireUserVerification: true,
      }).ok,
    ).toBe(true);
  });

  it("refuses a tampered message", () => {
    const signature = yk.signArmored(message);
    const other = new TextEncoder().encode('{"version":43}');
    expect(verifySshsig({ signature, message: other, namespace: NS, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("refuses the wrong namespace", () => {
    const signature = yk.signArmored(message, { namespace: "gmint-lockdown" });
    expect(verifySshsig({ signature, message, namespace: NS, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "wrong_namespace",
    });
  });

  it("refuses a key that is not allowed", () => {
    const stranger = skSigner();
    const signature = stranger.signArmored(message);
    expect(verifySshsig({ signature, message, namespace: NS, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "key_not_allowed",
    });
  });

  it("verifies with what the enrolled blob says, not with edited fields of the key object", () => {
    const signature = yk.signArmored(message);
    const edited: SshPublicKey = { ...yk.key, application: "ssh:other" };
    expect(verifySshsig({ signature, message, namespace: NS, allowed: [edited] })).toMatchObject({
      ok: true,
      value: { key: { application: "ssh:" } },
    });
  });

  it("refuses a signature made for another application", () => {
    const other = skSigner("ssh:other");
    const forged = { ...other.key, blob: yk.key.blob };
    // A blob is enrolled as a whole: the application inside it is part of what is pinned.
    expect(
      verifySshsig({
        signature: other.signArmored(message),
        message,
        namespace: NS,
        allowed: [forged],
      }).ok,
    ).toBe(false);
  });

  it("refuses version 2, a non-empty reserved field, trailing bytes and unknown hashes", () => {
    const cases: [Parameters<typeof yk.signArmored>[1], string][] = [
      [{ version: 2 }, "unsupported_version"],
      [{ reserved: new Uint8Array([1]) }, "malformed_signature"],
      [{ trailing: true }, "malformed_signature"],
      [{ hash: "sha1" }, "unsupported_hash"],
    ];
    for (const [opts, error] of cases) {
      const signature = yk.signArmored(message, opts);
      expect(verifySshsig({ signature, message, namespace: NS, allowed: [yk.key] })).toEqual({
        ok: false,
        error,
      });
    }
  });

  it("refuses broken armor and non-canonical base64", () => {
    const good = yk.signArmored(message);
    const cases = [
      good.replace("BEGIN SSH SIGNATURE", "BEGIN SIGNATURE"),
      good.replace(/\n(.)/, "\n*"),
      "",
      "-----BEGIN SSH SIGNATURE-----\n-----END SSH SIGNATURE-----",
    ];
    for (const signature of cases) {
      expect(verifySshsig({ signature, message, namespace: NS, allowed: [yk.key] }).ok).toBe(false);
    }
  });
});

describe.runIf(hasSshKeygen())("ssh-ed25519 from ssh-keygen", () => {
  const keyFile = join(dir, "id_ed25519");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "soft", "-f", keyFile]);
  const pub = parsePublicKey(readFileSync(`${keyFile}.pub`, "utf8"));
  if (!pub.ok) throw new Error(pub.error);
  writeFileSync(join(dir, "m"), message);
  execFileSync("ssh-keygen", ["-q", "-Y", "sign", "-f", keyFile, "-n", NS, join(dir, "m")]);
  const signature = readFileSync(join(dir, "m.sig"), "utf8");

  it("verifies a real OpenSSH signature when software keys are allowed", () => {
    expect(pub.value.type).toBe(ED25519);
    const res = verifySshsig({
      signature,
      message,
      namespace: NS,
      allowed: [pub.value],
      allowSoftwareKeys: true,
    });
    expect(res).toMatchObject({ ok: true, value: { flags: 0, counter: 0 } });
  });

  it("refuses software keys by default", () => {
    expect(verifySshsig({ signature, message, namespace: NS, allowed: [pub.value] })).toEqual({
      ok: false,
      error: "unsupported_key_type",
    });
  });
});

describe("parsePublicKey", () => {
  it("parses allowed_signers lines and refuses junk", () => {
    const yk = skSigner();
    expect(parsePublicKey(`enno namespaces="gmint-policy" ${yk.line}`).ok).toBe(true);
    expect(parsePublicKey("ssh-rsa AAAAB3NzaC1yc2E= x")).toEqual({
      ok: false,
      error: "malformed_public_key",
    });
    expect(parsePublicKey(`${SK_ED25519} not*base64`)).toEqual({
      ok: false,
      error: "malformed_public_key",
    });
    // A type token that does not match the blob inside.
    expect(parsePublicKey(yk.line.replace(SK_ED25519, ED25519)).ok).toBe(false);
  });
});
