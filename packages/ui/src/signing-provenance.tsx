import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * Who signed this, and whether that signature is one anybody should rely on.
 *
 * The platform mints licences and signed artifacts; this console verifies the
 * same files and reports what it found. Both sides therefore have to answer the
 * same question, and the failure they share is that **a file signed by a
 * development provider looks completely genuine right up until it does not**.
 * It parses, it verifies against the key it was signed with, and it is refused
 * somewhere else entirely, days later, by a deployment that was never given
 * that key. The two sides describing that in different words is how the
 * resulting incident gets misread on a call between them.
 *
 * So the words live here rather than in either product.
 *
 * **Vault is one quiet line.** It is the expected answer and it does not deserve
 * a box: an interface that decorates the normal case teaches people to ignore
 * the decoration, and then the abnormal case looks like more of it.
 *
 * **A file provider takes the width and goes warn**, and says what it means for
 * the person reading rather than what it is called. `warn` rather than `crit`
 * for the same reason a refusal is warn in `Timeline`: nothing has broken. The
 * arrangement is wrong, and somebody has to decide about it, which is a
 * different feeling from an alarm.
 *
 * The caller supplies `action`, and for a file provider it is expected to be
 * the thing that fixes the arrangement rather than the thing that continues
 * past it.
 */
export interface SigningKeys {
  /** The signing key's fingerprint. Mono, truncated by the caller if long. */
  ed25519?: ReactNode;
  /** The escrow or wrapping key, where the surface has one. */
  rsa4096?: ReactNode;
}

export function SigningProvenance({
  provider,
  environment,
  keys,
  variant,
  action,
  copy,
  className,
}: {
  /** `vault` is the expected answer. `file` means keys on somebody's disk. */
  provider: "vault" | "file";
  /** Which one: production, staging, a developer's laptop. Named, not implied. */
  environment?: ReactNode;
  keys?: SigningKeys;
  /**
   * Overrides the emphasis the provider would choose.
   *
   * `file` is loud and `vault` is quiet, which is right almost everywhere. The
   * exception is a screen whose entire subject is the signing arrangement, where
   * a vault provider is the answer to the question being asked and a single
   * grey line reads as though the screen failed to load.
   */
  variant?: "quiet" | "loud";
  /** The way out. For a file provider, the way to stop signing with a file. */
  action?: ReactNode;
  /**
   * The four sentences this block says, two per provider.
   *
   * Required props rather than literals: this component has no locale and both
   * consoles that render it do. The detail paragraphs are the load-bearing
   * half, since they are the explanation of why a file-signed artifact looks
   * genuine until the day it does not.
   */
  copy: {
    fileTitle: ReactNode;
    vaultTitle: ReactNode;
    fileDetail: ReactNode;
    vaultDetail: ReactNode;
  };
  className?: string;
}) {
  const loud = (variant ?? (provider === "file" ? "loud" : "quiet")) === "loud";
  const wrong = provider === "file";

  /**
   * The quiet step, one shade up when this block sits on the warn wash.
   *
   * Tertiary is calibrated against the plain surfaces and clears AA on all
   * five. A wash is not one of them: over `--gc-warn-wash` it measures 3.49:1
   * in dark, and the sentence it draws here is the one explaining why a
   * file-signed artifact looks genuine until it does not. Secondary is 6.88:1
   * on the same ground, so the wash case takes it and everything else keeps
   * the quieter step.
   */
  const onWash = loud && wrong;
  const quiet = onWash ? "text-fg-secondary" : "text-fg-tertiary";

  const fingerprints =
    keys === undefined ? null : (
      <span
        className={cn(
          "numeric inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs",
          quiet,
        )}
      >
        {keys.ed25519 === undefined ? null : <span>ed25519 {keys.ed25519}</span>}
        {keys.rsa4096 === undefined ? null : <span>rsa4096 {keys.rsa4096}</span>}
      </span>
    );

  if (!loud) {
    return (
      <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
        <span className="text-2xs text-fg-secondary">
          {wrong ? (
            // Still says the consequence, even quiet. A caller that forces a
            // file provider into the quiet variant has made a choice about
            // emphasis, not about whether the fact gets stated.
            <>
              {copy.fileTitle}
              {environment === undefined ? null : <> ({environment})</>}
            </>
          ) : (
            <>
              {copy.vaultTitle}
              {environment === undefined ? null : <> ({environment})</>}
            </>
          )}
        </span>
        {fingerprints}
        {action === undefined ? null : <span className="ml-auto">{action}</span>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-(--radius-md) border px-3.5 py-3",
        wrong
          ? "border-[color-mix(in_oklch,var(--gc-warn)_35%,transparent)] bg-warn-wash"
          : "border-(--gc-border-hairline) bg-inset",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium tracking-[-0.01em]",
              wrong ? "text-warn-ink" : "text-fg",
            )}
          >
            {wrong ? copy.fileTitle : copy.vaultTitle}
            {environment === undefined ? null : (
              <span className={cn("numeric ml-2 text-2xs font-normal", quiet)}>{environment}</span>
            )}
          </p>

          <p className={cn("mt-1 max-w-[78ch] text-2xs leading-[17px]", quiet)}>
            {wrong ? copy.fileDetail : copy.vaultDetail}
          </p>

          {fingerprints === null ? null : <div className="mt-2">{fingerprints}</div>}
        </div>

        {action === undefined ? null : <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
