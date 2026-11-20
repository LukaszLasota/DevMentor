import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { ServiceUnavailableError } from './errors';
import { createFetchJson, DEFAULT_OUTBOUND_TIMEOUT_MS } from './outbound';

const URL_WITH_SECRET = 'https://api.example.test/user/emails?code=secret-code';

function setup(impl: (input: URL, init: RequestInit) => Promise<Response>) {
  const logger = { warn: vi.fn() };
  const fetchMock = vi.fn(impl);
  const fetchJson = createFetchJson({ logger: logger as unknown as Logger, fetch: fetchMock as unknown as typeof fetch });

  return { fetchJson, fetchMock, logger };
}

function loggedText(logger: { warn: ReturnType<typeof vi.fn> }): string {
  return JSON.stringify(logger.warn.mock.calls, (_key, value: unknown) =>
    value instanceof Error ? `${value.name}: ${value.message}` : value,
  );
}

describe('fetchJson', () => {
  it('returns the parsed JSON of a 2xx response and asks for JSON', async () => {
    const { fetchJson, fetchMock } = setup(async () => Response.json({ id: 7 }));

    await expect(fetchJson<{ id: number }>(URL_WITH_SECRET)).resolves.toEqual({ id: 7 });

    const [target, init] = fetchMock.mock.calls[0];
    expect(target.href).toBe(URL_WITH_SECRET);
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the caller method, body and accept header', async () => {
    const { fetchJson, fetchMock } = setup(async () => Response.json({}));

    await fetchJson(new URL('https://api.example.test/token'), {
      method: 'POST',
      body: '{"a":1}',
      headers: { accept: 'application/vnd.github+json' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('accept')).toBe('application/vnd.github+json');
  });

  it('maps a non-2xx response to 503 and logs the status without query or body', async () => {
    const { fetchJson, logger } = setup(async () => new Response('{"error":"bad_verification_code"}', { status: 502 }));

    await expect(fetchJson(URL_WITH_SECRET, { method: 'POST', body: 'client_secret=s3cret' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        upstream: { method: 'POST', url: 'https://api.example.test/user/emails', status: 502 },
      }),
      'Outbound request failed',
    );
    const text = loggedText(logger);
    expect(text).toContain('responded 502');
    expect(text).not.toMatch(/secret|bad_verification_code/);
  });

  it('maps a non-2xx response without a body to 503', async () => {
    const { fetchJson } = setup(async () => new Response(null, { status: 404 }));

    await expect(fetchJson(URL_WITH_SECRET)).rejects.toMatchObject({ status: 503 });
  });

  it('keeps the upstream status when releasing the error body fails', async () => {
    // An errored body stream (e.g. the timeout fired after the headers) rejects `cancel()` with its
    // stored error; that must not replace the 503 with a raw error.
    const body = new ReadableStream({
      start(controller) {
        controller.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      },
    });
    const { fetchJson, logger } = setup(async () => new Response(body, { status: 502 }));

    await expect(fetchJson(URL_WITH_SECRET)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ upstream: { method: 'GET', url: 'https://api.example.test/user/emails', status: 502 } }),
      'Outbound request failed',
    );
    expect(loggedText(logger)).toContain('responded 502');
  });

  it('maps a network failure to 503', async () => {
    const { fetchJson, logger } = setup(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(fetchJson(URL_WITH_SECRET)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ upstream: { method: 'GET', url: 'https://api.example.test/user/emails', status: undefined } }),
      'Outbound request failed',
    );
  });

  it('maps an unparsable body to 503', async () => {
    const { fetchJson } = setup(async () => new Response('<html>', { status: 200 }));

    await expect(fetchJson(URL_WITH_SECRET)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  function hangingFetch(_input: URL, init: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      if (init.signal?.aborted) reject(init.signal.reason);
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  }

  it(`times out after ${DEFAULT_OUTBOUND_TIMEOUT_MS} ms by default`, async () => {
    // AbortSignal.timeout runs on Node's internal timers, which vi.useFakeTimers() does not control.
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError')));
    const { fetchJson, logger } = setup(hangingFetch);

    await expect(fetchJson(URL_WITH_SECRET)).rejects.toBeInstanceOf(ServiceUnavailableError);

    expect(timeout).toHaveBeenCalledWith(DEFAULT_OUTBOUND_TIMEOUT_MS);
    expect(loggedText(logger)).toContain('TimeoutError');
    timeout.mockRestore();
  });

  it('honours timeoutMs and a caller abort signal', async () => {
    const { fetchJson } = setup(hangingFetch);

    await expect(fetchJson(URL_WITH_SECRET, { timeoutMs: 20 })).rejects.toBeInstanceOf(ServiceUnavailableError);

    const controller = new AbortController();
    const aborted = expect(fetchJson(URL_WITH_SECRET, { signal: controller.signal })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    controller.abort();
    await aborted;
  });

  it('uses the global fetch by default', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: 1 }));
    const fetchJson = createFetchJson({ logger: { warn: vi.fn() } as unknown as Logger });

    await expect(fetchJson('https://api.example.test/x')).resolves.toEqual({ ok: 1 });
    globalFetch.mockRestore();
  });

  describe('withStatus', () => {
    it('resolves a non-2xx response with its status and parsed body instead of throwing', async () => {
      const { fetchJson, logger } = setup(async () =>
        Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 }),
      );

      await expect(fetchJson(URL_WITH_SECRET, { method: 'POST', withStatus: true })).resolves.toEqual({
        status: 404,
        body: { error: { type: 'invalid_request_error', code: 'resource_missing' } },
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('resolves a 2xx response with its status and body', async () => {
      const { fetchJson, fetchMock } = setup(async () => Response.json({ id: 'cs_1' }));

      await expect(fetchJson(URL_WITH_SECRET, { withStatus: true })).resolves.toEqual({ status: 200, body: { id: 'cs_1' } });
      expect(new Headers(fetchMock.mock.calls[0][1].headers).get('accept')).toBe('application/json');
    });

    it('gives a null body for an empty, non-JSON or unreadable body', async () => {
      const empty = setup(async () => new Response(null, { status: 500 }));
      await expect(empty.fetchJson(URL_WITH_SECRET, { withStatus: true })).resolves.toEqual({ status: 500, body: null });

      const html = setup(async () => new Response('<html>', { status: 502 }));
      await expect(html.fetchJson(URL_WITH_SECRET, { withStatus: true })).resolves.toEqual({ status: 502, body: null });

      const errored = new ReadableStream({
        start(controller) {
          controller.error(new Error('stream broke'));
        },
      });
      const broken = setup(async () => new Response(errored, { status: 200 }));
      await expect(broken.fetchJson(URL_WITH_SECRET, { withStatus: true })).resolves.toEqual({ status: 200, body: null });
    });

    it('still throws 503 on a network failure', async () => {
      const { fetchJson } = setup(async () => {
        throw new TypeError('fetch failed');
      });

      await expect(fetchJson(URL_WITH_SECRET, { withStatus: true })).rejects.toBeInstanceOf(ServiceUnavailableError);
    });
  });
});
