/**
 * Channel binding: the TLS exporter value of RFC 9266 (`tls-exporter`), 32 bytes with the
 * label `EXPORTER-Channel-Binding` and an empty context. Both ends of one TLS 1.3 connection
 * compute the same value; any other connection, including a resumed one, computes a different
 * one. A signed request that carries it is useless on any connection but its own.
 *
 * TLS 1.3 only. RFC 9266 asks for an empty context; in TLS 1.3 an absent and an empty context
 * give the same exporter anyway (RFC 8446 section 7.5), which the tests check.
 */

import type { TLSSocket } from "node:tls";

export const CHANNEL_BINDING_LABEL = "EXPORTER-Channel-Binding";
export const CHANNEL_BINDING_LENGTH = 32;

/** The connection's tls-exporter value, or null if it is not a TLS 1.3 connection. */
export function channelBinding(socket: TLSSocket): Uint8Array | null {
  if (socket.getProtocol() !== "TLSv1.3") return null;
  const value = socket.exportKeyingMaterial(
    CHANNEL_BINDING_LENGTH,
    CHANNEL_BINDING_LABEL,
    Buffer.alloc(0),
  );
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
