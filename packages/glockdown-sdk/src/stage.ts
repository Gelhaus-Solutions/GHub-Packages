/**
 * The stage GLockdown has set for this app, read from the file the GLockdown agent on this host
 * writes (`/run/glockdown/apps/<app>.json`, replaced atomically, writable only by the agent).
 *
 * GLockdown is one source of an app's stage beside the app's own env floor and setting; the app
 * enforces the strictest (L35). The stages are GAdvisory's: `off`, `signups`, `members`,
 * `admins`, `full`, and the agent writes `full` for every rung above it.
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

export const STAGES = ["off", "signups", "members", "admins", "full"] as const;
export type Stage = (typeof STAGES)[number];

export const DEFAULT_STAGE_DIR = "/run/glockdown/apps";

export type StageSource = "file" | "absent" | "held" | "unreadable";

export interface StageReading {
  stage: Stage;
  /** The GLockdown rung behind it (`aal`, `sil` and `ail` all read as `full`), when known. */
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

/** The strictest of several stages; `off` for none. */
export function strictest(...stages: Stage[]): Stage {
  return stages.reduce<Stage>((a, b) => (stageRank(b) > stageRank(a) ? b : a), "off");
}

const APP = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const RUNG = /^(off|signups|members|admins|full|aal|sil|ail)$/;

function parse(text: string, app: string): StageReading | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
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
}

export class GlockdownStage {
  private readonly path: string;
  private last: StageReading | null = null;
  private good: StageReading | null = null;
  private readAt = -Infinity;

  constructor(private readonly o: GlockdownStageOptions) {
    if (!APP.test(o.app)) throw new TypeError("not an app name");
    this.path = join(o.dir ?? DEFAULT_STAGE_DIR, `${o.app}.json`);
  }

  /** The stage now. Cheap enough for every request: the file is read at most once a second. */
  current(): Stage {
    return this.reading().stage;
  }

  reading(): StageReading {
    const now = (this.o.nowMs ?? Date.now)();
    if (this.last && now - this.readAt < (this.o.refreshMs ?? 1000)) return this.last;
    this.readAt = now;
    this.last = this.read();
    return this.last;
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
