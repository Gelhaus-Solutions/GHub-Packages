/**
 * A stand-in for GPlatform Terms' product API, over real HTTP on a local port,
 * so the client's tests go through fetch, timeouts and refused connections the
 * way a product's would. It can be stopped and started again on the same
 * port, which is the case the client exists for.
 *
 * It keeps what the service keeps that the client depends on: subjects, a
 * ledger idempotent on the request reference, an acceptance refused for an
 * account it was not told of or for an identifier it cannot read, the state
 * decided by the rules from the newest ledger row, and the snapshot with its
 * signature and ETag. It is not the service, and the service's own tests are
 * the authority on what the service does.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { bind, parseSnapshot } from "@ghub/terms-rules";
import type { Signed } from "./snapshots.js";

export const API_KEY = "gpt_prod_test";

interface Row {
  readonly seq: number;
  readonly surface: string;
  readonly accountId: string;
  readonly recorded: string;
  readonly acceptedAt: string;
  readonly requestRef: string;
  readonly body: string;
}

export interface FakeTerms {
  readonly url: string;
  readonly subjects: Map<string, Record<string, unknown>>;
  readonly ledger: Row[];
  /** Every request, as `METHOD path`. */
  readonly requests: string[];
  /** The next requests answered with this instead, oldest first. */
  readonly refusals: { status: number; code: string; message: string }[];
  serve(snapshot: Signed, serial: number): void;
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function refuse(response: ServerResponse, status: number, code: string, message: string): void {
  reply(response, status, { statusCode: status, code, message });
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function fakeTerms(): Promise<FakeTerms> {
  let served: { snapshot: Signed; serial: number } | null = null;
  const subjects = new Map<string, Record<string, unknown>>();
  const ledger: Row[] = [];
  const requests: string[] = [];
  const refusals: { status: number; code: string; message: string }[] = [];
  let port = 0;
  let server: Server | null = null;

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    requests.push(`${request.method ?? "?"} ${path}`);
    if (request.headers.authorization !== `Bearer ${API_KEY}`) {
      refuse(response, 401, "auth.required", "This takes a product's API key.");
      return;
    }
    const refusal = refusals.shift();
    if (refusal !== undefined) {
      refuse(response, refusal.status, refusal.code, refusal.message);
      return;
    }
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    // /api/v1/snapshot
    if (request.method === "GET" && path === "/api/v1/snapshot") {
      if (served === null) {
        refuse(response, 404, "not-found", "No snapshot yet.");
        return;
      }
      const etag = `"s${String(served.serial)}"`;
      response.setHeader("ETag", etag);
      response.setHeader("X-Snapshot-Signature", JSON.stringify(served.snapshot.signature));
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(served.snapshot.text);
      return;
    }
    // /api/v1/subjects/{surface}/{accountId}
    if (request.method === "PUT" && parts.length === 5 && parts[2] === "subjects") {
      const key = `${parts[3]}/${parts[4]}`;
      const before = subjects.get(key);
      subjects.set(key, JSON.parse(await bodyOf(request)) as Record<string, unknown>);
      reply(response, 200, {
        subject: { surface: parts[3], accountId: parts[4] },
        outcome: before === undefined ? "created" : "changed",
      });
      return;
    }
    // /api/v1/consents
    if (request.method === "POST" && path === "/api/v1/consents") {
      const text = await bodyOf(request);
      const input = JSON.parse(text) as Record<string, string>;
      const surface = input["surface"] ?? "";
      const accountId = input["accountId"] ?? "";
      if (!subjects.has(`${surface}/${accountId}`)) {
        refuse(response, 404, "subject.unknown", `No account ${accountId} on ${surface}.`);
        return;
      }
      const first = ledger.find((row) => row.requestRef === input["requestRef"]);
      if (first !== undefined) {
        if (first.body !== text) {
          refuse(response, 409, "consent.replay-differs", "Reference already used.");
          return;
        }
        reply(response, 200, { consent: view(first), outcome: "replayed" });
        return;
      }
      const recorded = input["recorded"] ?? "";
      const known = new Set(
        served === null ? [] : parsedOf(served).versions.map((v) => v.versionId),
      );
      if (!recorded.split("+").every((id) => known.has(id))) {
        refuse(response, 422, "consent.unreadable", `${recorded} does not resolve.`);
        return;
      }
      const row: Row = {
        seq: ledger.length + 1,
        surface,
        accountId,
        recorded,
        acceptedAt: input["acceptedAt"] ?? "",
        requestRef: input["requestRef"] ?? "",
        body: text,
      };
      ledger.push(row);
      reply(response, 201, { consent: view(row), outcome: "recorded" });
      return;
    }
    // /api/v1/state/{surface}/{accountId}
    if (request.method === "GET" && parts.length === 5 && parts[2] === "state") {
      const [surface, accountId] = [parts[3] ?? "", parts[4] ?? ""];
      const subject = subjects.get(`${surface}/${accountId}`);
      if (subject === undefined || served === null) {
        refuse(response, 404, "subject.unknown", `No account ${accountId} on ${surface}.`);
        return;
      }
      const at = new Date(url.searchParams.get("at") ?? new Date().toISOString());
      const terms = bind(parsedOf(served));
      const recorded =
        ledger.filter((row) => row.surface === surface && row.accountId === accountId).at(-1)
          ?.recorded ?? null;
      const state = terms.consentStateAt(surface, recorded, at, {
        paid: subject["paid"] === true,
        staff: subject["staff"] === true,
      });
      reply(response, 200, {
        surface,
        accountId,
        at: at.toISOString(),
        snapshot: served.serial,
        state:
          state.kind === "asked"
            ? { kind: "asked", inForceFrom: state.inForceFrom.toISOString() }
            : { kind: state.kind },
        recorded,
        toRecord: terms.versionToRecord(surface, at),
        documents: terms.documentStandings(surface, recorded, at).map((one) => ({
          document: one.document,
          audience: one.audience,
          kind: one.kind,
          accepted: one.accepted?.versionId ?? null,
          inForce: one.inForce?.versionId ?? null,
          toRecord: one.toRecord?.versionId ?? null,
          acceptBy: one.acceptBy?.toISOString() ?? null,
        })),
        links: null,
        announcements: terms.announcementsDue(surface, at).map((one) => ({
          versionId: one.versionId,
          inForceFrom: one.inForceFrom.toISOString(),
          ...(one.summary === undefined ? {} : { summary: one.summary }),
        })),
        objections: [],
        addedLater: "a field this client does not know",
      });
      return;
    }
    // /api/v1/subjects/{surface}/{accountId}/record
    if (request.method === "GET" && parts.length === 6 && parts[5] === "record") {
      const [surface, accountId] = [parts[3] ?? "", parts[4] ?? ""];
      if (!subjects.has(`${surface}/${accountId}`)) {
        refuse(response, 404, "subject.unknown", `No account ${accountId} on ${surface}.`);
        return;
      }
      reply(response, 200, {
        subject: { surface, accountId },
        consents: ledger
          .filter((row) => row.surface === surface && row.accountId === accountId)
          .map(view),
        notices: [],
        objections: [],
      });
      return;
    }
    refuse(response, 404, "not-found", `No route ${path}.`);
  };

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      const next = createServer((request, response) => {
        handle(request, response).catch((error: unknown) => {
          refuse(response, 500, "internal", (error as Error).message);
        });
      });
      next.once("error", reject);
      next.listen(port, "127.0.0.1", () => {
        port = (next.address() as AddressInfo).port;
        server = next;
        resolve();
      });
    });
  const stop = () =>
    new Promise<void>((resolve) => {
      if (server === null) {
        resolve();
        return;
      }
      server.closeAllConnections();
      server.close(() => resolve());
      server = null;
    });

  await listen();
  return {
    url: `http://127.0.0.1:${String(port)}`,
    subjects,
    ledger,
    requests,
    refusals,
    serve(snapshot, serial) {
      served = { snapshot, serial };
    },
    stop,
    start: listen,
    close: stop,
  };
}

const parsed = new WeakMap<object, ReturnType<typeof parseSnapshot>>();
function parsedOf(served: { snapshot: Signed }) {
  let snapshot = parsed.get(served.snapshot);
  if (snapshot === undefined) {
    snapshot = parseSnapshot(JSON.parse(served.snapshot.text));
    parsed.set(served.snapshot, snapshot);
  }
  return snapshot;
}

function view(row: Row) {
  return {
    seq: row.seq,
    surface: row.surface,
    recorded: row.recorded,
    versionIds: row.recorded.split("+"),
    acceptedAt: row.acceptedAt,
    recordedAt: row.acceptedAt,
    source: "accept-screen",
    requestRef: row.requestRef,
    ip: null,
    userAgent: null,
    evidenceHash: "e".repeat(64),
    recordedBy: null,
    how: null,
    reference: null,
    rowHash: "f".repeat(64),
  };
}
