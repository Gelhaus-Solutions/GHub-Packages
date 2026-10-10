/**
 * A strict JSON parser for signed payloads.
 *
 * `JSON.parse` silently keeps the last of two duplicate keys, accepts integers it cannot
 * represent, and will happily build an object with a `__proto__` key. Each of those is a way
 * for a signer and a verifier to disagree about what was signed, so this parser refuses them:
 * duplicate keys, the keys `__proto__`, `constructor` and `prototype`, numbers that are not
 * safe integers (the protocol has no fractions), lone surrogates, nesting beyond a depth limit,
 * and anything after the value. Objects come back with a null prototype.
 */

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DEPTH = 16;

class Parser {
  private i = 0;

  constructor(private readonly s: string) {}

  fail(): never {
    throw new SyntaxError(`strict JSON: invalid input at ${this.i}`);
  }

  ws(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) this.i++;
      else break;
    }
  }

  value(depth: number): JsonValue {
    if (depth > MAX_DEPTH) this.fail();
    this.ws();
    const c = this.s[this.i];
    if (c === "{") return this.object(depth);
    if (c === "[") return this.array(depth);
    if (c === '"') return this.string();
    if (c === "t") return this.literal("true", true);
    if (c === "f") return this.literal("false", false);
    if (c === "n") return this.literal("null", null);
    return this.number();
  }

  literal<T>(word: string, v: T): T {
    if (this.s.startsWith(word, this.i)) {
      this.i += word.length;
      return v;
    }
    return this.fail();
  }

  number(): number {
    // Integers only: -?(0|[1-9][0-9]*). No fraction, no exponent.
    const m = /^-?(0|[1-9][0-9]*)/.exec(this.s.slice(this.i, this.i + 24));
    if (!m) this.fail();
    const next = this.s[this.i + m[0].length];
    if (next === "." || next === "e" || next === "E") this.fail();
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n) || Object.is(n, -0)) this.fail();
    this.i += m[0].length;
    return n;
  }

  string(): string {
    this.i++; // opening quote
    let out = "";
    for (;;) {
      if (this.i >= this.s.length) this.fail();
      const c = this.s.charCodeAt(this.i);
      if (c === 0x22) {
        this.i++;
        break;
      }
      if (c < 0x20) this.fail();
      if (c === 0x5c) {
        const e = this.s[this.i + 1];
        this.i += 2;
        if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else if (e === "/") out += "/";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "u") {
          const hex = this.s.slice(this.i, this.i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail();
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
        } else this.fail();
        continue;
      }
      out += this.s[this.i];
      this.i++;
    }
    // With the u flag a paired surrogate is one code point, so only a lone half matches.
    if (/[\uD800-\uDFFF]/u.test(out)) this.fail();
    return out;
  }

  object(depth: number): { [key: string]: JsonValue } {
    this.i++;
    const out = Object.create(null) as { [key: string]: JsonValue };
    const seen = new Set<string>();
    this.ws();
    if (this.s[this.i] === "}") {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail();
      const key = this.string();
      if (seen.has(key) || FORBIDDEN_KEYS.has(key)) this.fail();
      seen.add(key);
      this.ws();
      if (this.s[this.i] !== ":") this.fail();
      this.i++;
      out[key] = this.value(depth + 1);
      this.ws();
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      if (this.s[this.i] === "}") {
        this.i++;
        return out;
      }
      this.fail();
    }
  }

  array(depth: number): JsonValue[] {
    this.i++;
    const out: JsonValue[] = [];
    this.ws();
    if (this.s[this.i] === "]") {
      this.i++;
      return out;
    }
    for (;;) {
      out.push(this.value(depth + 1));
      this.ws();
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      if (this.s[this.i] === "]") {
        this.i++;
        return out;
      }
      this.fail();
    }
  }

  parse(): JsonValue {
    const v = this.value(0);
    this.ws();
    if (this.i !== this.s.length) this.fail();
    return v;
  }
}

/** Parses strict JSON; undefined when the input breaks any rule. */
export function parseStrictJson(text: string): JsonValue | undefined {
  try {
    return new Parser(text).parse();
  } catch {
    return undefined;
  }
}

export function isObject(v: JsonValue | undefined): v is { [key: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when the object has exactly these required keys plus, optionally, these optional keys. */
export function hasExactKeys(
  obj: { [key: string]: JsonValue },
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(obj);
  for (const k of required) if (!(k in obj)) return false;
  for (const k of keys) if (!required.includes(k) && !optional.includes(k)) return false;
  return true;
}
