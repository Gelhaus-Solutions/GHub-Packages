/**
 * The durable request counter (architecture 9.2 step 10). Every request carries the next number;
 * GMint accepts each number once, within a window, so a second holder of the same key shows up as
 * a reused or stale number and gets the client quarantined. The counter is a file updated under a
 * cross-process lock and replaced atomically.
 */

import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";

const STALE_LOCK_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function nextSequence(path: string): Promise<number> {
  const lock = `${path}.lock`;
  for (let attempt = 0; ; attempt++) {
    let fd: number;
    try {
      fd = openSync(lock, "wx", 0o600);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) unlinkSync(lock);
      } catch {
        /* someone else removed it */
      }
      if (attempt > 500) throw new Error("gmint: sequence lock is held too long");
      await sleep(5 + Math.random() * 10);
      continue;
    }
    try {
      let current = 0;
      try {
        const text = readFileSync(path, "utf8").trim();
        if (!/^\d{1,15}$/.test(text)) throw new Error("gmint: sequence file is corrupt");
        current = Number(text);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const next = current + 1;
      const tmp = `${path}.${process.pid}.tmp`;
      const out = openSync(tmp, "w", 0o600);
      try {
        writeSync(out, String(next));
        fsyncSync(out);
      } finally {
        closeSync(out);
      }
      renameSync(tmp, path);
      return next;
    } finally {
      closeSync(fd);
      unlinkSync(lock);
    }
  }
}
