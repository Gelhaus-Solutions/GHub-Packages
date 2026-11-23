import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { softwareSkEcdsaSigner } from "./testing";
import { WireReader, concat, wireString } from "./wire";
import {
  ED25519,
  FLAG_USER_PRESENT,
  FLAG_USER_VERIFIED,
  SK_ECDSA_P256,
  SK_ED25519,
  parsePublicKey,
  parsePublicKeyBlob,
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

// A real signature by a Secure Enclave key (sk-ecdsa-sha2-nistp256) over a git commit object,
// made with `ssh-keygen -Y sign -n git`; `ssh-keygen -Y verify` says Good.
const SE_PUB =
  "sk-ecdsa-sha2-nistp256@openssh.com AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb20AAAAIbmlzdHAyNTYAAABBBAsBoP+FnDMbcEH7YUcokscRzmqf08qI1+AofpA73duwQe6LsOwntXgw8e+H4kpqTnyqtBCi5jk1BLijUM74yVkAAAAEc3NoOg== ssh:";
const SE_SIGNERS = `operator@secure-enclave-away namespaces="git" ${SE_PUB}`;
const SE_PAYLOAD = new TextEncoder().encode(
  [
    "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    "author away test <away@example.invalid> 1763930000 +0100",
    "committer away test <away@example.invalid> 1763930000 +0100",
    "",
    "away signature fixture",
    "",
  ].join("\n"),
);
const SE_SIG = [
  "-----BEGIN SSH SIGNATURE-----",
  "U1NIU0lHAAAAAQAAAH8AAAAic2stZWNkc2Etc2hhMi1uaXN0cDI1NkBvcGVuc3NoLmNvbQ",
  "AAAAhuaXN0cDI1NgAAAEEECwGg/4WcMxtwQfthRyiSxxHOap/TyojX4Ch+kDvd27BB7ouw",
  "7Ce1eDDx74fiSmpOfKq0EKLmOTUEuKNQzvjJWQAAAARzc2g6AAAAA2dpdAAAAAAAAAAGc2",
  "hhNTEyAAAAeQAAACJzay1lY2RzYS1zaGEyLW5pc3RwMjU2QG9wZW5zc2guY29tAAAASgAA",
  "ACEAtMd+Co7Sc56LyTA9H1x8tAsPVqUMcVX6e9NPqXQCi6kAAAAhAL92n4PO4i1F931Z25",
  "w6c1t0HauqIpSHKtQypqUnDMOBIQAAAAE=",
  "-----END SSH SIGNATURE-----",
  "",
].join("\n");

interface SshsigFields {
  publicKey: Uint8Array;
  namespace: Uint8Array;
  reserved: Uint8Array;
  hash: Uint8Array;
  sig: Uint8Array;
}

function unarmor(armored: string): SshsigFields {
  const b64 = armored.trim().split("\n").slice(1, -1).join("");
  const r = new WireReader(new Uint8Array(Buffer.from(b64, "base64")));
  r.raw(6);
  r.uint32();
  const next = () => r.string()!;
  return { publicKey: next(), namespace: next(), reserved: next(), hash: next(), sig: next() };
}

function armor(f: SshsigFields): string {
  const outer = concat(
    new TextEncoder().encode("SSHSIG"),
    new Uint8Array([0, 0, 0, 1]),
    wireString(f.publicKey),
    wireString(f.namespace),
    wireString(f.reserved),
    wireString(f.hash),
    wireString(f.sig),
  );
  const b64 = Buffer.from(outer)
    .toString("base64")
    .replace(/(.{70})/g, "$1\n");
  return `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----\n`;
}

/** An sk-ecdsa signature with its r and s re-encoded, or its flags or counter replaced. */
function rewriteEcdsa(
  armored: string,
  edit: { rs?: (r: Uint8Array, s: Uint8Array) => Uint8Array; flags?: number; counter?: number },
): string {
  const f = unarmor(armored);
  const outer = new WireReader(f.sig);
  const type = outer.string()!;
  const inner = new WireReader(outer.string()!);
  const r = inner.string()!;
  const s = inner.string()!;
  const flags = outer.byte()!;
  const counter = outer.uint32()!;
  const tail = new Uint8Array(5);
  tail[0] = edit.flags ?? flags;
  new DataView(tail.buffer).setUint32(1, edit.counter ?? counter);
  const ecdsa = edit.rs ? edit.rs(r, s) : concat(wireString(r), wireString(s));
  return armor({ ...f, sig: concat(wireString(type), wireString(ecdsa), tail) });
}

describe("sk-ecdsa-sha2-nistp256", () => {
  const se = parsePublicKey(SE_PUB);
  if (!se.ok) throw new Error(se.error);
  const real = { signature: SE_SIG, message: SE_PAYLOAD, namespace: "git", allowed: [se.value] };

  it("parses the Secure Enclave key and its allowed_signers line", () => {
    expect(se.value).toMatchObject({ type: SK_ECDSA_P256, application: "ssh:", comment: "ssh:" });
    expect(se.value.key.length).toBe(65);
    expect(se.value.key[0]).toBe(0x04);
    const line = parsePublicKey(SE_SIGNERS);
    expect(line.ok && Buffer.from(line.value.blob).equals(Buffer.from(se.value.blob))).toBe(true);
  });

  it("verifies the real signature and reports its flags and counter", () => {
    expect(verifySshsig(real)).toEqual({
      ok: true,
      value: { key: se.value, flags: 0x21, counter: 1 },
    });
  });

  it("refuses a tampered payload and the wrong namespace", () => {
    const tampered = new Uint8Array(SE_PAYLOAD);
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 1;
    expect(verifySshsig({ ...real, message: tampered })).toEqual({
      ok: false,
      error: "bad_signature",
    });
    expect(verifySshsig({ ...real, namespace: NS })).toEqual({
      ok: false,
      error: "wrong_namespace",
    });
  });

  it("refuses a changed flags byte or counter", () => {
    // 0x25 keeps user presence, so only the signature can refuse it.
    for (const edit of [{ flags: 0x25 }, { flags: 0x20 }, { counter: 2 }, { counter: 0 }]) {
      expect(verifySshsig({ ...real, signature: rewriteEcdsa(SE_SIG, edit) })).toEqual({
        ok: false,
        error: "bad_signature",
      });
    }
  });

  it("takes only minimal, positive r and s that fit 32 bytes", () => {
    expect(verifySshsig({ ...real, signature: rewriteEcdsa(SE_SIG, {}) }).ok).toBe(true);
    const zero = new Uint8Array([0]);
    const cases: ((r: Uint8Array, s: Uint8Array) => Uint8Array)[] = [
      // A second leading zero.
      (r, s) => concat(wireString(concat(zero, r)), wireString(s)),
      // The sign byte dropped: negative.
      (r, s) => concat(wireString(r.subarray(1)), wireString(s)),
      // 33 bytes of magnitude.
      (r, s) => concat(wireString(concat(new Uint8Array([1]), r.subarray(1))), wireString(s)),
      // Zero.
      (_r, s) => concat(wireString(new Uint8Array(0)), wireString(s)),
      // Trailing bytes after s.
      (r, s) => concat(wireString(r), wireString(s), zero),
      // r alone.
      (r) => wireString(r),
    ];
    for (const rs of cases) {
      expect(verifySshsig({ ...real, signature: rewriteEcdsa(SE_SIG, { rs }) })).toEqual({
        ok: false,
        error: "malformed_signature",
      });
    }
  });

  it("does not mix sk-ecdsa and sk-ssh-ed25519", () => {
    const yk = skSigner();
    const edSig = yk.signArmored(SE_PAYLOAD, { namespace: "git" });
    expect(verifySshsig({ ...real, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "key_not_allowed",
    });
    expect(verifySshsig({ ...real, signature: edSig })).toEqual({
      ok: false,
      error: "key_not_allowed",
    });
    // The enrolled key with the other type's signature inside.
    const ecdsaKeyEdSig = armor({ ...unarmor(SE_SIG), sig: unarmor(edSig).sig });
    expect(verifySshsig({ ...real, signature: ecdsaKeyEdSig })).toEqual({
      ok: false,
      error: "malformed_signature",
    });
    const edKeyEcdsaSig = armor({ ...unarmor(edSig), sig: unarmor(SE_SIG).sig });
    expect(verifySshsig({ ...real, signature: edKeyEcdsaSig, allowed: [yk.key] })).toEqual({
      ok: false,
      error: "malformed_signature",
    });
  });

  describe("software stand-in", () => {
    const sk = softwareSkEcdsaSigner();

    it("verifies and applies the same flag policy as sk-ssh-ed25519", () => {
      const opts = { message, namespace: NS, allowed: [sk.key] };
      expect(
        verifySshsig({ ...opts, signature: sk.sign(message, NS, { counter: 9 }) }),
      ).toMatchObject({ ok: true, value: { flags: FLAG_USER_PRESENT, counter: 9 } });
      expect(verifySshsig({ ...opts, signature: sk.sign(message, NS, { flags: 0 }) })).toEqual({
        ok: false,
        error: "user_presence_required",
      });
      expect(
        verifySshsig({ ...opts, signature: sk.sign(message, NS), requireUserVerification: true }),
      ).toEqual({ ok: false, error: "user_verification_required" });
      const uv = sk.sign(message, NS, { flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED });
      expect(verifySshsig({ ...opts, signature: uv, requireUserVerification: true }).ok).toBe(true);
      expect(
        verifySshsig({ ...opts, signature: softwareSkEcdsaSigner().sign(message, NS) }),
      ).toEqual({ ok: false, error: "key_not_allowed" });
    });

    it.runIf(hasSshKeygen())("is the format OpenSSH itself verifies", () => {
      const sigFile = join(dir, "msg-ecdsa.sig");
      const signers = join(dir, "allowed_signers_ecdsa");
      writeFileSync(sigFile, sk.sign(message, NS));
      writeFileSync(signers, `enno namespaces="${NS}" ${sk.line}\n`);
      const out = execFileSync(
        "ssh-keygen",
        ["-Y", "verify", "-f", signers, "-I", "enno", "-n", NS, "-s", sigFile],
        { input: message, encoding: "utf8" },
      );
      expect(out).toContain("Good");
    });
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
    expect(parsePublicKey(yk.line.replace(SK_ED25519, SK_ECDSA_P256)).ok).toBe(false);
    expect(parsePublicKey(SE_PUB.replace(SK_ECDSA_P256, SK_ED25519)).ok).toBe(false);
  });

  it("refuses sk-ecdsa blobs with another curve, a bad point or extra bytes", () => {
    const se = parsePublicKey(SE_PUB);
    if (!se.ok) throw new Error(se.error);
    const point = se.value.key;
    const blob = (
      type: string,
      curve: string,
      q: Uint8Array,
      app = "ssh:",
      extra = new Uint8Array(0),
    ) => concat(wireString(type), wireString(curve), wireString(q), wireString(app), extra);
    expect(parsePublicKeyBlob(blob(SK_ECDSA_P256, "nistp256", point)).ok).toBe(true);

    const offCurve = new Uint8Array(point);
    offCurve[64] = offCurve[64]! ^ 1;
    const compressed = concat(new Uint8Array([0x02 | (point[64]! & 1)]), point.subarray(1, 33));
    const malformed = [
      blob(SK_ECDSA_P256, "nistp384", point),
      blob(SK_ECDSA_P256, "nistp256", offCurve),
      blob(SK_ECDSA_P256, "nistp256", compressed),
      blob(SK_ECDSA_P256, "nistp256", concat(new Uint8Array([0x05]), point.subarray(1))),
      blob(SK_ECDSA_P256, "nistp256", point.subarray(1)),
      blob(SK_ECDSA_P256, "nistp256", concat(new Uint8Array([0x04]), new Uint8Array(64))),
      blob(SK_ECDSA_P256, "nistp256", point, "ssh:", new Uint8Array([0])),
      concat(wireString(SK_ECDSA_P256), wireString("nistp256"), wireString(point)),
    ];
    for (const b of malformed) {
      expect(parsePublicKeyBlob(b)).toEqual({ ok: false, error: "malformed_public_key" });
    }
    for (const type of ["sk-ecdsa-sha2-nistp384@openssh.com", "ecdsa-sha2-nistp256"]) {
      expect(parsePublicKeyBlob(blob(type, "nistp256", point))).toEqual({
        ok: false,
        error: "unsupported_key_type",
      });
    }
  });
});
