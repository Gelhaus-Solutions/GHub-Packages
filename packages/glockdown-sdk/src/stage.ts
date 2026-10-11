/**
 * The stage GLockdown has set for this app, read from the file the GLockdown agent on this host
 * writes (`/run/glockdown/apps/<app>.json`, replaced atomically, writable only by the agent).
 *
 * GLockdown is one source of an app's stage beside the app's own env floor and setting; the app
 * enforces the strictest (L35). The stages are GAdvisory's: `off`, `signups`, `members`,
 * `admins`, `full`, and the agent writes `full` for every rung above it. From AAL phase 1 the app
 * also refuses every credential, existing sessions and API keys included
 * (`refusesEveryCredential`); its public pages stay up, and only GLockdown cuts those, at AAL
 * phase 2.
 *
 * A second source can stand beside the file: GLockdown's edge, asked over this app's pinned TLS
 * identity (`edge`). The stricter of the two holds, and the edge's last good answer holds while it
 * is silent, so neither a file deleted, blocked or rewritten on this host nor a blocked edge lowers
 * the stage.
 *
 * Reading never throws and never lowers on a fault:
 * - no file, and none ever read: `off`. The agent is not installed yet, and sign-in stays as it
 *   was (L35).
 * - a file that cannot be read or does not parse, when none was ever read: `full`. A broken
 *   switch locks more, never less.
 * - any fault after a good read, the file gone included: the last good stage holds. Silence
 *   changes nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askStage, type EdgeConnection } from "./escalate";

export const STAGES = ["off", "signups", "members", "admins", "full"] as const;
export type Stage = (typeof STAGES)[number];

export const DEFAULT_STAGE_DIR = "/run/glockdown/apps";

export type StageSource = "file" | "absent" | "held" | "unreadable" | "edge";

export interface StageReading {
  stage: Stage;
  /** The GLockdown rung behind it (`aal` and above all read as `full`), when known. */
  rung: string | null;
  /** When the agent wrote it (unix seconds), when known. */
  at: number | null;
  source: StageSource;
}

export function stageRank(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

const EVERY_CREDENTIAL = new Set(["aal", "aal2", "sil", "ail"]);

/**
 * Whether the app refuses every credential, existing sessions and API keys included, and not only
 * new sign-ins: from AAL phase 1. A reading with no rung (no file, or a broken one before any good
 * read) says no; its `full` already refuses every sign-in.
 */
export function refusesEveryCredential(reading: StageReading): boolean {
  return reading.rung !== null && EVERY_CREDENTIAL.has(reading.rung);
}

/** The strictest of several stages; `off` for none. */
export function strictest(...stages: Stage[]): Stage {
  return stages.reduce<Stage>((a, b) => (stageRank(b) > stageRank(a) ? b : a), "off");
}

const APP = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const RUNG = /^(off|signups|members|admins|full|aal|aal2|sil|ail)$/;
const RUNGS = ["off", "signups", "members", "admins", "full", "aal", "aal2", "sil", "ail"];

/** A rung's place on the ladder; an unknown rung (no file yet) counts below every rung. */
function rungRank(rung: string | null): number {
  return rung === null ? -1 : RUNGS.indexOf(rung);
}

/** The stricter of two readings: the higher stage, and at the same stage the higher rung. */
function stricter(a: StageReading, b: StageReading): StageReading {
  const d = stageRank(b.stage) - stageRank(a.stage);
  return d > 0 || (d === 0 && rungRank(b.rung) > rungRank(a.rung)) ? b : a;
}

function parse(text: string, app: string): StageReading | null {
  try {
    return parseValue(JSON.parse(text), app);
  } catch {
    return null;
  }
}

function parseValue(v: unknown, app: string): StageReading | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys !== "app,at,rung,stage,v" || o.v !== 1 || o.app !== app) return null;
  if (!isStage(o.stage) || typeof o.rung !== "string" || !RUNG.test(o.rung)) return null;
  if (typeof o.at !== "number" || !Number.isSafeInteger(o.at)) return null;
  return { stage: o.stage, rung: o.rung, at: o.at, source: "file" };
}

export interface GlockdownStageOptions {
  /** This app's name, as GLockdown's scopes and the agent's configuration know it. */
  app: string;
  /** Where the agent writes; default `/run/glockdown/apps`. */
  dir?: string;
  /** Reads the file again at most this often; default 1000 ms. */
  refreshMs?: number;
  /** Milliseconds, for tests. */
  nowMs?: () => number;
  /**
   * GLockdown's edge as a second source, asked over this app's pinned TLS identity at most every
   * `edgeEveryMs` (default 15 000 ms), in the background: a reading never waits for it.
   */
  edge?: EdgeConnection;
  edgeEveryMs?: number;
}

export class GlockdownStage {
  private readonly path: string;
  private last: StageReading | null = null;
  private good: StageReading | null = null;
  private readAt = -Infinity;
  private edgeGood: StageReading | null = null;
  private edgeAskedAt = -Infinity;
  private asking: Promise<void> | null = null;

  constructor(private readonly o: GlockdownStageOptions) {
    if (!APP.test(o.app)) throw new TypeError("not an app name");
    this.path = join(o.dir ?? DEFAULT_STAGE_DIR, `${o.app}.json`);
  }

  /** The stage now. Cheap enough for every request: the file is read at most once a second. */
  current(): Stage {
    return this.reading().stage;
  }

  /** Whether every credential is refused now, sessions and API keys included (AAL and above). */
  refusesEveryCredential(): boolean {
    return refusesEveryCredential(this.reading());
  }

  /** The stricter of the file and the edge's last good answer. */
  reading(): StageReading {
    const now = (this.o.nowMs ?? Date.now)();
    if (now - this.edgeAskedAt >= (this.o.edgeEveryMs ?? 15_000)) void this.askEdge();
    if (!this.last || now - this.readAt >= (this.o.refreshMs ?? 1000)) {
      this.readAt = now;
      this.last = this.read();
    }
    return this.edgeGood ? stricter(this.last, this.edgeGood) : this.last;
  }

  /**
   * Asks the edge now (once at a time) and takes a valid answer for this app as its last good one;
   * any fault leaves the last good answer as it was. Resolves when the answer is in; never throws.
   */
  askEdge(): Promise<void> {
    const edge = this.o.edge;
    if (!edge) return Promise.resolve();
    if (this.asking) return this.asking;
    this.edgeAskedAt = (this.o.nowMs ?? Date.now)();
    this.asking = askStage(edge)
      .then((r) => {
        const v = r.ok ? parseValue(r.body, this.o.app) : null;
        if (v) this.edgeGood = { ...v, source: "edge" };
      })
      .catch(() => {})
      .finally(() => {
        this.asking = null;
      });
    return this.asking;
  }

  private read(): StageReading {
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch (e) {
      const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
      return this.fault(missing ? "absent" : "unreadable");
    }
    const r = parse(text, this.o.app);
    if (!r) return this.fault("unreadable");
    this.good = r;
    return r;
  }

  private fault(kind: "absent" | "unreadable"): StageReading {
    if (this.good) return { ...this.good, source: "held" };
    return kind === "absent"
      ? { stage: "off", rung: null, at: null, source: "absent" }
      : { stage: "full", rung: null, at: null, source: "unreadable" };
  }
}
