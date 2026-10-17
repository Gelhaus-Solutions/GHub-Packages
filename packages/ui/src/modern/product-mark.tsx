import { cn } from "../cn.js";

export interface ProductMarkProps {
  /** The product's name. Only its first letter is drawn, and only where there is no mark. */
  name: string;
  /** The mark's address, from GPlatform Identity's catalogue. Null where the product has none yet. */
  src: string | null;
  /** The side in px. */
  size?: number;
  className?: string;
}

/**
 * A product's mark, or its initial in a rounded square where it has none yet:
 * the fallback the apps picker draws (GPlatform Identity, sheet 31).
 *
 * Decoration beside the product's name, so hidden from a screen reader. The
 * address names one file and never changes, so a plain image is right; an
 * optimiser would only copy it.
 */
export function ProductMark({ name, src, size = 24, className }: ProductMarkProps) {
  if (src === null) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
        className={cn(
          "grid shrink-0 place-items-center rounded-[28%] border border-m-control bg-m-hover font-semibold text-m-ink-2",
          className,
        )}
      >
        {[...name.trim()][0]?.toLocaleUpperCase() ?? "?"}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

export interface ProductChipProps {
  name: string;
  src: string | null;
  className?: string;
}

/**
 * A product named by its mark and its name, in a pill (GPlatform Identity,
 * sheet 34: C5's panel and its confirmed list). The bundle's "Badge with a
 * leading mark", drawn as its own shape because a Badge is a count.
 */
export function ProductChip({ name, src, className }: ProductChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full bg-m-plate py-1.5 pr-3 pl-2 shadow-[inset_0_0_0_1px_var(--gm-hairline)]",
        className,
      )}
    >
      <ProductMark name={name} src={src} size={24} />
      <span className="truncate text-m-meta font-medium text-m-ink">{name}</span>
    </span>
  );
}
