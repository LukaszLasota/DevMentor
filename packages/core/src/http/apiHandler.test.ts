import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import { logger } from '../logger';
import { apiHandler, withCookies } from './apiHandler';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { AppError, NotFoundError, TooManyRequestsError, ValidationError } from './errors';

const cradle = { marker: 'test-cradle' } as unknown as Cradle;

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: Cradle) => Promise<T>) => fn(cradle),
}));

const noParams = { params: Promise.resolve({}) };

function request(method = 'GET', headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test?x=1', { method, headers });
}

describe('apiHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps the result in a success envelope and passes the scoped cradle', async () => {
    const handler = vi.fn(async () => ({ hello: 'world' }));

    const res = await apiHandler(handler)(request(), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { hello: 'world' } });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cradle, params: {} }));
  });

  it('uses the configured success status', async () => {
    const res = await apiHandler(async () => 'made', { successStatus: 201 })(
      request('POST', { [CSRF_HEADER]: CSRF_HEADER_VALUE }),
      noParams,
    );

    expect(res.status).toBe(201);
  });

  it('maps an AppError to its status and code', async () => {
    const res = await apiHandler(async () => {
      throw new NotFoundError('No such booking.');
    })(request(), noParams);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'No such booking.' } });
  });

  it('includes field errors for a ValidationError', async () => {
    const res = await apiHandler(async () => {
      throw new ValidationError('Invalid request.', { email: ['Required'] });
    })(request(), noParams);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', fieldErrors: { email: ['Required'] } },
    });
  });

  it('sends Retry-After and retryAfterSeconds for a TooManyRequestsError, also from another bundle', async () => {
    vi.resetModules();
    const foreign = await import('./errors');

    for (const error of [new TooManyRequestsError(90), new foreign.TooManyRequestsError(90)]) {
      const res = await apiHandler(async () => {
        throw error;
      })(request('POST', { [CSRF_HEADER]: CSRF_HEADER_VALUE }), noParams);

      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('90');
      expect(await res.json()).toEqual({
        ok: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.', retryAfterSeconds: 90 },
      });
    }
  });

  it('copies the headers of any AppError onto the error response', async () => {
    class TeapotError extends AppError {
      override readonly headers = { 'x-teapot': 'short' };
    }

    const res = await apiHandler(async () => {
      throw new TeapotError(418, 'TEAPOT', 'Short and stout.');
    })(request(), noParams);

    expect(res.headers.get('x-teapot')).toBe('short');
    expect(await res.json()).toEqual({ ok: false, error: { code: 'TEAPOT', message: 'Short and stout.' } });
  });

  // Regression: under `next dev` the container (and its services) came from another server bundle,
  // so a service's AppError was not `instanceof` this module's AppError and became a 500.
  it('maps AppErrors from another copy of the errors module (another server bundle)', async () => {
    vi.resetModules();
    const foreign = await import('./errors');
    expect(foreign.AppError).not.toBe(AppError);

    const notFound = await apiHandler(async () => {
      throw new foreign.NotFoundError('No such booking.');
    })(request(), noParams);
    const invalid = await apiHandler(async () => {
      throw new foreign.ValidationError('Invalid request.', { email: ['Required'] });
    })(request(), noParams);

    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'No such booking.' } });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.fieldErrors).toEqual({ email: ['Required'] });
  });

  it('maps a ZodError thrown by the handler to a 400 with field errors', async () => {
    const res = await apiHandler(async () => z.object({ name: z.string() }).parse({}))(request(), noParams);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.fieldErrors)).toEqual(['name']);
  });

  it('hides unexpected errors from the client and logs them with context', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await apiHandler(async () => {
      throw new Error('db password=secret leaked');
    })(request(), noParams);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/test' }),
      'Unhandled API error',
    );
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s without the CSRF header', async (method) => {
    const handler = vi.fn(async () => 'never');

    const res = await apiHandler(handler)(request(method), noParams);

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows GET without the CSRF header', async () => {
    const res = await apiHandler(async () => 'ok')(request('GET'), noParams);

    expect(res.status).toBe(200);
  });

  it('skips the CSRF check when disabled (third-party webhooks)', async () => {
    const res = await apiHandler(async () => 'ok', { csrf: false })(request('POST'), noParams);

    expect(res.status).toBe(200);
  });

  it('resolves route params', async () => {
    const handler = vi.fn(async ({ params }: { params: { id: string } }) => params.id);

    const res = await apiHandler(handler)(request(), { params: Promise.resolve({ id: 'abc' }) });

    expect(await res.json()).toEqual({ ok: true, data: 'abc' });
  });

  it('sets each cookie from withCookies and keeps the envelope', async () => {
    const res = await apiHandler(async () => withCookies({ user: 'u1' }, ['a=1; Path=/', 'b=2; Path=/']), {
      successStatus: 201,
    })(request('POST', { [CSRF_HEADER]: CSRF_HEADER_VALUE }), noParams);

    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(await res.json()).toEqual({ ok: true, data: { user: 'u1' } });
  });

  it('sets no cookie for plain results, including objects and null', async () => {
    for (const data of [{ data: 'looks-like-a-wrapper' }, null]) {
      const res = await apiHandler(async () => data)(request(), noParams);

      expect(res.headers.getSetCookie()).toEqual([]);
      expect(await res.json()).toEqual({ ok: true, data });
    }
  });
  describe('headers option', () => {
    const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

    it.each<[string, () => Promise<unknown>]>([
      ['a plain result', async () => 'ok'],
      ['a result with cookies', async () => withCookies('ok', ['a=1; Path=/'])],
    ])('adds the headers to the success response of %s', async (_label, handler) => {
      const res = await apiHandler(handler, { headers })(request(), noParams);

      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('adds the headers to error responses, next to the error\'s own headers', async () => {
      const res = await apiHandler(
        async () => {
          throw new TooManyRequestsError(90);
        },
        { headers },
      )(request(), noParams);

      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('90');
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('adds the headers to the CSRF refusal', async () => {
      const res = await apiHandler(async () => 'ok', { headers })(request('POST'), noParams);

      expect(res.status).toBe(403);
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });
  });
});
