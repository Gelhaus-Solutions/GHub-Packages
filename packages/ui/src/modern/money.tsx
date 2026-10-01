import { cn } from "../cn.js";

/**
 * A figure with a currency, formatted in exactly one place.
 *
 * It is a component rather than a helper because the formatting is only half of
 * it: mono tabular figures, right alignment in a column, and whether the
 * currency is named are presentation, and a helper returning a string leaves
 * every caller to get those right separately. Billing is a product made of
 * columns of numbers that have to line up.
 *
 * **Minor units are the input, and that is the whole point of the component.**
 * A money value that travels as a decimal has already lost: 0.1 + 0.2 is not
 * 0.3, and a total assembled from floats disagrees with the invoice by a cent
 * on a long enough bill. Everything upstream of a screen counts in the smallest
 * unit, so this takes that integer and is the only thing that ever divides.
 *
 * **The divisor comes from the currency, never from 100.** JPY has no minor
 * unit at all and KWD has three, so `minorUnits / 100` prints a hundredth of a
 * yen bill and a tenth of a dinar one. `Intl` already knows each currency's
 * exponent; this asks it rather than assuming.
 */
export interface MoneyProps {
  /**
   * The amount in the currency's smallest unit: cents for EUR, whole yen for
   * JPY. An integer, because a fractional minor unit is not a thing a ledger
   * can hold.
   */
  minorUnits: number;
  /** ISO 4217, for example `EUR`. */
  currency: string;
  /**
   * Decides separators and digit grouping, and it is required rather than
   * defaulted.
   *
   * A default would read the host's locale, which on a server is whatever the
   * container was built with and on a client is the browser's. The same invoice
   * would then render `1.080,00` in one place and `1,080.00` in another, and
   * the bug appears only for somebody whose machine disagrees with the
   * reviewer's.
   */
  locale: string;
  /**
   * A total names its currency in full; a line item omits it, because a column
   * of figures that each repeat `EUR` is a column nobody can scan.
   */
  total?: boolean;
  className?: string;
}

/**
 * How many minor units make one major unit, according to the currency itself.
 *
 * `resolvedOptions` reports the fraction digits `Intl` will actually use for
 * this currency, which is the same number that defines its minor unit.
 */
function minorUnitDigits(locale: string, currency: string): number {
  // A bad ISO code throws out of the constructor above before this is reached,
  // so in practice the field is always present and the type is the only thing
  // that admits otherwise. It REFUSES rather than defaulting anyway: a `?? 2`
  // here would be the hardcoded hundred this function exists to remove, hidden
  // one level deeper and applied only to the currencies it is wrong for.
  const { maximumFractionDigits } = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions();
  if (maximumFractionDigits === undefined) {
    throw new Error(`no minor unit known for currency '${currency}'`);
  }
  return maximumFractionDigits;
}

export function Money({ minorUnits, currency, locale, total = false, className }: MoneyProps) {
  const digits = minorUnitDigits(locale, currency);
  const amount = minorUnits / 10 ** digits;

  const formatted = new Intl.NumberFormat(locale, {
    style: total ? "currency" : "decimal",
    ...(total ? { currency, currencyDisplay: "code" } : {}),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);

  return (
    <span
      className={cn(
        // `tabular-nums` is not decoration: proportional digits make a column
        // of figures ragged, and a column a person is comparing down is the
        // only reason to set money in mono at all.
        "font-mono tabular-nums text-m-body text-m-ink",
        className,
      )}
    >
      {formatted}
    </span>
  );
}
