import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * What will happen, in two halves, one row per thing.
 *
 * The list a dialog shows before something irreversible. It exists as a
 * component rather than as markup in each dialog because the shape is the
 * argument: a title saying what happens, and under it the half nobody writes
 * unprompted, which is what that does not mean.
 *
 * Freezing an instance is the case it was drawn for. "The session epoch goes up"
 * is true and useless on its own; "every app session opened before this moment
 * is refused, which is why people will be signed out of apps that are still
 * running" is the sentence that makes the decision. A dialog offering bullet
 * points gives the first half and leaves the operator to discover the second one
 * afterwards, which on an irreversible action is the whole problem.
 *
 * Shared because both consoles end things. This one freezes and destroys a
 * customer's own deployments; GPlatform Control revokes and contains from the
 * other side, and a consequence list that disagreed about how much it owed the
 * reader would be the two products disagreeing about how serious they are.
 *
 * **The rule down the left is neutral by default**, `--gc-border-subtle`, and
 * stays that way even in a dialog whose action is destructive. A consequence is
 * neither something to act on nor a severity: it is a fact about what the one
 * action already being decided will do. Colouring every row would spend the
 * status ramp on emphasis, and a list where each row is red says nothing about
 * which row is the one people forget. The crit belongs on the button that does
 * it.
 *
 * A row may still take a status, and the case it exists for is the unseal
 * dialog, where the facts are about who holds which half of a key. `locked`
 * there is not emphasis: the token means "held by somebody else", which is
 * exactly what those rows say, so the colour carries its own meaning rather than
 * borrowing one. Reach for it when a row is about custody, never to make a row
 * shout.
 */

export interface Consequence {
  /** What happens. One line, stated plainly. */
  title: ReactNode;
  /**
   * What it does and does not mean. The half that makes the first half
   * decidable, and the reason this is a component.
   */
  detail: ReactNode;
  /**
   * Colours the rule, for a row about custody rather than about consequence.
   * Omit it for an ordinary consequence, which is nearly all of them.
   */
  status?: Status;
}

const rule: Record<Status, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  crit: "bg-crit",
  info: "bg-info",
  locked: "bg-locked",
  idle: "bg-idle",
};

export function ConsequenceList({
  items,
  className,
}: {
  items: readonly Consequence[];
  className?: string;
}) {
  return (
    <ul className={cn("min-w-0", className)}>
      {items.map((item, index) => (
        <li
          // The title is the identity here: these are authored lists of a few
          // fixed sentences, not rows from a table, so there is no id to key on
          // and the index is stable for the life of the dialog.
          key={index}
          className="grid grid-cols-[3px_1fr] gap-3 border-b border-(--gc-border-hairline) py-2.5"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block h-full min-h-4 w-[3px] rounded-full",
              item.status === undefined ? "bg-(--gc-border-subtle)" : rule[item.status],
            )}
          />
          <div className="min-w-0">
            <p className="text-[12.5px] leading-[18px] text-fg">{item.title}</p>
            <p className="mt-[3px] text-[11.5px] leading-[17px] text-fg-tertiary">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
