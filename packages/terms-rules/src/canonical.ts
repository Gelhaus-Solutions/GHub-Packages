/**
 * Canonical JSON: the one byte sequence a snapshot is signed over.
 *
 * A signature covers bytes, not meaning. Two serialisations of the same
 * snapshot that differ by a space or by the order of two keys are different
 * bytes, and only one of them verifies, so the server and every verifier have
 * to agree on exactly one way to write a value. This function is that
 * agreement: the server signs `Buffer.from(canonicalJson(snapshot), "utf8")`,
 * and verifySnapshot checks the same bytes. Changing anything here after the
 * first signed snapshot invalidates every signature already issued.
 *
 * - Object keys are sorted by UTF-16 code unit, which is what `<` does on
 *   strings: not by locale, which differs between machines, and not by code
 *   point, which differs from code units above U+FFFF.
 * - Arrays keep their order, because order means something in them (a
 *   surface's covers are part of the identifier).
 * - No whitespace anywhere.
 * - A property whose value is `undefined` is left out, as JSON.stringify does,
 *   so an optional field that is absent and one set to undefined write the
 *   same bytes.
 * - Strings and numbers are written as JSON.stringify writes them: numbers in
 *   the shortest form that reads back as the same number, strings with only
 *   `"`, `\` and control characters escaped and everything else as it is.
 *
 * For well-formed strings and finite numbers this is the JSON Canonicalization
 * Scheme of RFC 8785, so a verifier written in another language has a
 * specification to follow rather than this file to imitate.
 *
 * Anything that is not plain JSON is refused rather than converted: a Date (one
 * of the few values JSON.stringify would quietly turn into a string), a number
 * that is not finite (which it would turn into null), a function, a symbol, a
 * bigint, a class instance, a Map, an array with a hole or an undefined
 * element, and a cycle. A value that cannot be written without a choice being
 * made is a value the two sides could write differently.
 */

function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function write(value: unknown, path: string, open: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} is ${String(value)}, which JSON cannot hold.`);
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(`${path} is a ${typeof value}, which is not JSON.`);
  }
  if (open.has(value))
    throw new TypeError(`${path} refers back to itself, which JSON cannot hold.`);
  open.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value) || value[index] === undefined) {
          throw new TypeError(`${path}[${index}] is missing, which JSON cannot hold in an array.`);
        }
        items.push(write(value[index], `${path}[${index}]`, open));
      }
      return `[${items.join(",")}]`;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      const name = value instanceof Date ? "a Date" : "not a plain object";
      throw new TypeError(`${path} is ${name}, which is not JSON. Write it as a value first.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`${path} has a symbol key, which is not JSON.`);
    }
    const record = value as Readonly<Record<string, unknown>>;
    const members: string[] = [];
    for (const key of Object.keys(record).sort(byCodeUnit)) {
      const member = record[key];
      if (member === undefined) continue;
      members.push(`${JSON.stringify(key)}:${write(member, `${path}.${key}`, open)}`);
    }
    return `{${members.join(",")}}`;
  } finally {
    open.delete(value);
  }
}

/** The canonical JSON text of a value. Throws a TypeError, naming where, for
 *  anything that is not plain JSON. */
export function canonicalJson(value: unknown): string {
  return write(value, "value", new Set());
}
