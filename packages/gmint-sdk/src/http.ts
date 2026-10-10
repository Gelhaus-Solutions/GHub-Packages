/**
 * A minimal HTTP/1.1 exchange on an existing TLS socket: one request, one response, then the
 * connection closes. The SDK must send on the very connection whose exporter it signed, and
 * node:http will not write onto a socket that is already connected, so this is written out:
 * a status line, headers, a Content-Length body, hard caps on every part.
 */

import type { TLSSocket } from "node:tls";

const MAX_HEADER_BYTES = 8 * 1024;
const MAX_BODY_BYTES = 64 * 1024;

export interface HttpResponse {
  status: number;
  contentType: string;
  body: string;
}

export function postOnSocket(
  socket: TLSSocket,
  host: string,
  path: string,
  contentType: string,
  body: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), timeoutMs);

    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) {
        if (buf.length > MAX_HEADER_BYTES)
          done(() => reject(new Error("response headers too large")));
        return;
      }
      const head = buf.subarray(0, end).toString("latin1");
      const [statusLine, ...lines] = head.split("\r\n");
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine ?? "");
      if (!m) return done(() => reject(new Error("malformed response")));
      const headers = new Map<string, string>();
      for (const line of lines) {
        const i = line.indexOf(":");
        if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
      }
      if (headers.has("transfer-encoding"))
        return done(() => reject(new Error("chunked responses are not accepted")));
      const length = Number(headers.get("content-length") ?? "-1");
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BODY_BYTES)
        return done(() => reject(new Error("bad content-length")));
      if (buf.length - end - 4 < length) return;
      const status = Number(m[1]);
      const text = buf.subarray(end + 4, end + 4 + length).toString("utf8");
      done(() => resolve({ status, contentType: headers.get("content-type") ?? "", body: text }));
    });
    socket.on("error", (e) => done(() => reject(e)));
    socket.on("close", () => done(() => reject(new Error("connection closed before a response"))));

    const bytes = Buffer.from(body, "utf8");
    socket.write(
      `POST ${path} HTTP/1.1\r\nHost: ${host}\r\nContent-Type: ${contentType}\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n\r\n`,
    );
    socket.write(bytes);
  });
}
