import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * The ruled section: the workhorse a screen is built out of.
 *
 * A margin column naming the section and saying why it exists, a content column
 * carrying the thing itself, and a hairline above. That is the whole primitive,
 * and it replaces `Panel` plus `PanelHeader` for everything that is not a
 * decision.
 *
 * The argument for it is that a control plane screen is one document about one
 * deployment, not eight cards about eight subjects. A stack of bordered panels
 * says the opposite: each one is a box with its own edge, its own background
 * step and its own header, so the eye counts containers before it reads
 * anything, and a screen with ten of them reads as ten screens. Rules cost one
 * pixel and say the same thing about structure. The page is the panel.
 *
 * The margin column is also what makes the note affordable. A panel header puts
 * its description above the content, where it is either short enough to be
 * useless or long enough to push the content down the screen. Beside it, a
 * sentence explaining why an operator is being shown this costs no vertical
 * space at all, which is why sections here have one and panels here did not.
 */
export interface RuledSectionProps {
  /** The section's name. Short: it is a label, not a sentence. */
  title: ReactNode;
  /** Why this section exists, in a sentence. Sits under the name. */
  note?: ReactNode;
  /**
   * Where the data came from, in mono: "signed lease - counter 48211",
   * "manifest 4f2ac91b8e77", "prod-a - docker". Provenance rather than
   * decoration, and only where a reader might reasonably ask.
   */
  source?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function RuledSection({ title, note, source, children, className, id }: RuledSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        // Stacked below `lg`, where 196px of margin column would leave the
        // content nothing. The rule and the padding survive the stack, so a
        // narrow window still reads as a document rather than as a list.
        "grid gap-y-3 border-t border-(--gc-border-hairline) px-8 py-[22px]",
        "lg:grid-cols-[196px_1fr] lg:gap-x-9 lg:gap-y-0",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {note === undefined ? null : <p className="mt-1.5 text-2xs text-fg-tertiary">{note}</p>}
        {source === undefined ? null : (
          <p className="numeric mt-2 text-3xs leading-[15px] text-fg-tertiary">{source}</p>
        )}
      </div>
      {/* Capped rather than fluid: a table is unreadable when a row is 1800px
          wide and the eye has to travel from a name on the left to a timestamp
          at the far right. The content column has no padding of its own, so a
          table inside it is already full bleed to this bound. */}
      <div className="min-w-0 max-w-[1010px]">{children}</div>
    </section>
  );
}

/**
 * One row inside a section's content column.
 *
 * A hairline and vertical padding, never a nested card. A card inside a section
 * is the panel stack coming back one level down: the section already drew the
 * boundary, and drawing it again inside says these rows are a different kind of
 * thing from the section they are in, which they are not.
 */
export function SubRow({
  children,
  roomy = false,
  className,
}: {
  children: ReactNode;
  /** For a row carrying two lines and an action rather than one value. */
  roomy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-t border-(--gc-border-hairline)",
        roomy ? "py-3" : "py-[9px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
