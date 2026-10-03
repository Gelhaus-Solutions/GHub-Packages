"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Banner } from "./banner.js";
import { Button } from "./button.js";

export interface DraftKeeperOptions<T extends Record<string, string>> {
  /** Where the copy is kept: one key per draft, such as `terms-draft:<id>`. */
  key: string;
  /** The saved revision the fields started from, kept with the copy. */
  revision: number;
  /** The fields as they are now. */
  values: T;
  /** The fields as they were last saved. */
  saved: T;
}

/** A copy found on mount: what it holds, when it was last typed, and the revision it was based on. */
export interface RestoredDraft<T> {
  values: T;
  at: Date;
  revision: number;
}

export interface DraftKeeper<T> {
  /**
   * The kept copy found on mount, when it differs from what is saved, or null.
   * While it is on offer nothing is written over it.
   */
  restored: RestoredDraft<T> | null;
  /** The fields differ from the saved ones. */
  dirty: boolean;
  /** The caller has put `restored.values` into its fields: stop offering it. */
  accept(): void;
  /** Drop the kept copy and stop offering it. */
  discard(): void;
  /** Call after a successful save: the copy is cleared and not written again for this text. */
  saved(): void;
}

interface Kept {
  revision: number;
  at: string;
  values: Record<string, string>;
}

function isKept(value: unknown): value is Kept {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.revision !== "number" || typeof record.at !== "string") return false;
  if (Number.isNaN(new Date(record.at).getTime())) return false;
  const values = record.values;
  if (typeof values !== "object" || values === null) return false;
  return Object.values(values).every((field) => typeof field === "string");
}

/*
 * Every touch of storage is wrapped. A private window, a storage quota, or a
 * browser set to refuse site data each throw from `sessionStorage` itself,
 * and a draft page must keep working without a kept copy rather than fail to
 * render because it could not keep one.
 */
function read(key: string): Kept | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isKept(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(key: string, kept: Kept): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // Nothing kept, nothing lost that was not already unsaved.
  }
}

function forget(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Already unreachable, which is what forgetting it wanted.
  }
}

/** The fields as one string, in key order, so two equal sets compare equal. */
function serial(values: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.keys(values)
      .sort()
      .map((name) => [name, values[name]]),
  );
}

/**
 * Keeps a draft's unsaved text in `sessionStorage` as it is typed, and offers
 * it back. Drawn for the GPlatform Terms staff console, where following a link
 * away from a draft must never ask and never lose what was written.
 *
 * **Kept on every change that differs from what is saved**, under `key`, with
 * the revision the fields started from and the time. One key per draft rather
 * than per revision: if the draft was saved somewhere else meanwhile, the copy
 * is still found, and `restored.revision` against the page's own revision is
 * how the caller's banner says which revision the copy is based on.
 *
 * **Offered back on mount, never applied.** A copy that differs from what is
 * saved comes back as `restored`; the caller shows `DraftKeeperBanner` and
 * either puts the values into its fields and calls `accept()`, or calls
 * `discard()`. Until one of those, the copy is left alone, so a reload while
 * deciding does not lose it. A copy equal to what is saved is dropped quietly.
 *
 * **Closing the tab with unsaved text gets the browser's own prompt**, from
 * `beforeunload`, while the fields are dirty or a copy is on offer: session
 * storage dies with the tab, so that is the one way the text could be lost.
 * Following a link inside the app unloads nothing and asks nothing.
 */
export function useDraftKeeper<T extends Record<string, string>>({
  key,
  revision,
  values,
  saved,
}: DraftKeeperOptions<T>): DraftKeeper<T> {
  const valuesSerial = serial(values);
  const savedSerial = serial(saved);
  const dirty = valuesSerial !== savedSerial;

  const [restored, setRestored] = useState<RestoredDraft<T> | null>(null);
  /** The key whose copy is on offer. Read by the writer, which must wait. */
  const offered = useRef<string | null>(null);
  /** The text `saved()` cleared, so it is not written back before `saved` catches up. */
  const cleared = useRef<string | null>(null);
  const latestSerial = useRef(valuesSerial);
  latestSerial.current = valuesSerial;

  /*
   * Read first. Declared before the writer on purpose: effects run in order,
   * so on mount the writer already knows a copy is on offer and does not
   * remove it as "not dirty" in the same pass that found it.
   */
  useEffect(() => {
    const kept = read(key);
    if (kept === null) {
      offered.current = null;
      setRestored(null);
      return;
    }
    if (serial(kept.values) === serial(saved)) {
      forget(key);
      offered.current = null;
      setRestored(null);
      return;
    }
    offered.current = key;
    setRestored({ values: kept.values as T, at: new Date(kept.at), revision: kept.revision });
    // Only a new draft is a new read; `saved` here is the page's own, on mount.
  }, [key]);

  useEffect(() => {
    if (offered.current === key) return;
    if (!dirty) {
      cleared.current = null;
      forget(key);
      return;
    }
    if (cleared.current === valuesSerial) return;
    cleared.current = null;
    write(key, { revision, at: new Date().toISOString(), values });
    // The serials stand for `values` and `saved`, which callers rebuild every render.
  }, [key, revision, valuesSerial, savedSerial]);

  const guard = dirty || restored !== null;
  useEffect(() => {
    if (!guard) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // The older spelling of the same request, which some browsers still need.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [guard]);

  const accept = useCallback(() => {
    offered.current = null;
    setRestored(null);
  }, []);

  const discard = useCallback(() => {
    offered.current = null;
    forget(key);
    setRestored(null);
  }, [key]);

  const markSaved = useCallback(() => {
    offered.current = null;
    cleared.current = latestSerial.current;
    forget(key);
    setRestored(null);
  }, [key]);

  return { restored, dirty, accept, discard, saved: markSaved };
}

export interface DraftKeeperBannerProps {
  /** "Your unsaved changes from 09:40 CEST are back". */
  title: ReactNode;
  /** What they are and what each choice does, naming the revision they are based on. */
  body: ReactNode;
  save: { label: string; onSave: () => void };
  discard: { label: string; onDiscard: () => void };
  className?: string;
}

/**
 * The kept copy, offered back: the modern `Banner` in info tone, with Save and
 * Discard under its sentence.
 *
 * A banner because the copy is a state the screen did not cause, which is the
 * Banner's own rule. Save is the quiet plate rather than the primary, because
 * the page's own save is the one primary on it; Discard is a verb in accent ink.
 * Both remove the banner, and the button pressed with it, so the caller moves
 * focus on (to the first field) when it handles either.
 */
export function DraftKeeperBanner({
  title,
  body,
  save,
  discard,
  className,
}: DraftKeeperBannerProps) {
  return (
    <Banner tone="info" title={title} className={className}>
      {body}
      <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="secondary" size={36} onClick={save.onSave}>
          {save.label}
        </Button>
        <Button variant="quiet" size={36} onClick={discard.onDiscard}>
          {discard.label}
        </Button>
      </span>
    </Banner>
  );
}
