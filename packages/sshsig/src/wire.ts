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
