/**
 * The one way this package talks to GPlatform Terms: a request with the
 * product's key and a deadline, and a refusal read into something a caller can
 * branch on.
 *
 * Every request has a deadline. A product asks at its gate and at an accept
 * step, with a person waiting, and a service that accepts the connection and
 * then says nothing would otherwise hold that person for as long as the
 * operating system lets a socket hang.
 */

/** What `fetch` this package calls. The global one unless a caller passes
 *  another, which tests do. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * A request GPlatform Terms did not answer with what was asked for.
 *
 * `status` is null where no answer came at all: the connection was refused,
 * the deadline passed, the name did not resolve. `code` is the service's own
 * stable refusal code (`subject.unknown`, `consent.unreadable`) where it sent
 * one, and is what a caller branches on; the message is for a person.
 */
export class TermsApiError extends Error {
  override readonly name: string = "TermsApiError";

  constructor(
    readonly status: number | null,
    readonly code: string | null,
    message: string,
    readonly detail: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
  }
}

/** One answer, read whole. The body is kept as text, because the snapshot's
 *  bytes are what its signature covers and a parsed copy is not. */
export interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

export interface HttpOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
}

/** The base URL with no trailing slash, refused unless it is http or https. */
export function baseUrlOf(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`baseUrl ${JSON.stringify(value)} is not a URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError(`baseUrl ${JSON.stringify(value)} is not http or https.`);
  }
  return url.href.replace(/\/+$/u, "");
}

/**
 * Sends one request to `/api/<path>` and returns the answer, whatever its
 * status. Throws a TermsApiError with a null status only where nothing came
 * back.
 */
export async function send(
  http: HttpOptions,
  method: "GET" | "PUT" | "POST",
  path: string,
  options: { readonly json?: string; readonly headers?: Record<string, string> } = {},
): Promise<Answer> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${http.apiKey}`,
    ...options.headers,
  };
  const body = options.json;
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await http.fetch(`${http.baseUrl}/api/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(http.timeoutMs),
    });
  } catch (error) {
    const reason =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? `no answer within ${String(http.timeoutMs)} ms`
        : `${(error as Error).message ?? String(error)}${causeOf(error)}`;
    throw new TermsApiError(null, null, `GPlatform Terms could not be reached: ${reason}.`);
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new TermsApiError(
      null,
      null,
      `GPlatform Terms answered ${String(response.status)} and the body broke off: ${(error as Error).message}.`,
    );
  }
  return { status: response.status, headers: response.headers, text };
}

/** Node's fetch says only "fetch failed" and keeps the reason in `cause`. */
function causeOf(error: unknown): string {
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return ` (${typeof code === "string" ? code : cause.message})`;
  }
  return "";
}

/** The answer's body as JSON, or a TermsApiError naming what was asked. */
export function jsonOf(answer: Answer, what: string): unknown {
  try {
    return JSON.parse(answer.text) as unknown;
  } catch {
    throw new TermsApiError(
      answer.status,
      null,
      `GPlatform Terms answered ${what} with ${String(answer.status)} and a body that is not JSON.`,
    );
  }
}

/** A refusal read into a TermsApiError: the service's code and message where
 *  it sent its usual shape, the status alone where it did not. */
export function refusalOf(answer: Answer, what: string): TermsApiError {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(answer.text) as unknown;
  } catch {
    // A proxy's HTML error page, or nothing at all: the status is all there is.
  }
  if (typeof parsed === "object" && parsed !== null) {
    const { code, message, detail } = parsed as Record<string, unknown>;
    if (typeof code === "string" && typeof message === "string") {
      return new TermsApiError(
        answer.status,
        code,
        `GPlatform Terms refused ${what} (${String(answer.status)} ${code}): ${message}`,
        typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>) : null,
      );
    }
  }
  return new TermsApiError(
    answer.status,
    null,
    `GPlatform Terms answered ${what} with ${String(answer.status)}.`,
  );
}
