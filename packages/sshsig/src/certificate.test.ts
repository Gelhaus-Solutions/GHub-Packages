import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  softwareCertificate,
  softwareEd25519Signer,
  softwareSkSigner,
  type CertificateOptions,
} from "./testing";
import { concat, wireString } from "./wire";
import {
  CERT_TYPE_HOST,
  ED25519,
  ED25519_CERT,
  FLAG_USER_PRESENT,
  SK_ED25519,
  parseAllowedSigner,
  parseCertificateBlob,
  parsePublicKey,
  signedData,
  signersFor,
  verifySshsig,
  type CertificateAuthority,
  type VerifyOptions,
} from "./index";

const NS = "git";
const PRINCIPAL = "operator@yubikey-git";
const message = new TextEncoder().encode("tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\n");
const dir = mkdtempSync(join(tmpdir(), "sshsig-cert-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function hasSshKeygen(): boolean {
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

/** ssh-keygen without the operator's agent, so nothing on the laptop is asked for a touch. */
function keygen(args: string[], input?: Uint8Array): string {
  return execFileSync("ssh-keygen", args, {
    env: { ...process.env, SSH_AUTH_SOCK: "" },
    encoding: "utf8",
    ...(input ? { input } : {}),
  });
}

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

describe("certificates from a hardware authority", () => {
  const ca = softwareSkSigner("yubikey-git");
  const authorities: CertificateAuthority[] = [{ key: ca.key, principals: [PRINCIPAL] }];
  const session = softwareEd25519Signer("session");
  const certify = (opts: CertificateOptions = {}, subject = session) =>
    softwareCertificate(ca, subject, {
      principals: [PRINCIPAL],
      validAfter: nowSeconds() - 60n,
      validBefore: nowSeconds() + 3600n,
      authority: { counter: 42 },
      ...opts,
    });
  const verify = (signature: string, extra: Partial<VerifyOptions> = {}) =>
    verifySshsig({ signature, message, namespace: NS, allowed: [], authorities, ...extra });

  it("verifies a session key's signature through its certificate", () => {
    const cert = certify({ keyId: "operator signing session", serial: 7n });
    const res = verify(cert.sign(message, NS));
    expect(res).toMatchObject({
      ok: true,
      value: {
        flags: 0,
        counter: 0,
        certificate: {
          keyId: "operator signing session",
          serial: 7n,
          principals: [PRINCIPAL],
          flags: FLAG_USER_PRESENT,
          counter: 42,
        },
      },
    });
    if (!res.ok) return;
    expect(res.value.key.type).toBe(ED25519);
    expect(res.value.certificate?.authority.blob).toEqual(ca.key.blob);
  });

  it.runIf(hasSshKeygen())(
    "is the format OpenSSH itself verifies with a cert-authority line",
    () => {
      const sigFile = join(dir, "hw.sig");
      const signers = join(dir, "hw_allowed_signers");
      writeFileSync(sigFile, certify().sign(message, NS));
      writeFileSync(signers, `${PRINCIPAL} cert-authority,namespaces="${NS}" ${ca.line}\n`);
      const out = keygen(
        ["-Y", "verify", "-f", signers, "-I", PRINCIPAL, "-n", NS, "-s", sigFile],
        message,
      );
      expect(out).toContain("Good");
    },
  );

  it("counts only where the caller names authorities", () => {
    const signature = certify().sign(message, NS);
    expect(verify(signature, { authorities: undefined })).toEqual({
      ok: false,
      error: "key_not_allowed",
    });
    // The authority's key among the plain keys is not an authority.
    expect(verify(signature, { authorities: [], allowed: [ca.key] })).toEqual({
      ok: false,
      error: "key_not_allowed",
    });
    const other = softwareSkSigner("other");
    expect(
      verify(signature, { authorities: [{ key: other.key, principals: [PRINCIPAL] }] }),
    ).toEqual({
      ok: false,
      error: "authority_not_allowed",
    });
  });

  it("requires the authority's touch", () => {
    const signature = certify({ authority: { flags: 0 } }).sign(message, NS);
    expect(verify(signature)).toEqual({ ok: false, error: "user_presence_required" });
    expect(verify(signature, { requireUserPresence: false }).ok).toBe(true);
  });

  it("requires the certified key's touch when it is a hardware key too", () => {
    const yk = softwareSkSigner("subject");
    const cert = certify({}, yk);
    expect(verify(cert.sign(message, NS)).ok).toBe(true);
    expect(verify(cert.sign(message, NS, { flags: 0 }))).toEqual({
      ok: false,
      error: "user_presence_required",
    });
  });

  it("refuses a principal the authority may not sign for, and a certificate naming none", () => {
    expect(verify(certify({ principals: ["root"] }).sign(message, NS))).toEqual({
      ok: false,
      error: "principal_not_allowed",
    });
    expect(verify(certify({ principals: [] }).sign(message, NS))).toEqual({
      ok: false,
      error: "principal_not_allowed",
    });
    expect(verify(certify({ principals: ["root", PRINCIPAL] }).sign(message, NS)).ok).toBe(true);
  });

  it("refuses host certificates and any critical option", () => {
    expect(verify(certify({ certType: CERT_TYPE_HOST }).sign(message, NS))).toEqual({
      ok: false,
      error: "certificate_not_user",
    });
    expect(
      verify(certify({ criticalOptions: [["force-command", "/bin/true"]] }).sign(message, NS)),
    ).toEqual({ ok: false, error: "certificate_critical_options" });
    // Extensions are informational: the session's `-O clear` has none, others do no harm.
    expect(verify(certify({ extensions: [["permit-pty", ""]] }).sign(message, NS)).ok).toBe(true);
  });

  it("checks validity at the time given, with the grace given after expiry", () => {
    const signature = certify({ validAfter: 1000n, validBefore: 2000n }).sign(message, NS);
    const at = (s: number) => new Date(s * 1000);
    expect(verify(signature, { at: at(999) })).toEqual({
      ok: false,
      error: "certificate_not_yet_valid",
    });
    expect(verify(signature, { at: at(1000) }).ok).toBe(true);
    expect(verify(signature, { at: at(1999) }).ok).toBe(true);
    expect(verify(signature, { at: at(2000) })).toEqual({
      ok: false,
      error: "certificate_expired",
    });
    expect(verify(signature, { at: at(2029), graceSeconds: 30 }).ok).toBe(true);
    expect(verify(signature, { at: at(2030), graceSeconds: 30 })).toEqual({
      ok: false,
      error: "certificate_expired",
    });
    // Now, by default: this certificate expired in 1970.
    expect(verify(signature)).toEqual({ ok: false, error: "certificate_expired" });
  });

  it("throws on a time or grace that is no time at all", () => {
    const signature = certify().sign(message, NS);
    expect(() => verify(signature, { at: new Date(Number.NaN) })).toThrow(TypeError);
    expect(() => verify(signature, { graceSeconds: -1 })).toThrow(TypeError);
    expect(() => verify(signature, { graceSeconds: 1.5 })).toThrow(TypeError);
  });

  it("refuses a changed certificate and a changed message", () => {
    const cert = certify({ keyId: "session A" });
    const signature = cert.sign(message, NS);
    expect(verify(signature).ok).toBe(true);
    const changed = new Uint8Array(cert.certificate);
    const at = Buffer.from(changed).indexOf("session A");
    changed[at + 8] = "B".charCodeAt(0);
    const resigned = softwareCertificateWithBlob(changed, cert.signRaw);
    expect(verify(resigned)).toEqual({ ok: false, error: "bad_certificate_signature" });
    const other = new TextEncoder().encode("tree 0000000000000000000000000000000000000000\n");
    expect(
      verifySshsig({ signature, message: other, namespace: NS, allowed: [], authorities }),
    ).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("refuses malformed certificates: trailing bytes, a certificate as authority", () => {
    const cert = certify();
    const withTrailing = softwareCertificateWithBlob(
      concat(cert.certificate, new Uint8Array([0])),
      cert.signRaw,
    );
    expect(verify(withTrailing)).toEqual({ ok: false, error: "malformed_certificate" });

    // A certificate whose authority is itself a certificate.
    const inner = certify();
    const chained = softwareCertificate(
      { ...inner, key: { ...inner.key, blob: inner.certificate } },
      session,
      { principals: [PRINCIPAL] },
    );
    expect(parseCertificateBlob(chained.certificate)).toEqual({
      ok: false,
      error: "unsupported_key_type",
    });
  });

  it("does not let a software authority count unless software keys are allowed", () => {
    const soft = softwareEd25519Signer("vault-ssh-ca");
    const signature = softwareCertificate(soft, session, { principals: [PRINCIPAL] }).sign(
      message,
      NS,
    );
    const opts = { authorities: [{ key: soft.key, principals: [PRINCIPAL] }] };
    expect(verify(signature, opts)).toEqual({ ok: false, error: "unsupported_key_type" });
    expect(verify(signature, { ...opts, allowSoftwareKeys: true })).toMatchObject({
      ok: true,
      value: { certificate: { flags: 0, counter: 0 } },
    });
  });
});

/** An SSHSIG signature carrying `blob` as its certificate, signed by the session key. */
function softwareCertificateWithBlob(
  blob: Uint8Array,
  signRaw: (data: Uint8Array) => Uint8Array,
): string {
  const outer = concat(
    new TextEncoder().encode("SSHSIG"),
    new Uint8Array([0, 0, 0, 1]),
    wireString(blob),
    wireString(NS),
    wireString(new Uint8Array(0)),
    wireString("sha512"),
    wireString(signRaw(signedData(NS, "sha512", message))),
  );
  return `-----BEGIN SSH SIGNATURE-----\n${Buffer.from(outer).toString("base64")}\n-----END SSH SIGNATURE-----\n`;
}

describe.runIf(hasSshKeygen())("certificates from ssh-keygen -s", () => {
  const caFile = join(dir, "ca");
  const userFile = join(dir, "session");
  keygen(["-q", "-t", "ed25519", "-N", "", "-C", "ca", "-f", caFile]);
  keygen(["-q", "-t", "ed25519", "-N", "", "-C", "session", "-f", userFile]);
  keygen([
    "-q",
    "-s",
    caFile,
    "-I",
    "operator signing session",
    "-n",
    PRINCIPAL,
    "-V",
    "+1h",
    "-O",
    "clear",
    `${userFile}.pub`,
  ]);
  writeFileSync(join(dir, "commit"), message);
  keygen(["-q", "-Y", "sign", "-f", `${userFile}-cert.pub`, "-n", NS, join(dir, "commit")]);
  const signature = readFileSync(join(dir, "commit.sig"), "utf8");
  const caLine = readFileSync(`${caFile}.pub`, "utf8").trim();
  const signer = parseAllowedSigner(`${PRINCIPAL} cert-authority,namespaces="${NS}" ${caLine}`);
  if (!signer.ok) throw new Error(signer.error);

  it("reads OpenSSH's certificate as ssh-keygen -L shows it", () => {
    const line = readFileSync(`${userFile}-cert.pub`, "utf8").trim().split(/\s+/);
    expect(line[0]).toBe(ED25519_CERT);
    const cert = parseCertificateBlob(new Uint8Array(Buffer.from(line[1]!, "base64")));
    if (!cert.ok) throw new Error(cert.error);
    expect(cert.value).toMatchObject({
      keyId: "operator signing session",
      principals: [PRINCIPAL],
      certType: 1,
      criticalOptions: [],
      extensions: [],
    });
    expect(cert.value.authority.blob).toEqual(signer.value.key.blob);
    const shown = keygen(["-L", "-f", `${userFile}-cert.pub`]);
    const valid = /Valid: from (\S+) to (\S+)/.exec(shown);
    const seconds = (t: string) => BigInt(Math.floor(new Date(t).getTime() / 1000));
    expect(cert.value.validBefore - cert.value.validAfter).toBe(
      seconds(valid![2]!) - seconds(valid![1]!),
    );
  });

  it("verifies OpenSSH's signature by a certified key through the allowed_signers line", () => {
    const { allowed, authorities } = signersFor([signer.value], NS);
    expect(allowed).toEqual([]);
    const res = verifySshsig({
      signature,
      message,
      namespace: NS,
      allowed,
      authorities,
      allowSoftwareKeys: true,
    });
    expect(res).toMatchObject({
      ok: true,
      value: { certificate: { keyId: "operator signing session", principals: [PRINCIPAL] } },
    });
    expect(
      verifySshsig({
        signature,
        message,
        namespace: NS,
        allowed,
        authorities,
        allowSoftwareKeys: true,
        at: new Date(Date.now() + 2 * 3600_000),
      }),
    ).toEqual({ ok: false, error: "certificate_expired" });
    expect(signersFor([signer.value], "file").authorities).toEqual([]);
  });
});

describe("parseAllowedSigner", () => {
  const yk = softwareSkSigner("yk");

  it("reads principals, cert-authority and namespaces", () => {
    expect(
      parseAllowedSigner(`${PRINCIPAL} cert-authority,namespaces="git" ${yk.line}`),
    ).toMatchObject({
      ok: true,
      value: {
        principals: [PRINCIPAL],
        certAuthority: true,
        namespaces: ["git"],
        key: { type: SK_ED25519 },
      },
    });
    expect(parseAllowedSigner(`"a@x,b@y" NAMESPACES="git,file" ${yk.line}`)).toMatchObject({
      ok: true,
      value: { principals: ["a@x", "b@y"], certAuthority: false, namespaces: ["git", "file"] },
    });
    expect(parseAllowedSigner(`enno ${yk.line}`)).toMatchObject({
      ok: true,
      value: { principals: ["enno"], certAuthority: false, namespaces: null },
    });
  });

  it("refuses a limit it cannot honour and lines it cannot read", () => {
    expect(parseAllowedSigner(`enno valid-before="20270101" ${yk.line}`)).toEqual({
      ok: false,
      error: "unsupported_option",
    });
    expect(parseAllowedSigner(yk.line)).toEqual({ ok: false, error: "malformed_allowed_signer" });
    expect(parseAllowedSigner(`enno namespaces="git ${yk.line}`)).toEqual({
      ok: false,
      error: "malformed_allowed_signer",
    });
    expect(parseAllowedSigner(`enno cert-authority,cert-authority ${yk.line}`)).toEqual({
      ok: false,
      error: "malformed_allowed_signer",
    });
    expect(parseAllowedSigner("enno cert-authority ssh-rsa AAAAB3NzaC1yc2E=")).toEqual({
      ok: false,
      error: "malformed_allowed_signer",
    });
  });

  it("splits keys from authorities and leaves out other namespaces", () => {
    const plain = parseAllowedSigner(`enno namespaces="git" ${yk.line}`);
    const ca = parseAllowedSigner(`${PRINCIPAL} cert-authority ${yk.line}`);
    const other = parseAllowedSigner(`enno namespaces="file" ${yk.line}`);
    if (!plain.ok || !ca.ok || !other.ok) throw new Error("parse");
    const got = signersFor([plain.value, ca.value, other.value], "git");
    expect(got.allowed).toHaveLength(1);
    expect(got.authorities).toEqual([{ key: ca.value.key, principals: [PRINCIPAL] }]);
    expect(parsePublicKey(`${PRINCIPAL} cert-authority ${yk.line}`).ok).toBe(true);
  });
});
