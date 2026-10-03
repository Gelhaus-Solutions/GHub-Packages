import { Status, type StatusLevel } from "./status.js";

/** Where a version of a document stands. Eight values and no others. */
export type VersionStateValue =
  | "in-force"
  | "announced"
  | "scheduled"
  | "not-dated"
  | "held"
  | "superseded"
  | "never-in-force"
  | "draft";

/**
 * The sheet's words for each state, in English.
 *
 * The package has no locale, so these are defaults in the way `Dialog`'s
 * "Close" is: a caller with another language, or a page that adds a surface
 * ("Held on Contribution Checker"), passes `word` instead.
 */
export const VERSION_STATE_WORDS: Readonly<Record<VersionStateValue, string>> = {
  "in-force": "In force",
  announced: "Announced",
  scheduled: "Scheduled",
  "not-dated": "Not dated yet",
  held: "Held for a campaign",
  superseded: "Superseded",
  "never-in-force": "Never in force",
  draft: "Draft",
};

/**
 * The ramp, decided here and not by the caller, for the reason `Standing`
 * gives: a caller choosing the level is how one screen draws a held version in
 * warn and the next in idle.
 *
 * Only Not dated yet takes warn, because it is the one state waiting on staff
 * with nothing scheduled to end it. Held waits on a campaign, which will set the
 * dates, so it is idle. Crit is absent on purpose: no state of a version is
 * something already lost.
 */
const LEVEL: Readonly<Record<VersionStateValue, StatusLevel>> = {
  "in-force": "ok",
  announced: "info",
  scheduled: "info",
  "not-dated": "warn",
  held: "idle",
  superseded: "idle",
  "never-in-force": "idle",
  draft: "idle",
};

export interface VersionStateProps {
  state: VersionStateValue;
  /** Replaces the default word: another language, or a surface's difference. */
  word?: string;
  /** A chip on a wash, for a table cell or a version head. Inline everywhere else. */
  chip?: boolean;
  className?: string;
}

/**
 * A version's state, in a word and a colour. Drawn for the GPlatform Terms
 * staff console.
 *
 * **Decided from the version, never from one of its rollouts.** That is the
 * whole reason this exists rather than a `Status` at each call site: a
 * superseded version once said "In force" because the word was read off a
 * rollout that had, at the time, put it in force. The caller passes the state
 * the API decided; this decides the level and, by default, the word.
 *
 * **`Status` sits inside unchanged**, so the colour rule, the hidden dot and
 * the chip are exactly the ones every other status on the screen follows.
 */
export function VersionState({ state, word, chip = false, className }: VersionStateProps) {
  return (
    <Status level={LEVEL[state]} chip={chip} className={className}>
      {word ?? VERSION_STATE_WORDS[state]}
    </Status>
  );
}
