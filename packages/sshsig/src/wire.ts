/**
 * The SSH wire encoding (RFC 4251 section 5): big-endian uint32 lengths in front of byte
 * strings. A reader that refuses to run past the end, so a truncated or padded blob is an
 * error instead of a short read.
 */

export class WireReader {
  private offset = 0;

  constructor(private readonly buf: Uint8Array) {}

  /** A length-prefixed byte string, or null when the buffer is too short. */
  string(): Uint8Array | null {
    const len = this.uint32();
    if (len === null || this.offset + len > this.buf.length) return null;
    const out = this.buf.subarray(this.offset, this.offset + len);
    this.offset += len;
    return out;
  }

  /**
   * A non-negative mpint as its big-endian magnitude (empty for zero), or null when it is
   * negative or not minimally encoded: no leading zero byte except the one a set top bit needs.
   */
  mpint(): Uint8Array | null {
    const bytes = this.string();
    if (!bytes) return null;
    if (bytes.length === 0) return bytes;
    if ((bytes[0]! & 0x80) !== 0) return null;
    if (bytes[0] !== 0) return bytes;
    return bytes.length > 1 && (bytes[1]! & 0x80) !== 0 ? bytes.subarray(1) : null;
  }

  uint32(): number | null {
    if (this.offset + 4 > this.buf.length) return null;
    const b = this.buf;
    const o = this.offset;
    this.offset += 4;
    return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  }

  byte(): number | null {
    if (this.offset + 1 > this.buf.length) return null;
    return this.buf[this.offset++]!;
  }

  raw(len: number): Uint8Array | null {
    if (this.offset + len > this.buf.length) return null;
    const out = this.buf.subarray(this.offset, this.offset + len);
    this.offset += len;
    return out;
  }

  /** True when every byte has been consumed. Callers reject trailing bytes. */
  done(): boolean {
    return this.offset === this.buf.length;
  }
}

export function wireString(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

/** A non-negative big-endian integer as a minimal mpint, the encoding `WireReader.mpint` takes. */
export function wireMpint(magnitude: Uint8Array): Uint8Array {
  let i = 0;
  while (i < magnitude.length && magnitude[i] === 0) i++;
  const value = magnitude.subarray(i);
  return wireString(
    value.length > 0 && (value[0]! & 0x80) !== 0 ? concat(new Uint8Array([0]), value) : value,
  );
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function utf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
