import type { Logger } from '../logger';
import { ServiceUnavailableError } from './errors';

export const DEFAULT_OUTBOUND_TIMEOUT_MS = 10_000;

export type FetchJsonInit = RequestInit & { timeoutMs?: number };

/** What `fetchJson` resolves with under `withStatus: true`: any HTTP status, body unchecked. */
export interface UpstreamResponse {
  status: number;
  /** The parsed JSON body, or `null` when the body is empty or not JSON. */
  body: unknown;
}

/**
 * JSON request to a third party (GitHub, Resend, Stripe). Resolves with the parsed body of a
 * 2xx response — unchecked: callers validate it with a Zod schema. Timeout, network failure,
 * non-2xx and an unparsable body throw `ServiceUnavailableError` (503).
 *
 * With `withStatus: true` (callers that classify upstream errors themselves, e.g. Stripe) every
 * HTTP response resolves as `{ status, body }`; only timeout and network failure still throw.
 */
export interface FetchJson {
  (url: string | URL, init: FetchJsonInit & { withStatus: true }): Promise<UpstreamResponse>;
  <T>(url: string | URL, init?: FetchJsonInit & { withStatus?: false }): Promise<T>;
}

export interface FetchJsonDeps {
  logger: Logger;
  /** Injected so tests can stub upstreams. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Builds `fetchJson`; the container registers one as the `fetchJson` singleton.
 * Logs only method, origin + path and status: never query strings (OAuth codes, secrets) or bodies.
 */
export function createFetchJson({ logger, fetch: fetchImpl = fetch }: FetchJsonDeps): FetchJson {
  async function fetchJson(
    url: string | URL,
    init: FetchJsonInit & { withStatus?: boolean } = {},
  ): Promise<unknown> {
    const { timeoutMs = DEFAULT_OUTBOUND_TIMEOUT_MS, withStatus = false, ...requestInit } = init;
    const target = new URL(url);
    const upstream = { method: requestInit.method ?? 'GET', url: `${target.origin}${target.pathname}` };
    const timeout = AbortSignal.timeout(timeoutMs);
    const headers = new Headers(requestInit.headers);

    if (!headers.has('accept')) {
      headers.set('accept', 'application/json');
    }

    const fail = (cause: unknown, status?: number): ServiceUnavailableError => {
      logger.warn({ err: cause, upstream: { ...upstream, status } }, 'Outbound request failed');

      return new ServiceUnavailableError('An upstream service is unavailable.', { cause });
    };

    let response: Response;

    try {
      response = await fetchImpl(target, {
        ...requestInit,
        headers,
        signal: requestInit.signal ? AbortSignal.any([requestInit.signal, timeout]) : timeout,
      });
    } catch (error) {
      throw fail(error);
    }

    if (withStatus) {
      const text = await response.text().catch(() => '');
      let body: unknown = null;

      try {
        body = text === '' ? null : JSON.parse(text);
      } catch {
        body = null;
      }

      return { status: response.status, body } satisfies UpstreamResponse;
    }

    if (!response.ok) {
      // Release the connection without reading the body (it may echo secrets). An errored body
      // (e.g. the timeout fired after the headers) rejects `cancel()`; the upstream status is the
      // failure to report, so a cleanup error must not replace it.
      await response.body?.cancel().catch(() => undefined);
      throw fail(new Error(`Upstream ${upstream.method} ${upstream.url} responded ${response.status}`), response.status);
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw fail(error, response.status);
    }
  }

  return fetchJson as FetchJson;
}
